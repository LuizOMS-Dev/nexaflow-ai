import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import type { FastifyInstance } from "fastify";

describe("Módulo de Deploy Admin (/admin/deploy)", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let regularUserToken: string;
  let superadminUser: any;
  let testDeploymentId: string;
  const suffix = `dep-${Date.now().toString(36)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await hashPassword("Test@Pass12345");

    // 1. Cria usuário Superadmin
    superadminUser = await prisma.user.create({
      data: {
        email: `sa-${suffix}@test.nexaflow.local`,
        name: "Superadmin Deploy Test",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });

    // 2. Cria Usuário comum
    const initialTenant = await prisma.tenant.create({
      data: {
        name: `Tenant ${suffix}`,
        slug: `tenant-${suffix}`,
        status: "ACTIVE",
      },
    });

    const regularUser = await prisma.user.create({
      data: {
        email: `reg-${suffix}@test.nexaflow.local`,
        name: "Regular User Test",
        passwordHash,
        status: "ACTIVE",
        memberships: { create: { tenantId: initialTenant.id, role: "ADMIN" } },
      },
    });

    // 3. Obtém tokens via /auth/login (com sessão válida)
    const saLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: superadminUser.email, password: "Test@Pass12345" },
    });
    expect(saLogin.statusCode).toBe(200);
    superadminToken = (saLogin.json() as { accessToken: string }).accessToken;

    const regLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: regularUser.email, password: "Test@Pass12345" },
    });
    expect(regLogin.statusCode).toBe(200);
    regularUserToken = (regLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    // Cleanup
    await prisma.deployment.deleteMany({
      where: { startedById: superadminUser.id },
    }).catch(() => {});
    await prisma.membership.deleteMany({
      where: { user: { email: { contains: suffix } } },
    }).catch(() => {});
    await prisma.tenant.deleteMany({
      where: { slug: { contains: suffix } },
    }).catch(() => {});
    await prisma.authSession.deleteMany({
      where: { user: { email: { contains: suffix } } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { email: { contains: suffix } },
    }).catch(() => {});
    await app.close();
  });

  it("1. Bloqueia acesso de usuário sem privilégio de Superadmin (HTTP 403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/status",
      headers: { authorization: `Bearer ${regularUserToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. Permite consulta de status pelo Superadmin com informações de ambiente e conexões", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/status",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.environment).toBe("production");
    expect(json.gitHub).toBeDefined();
    expect(json.easyPanel).toBeDefined();
    expect(json.gitHub.branch).toBe("main");
  });

  it("3. Retorna lista de commits do GitHub", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/commits?limit=5",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.commits)).toBe(true);
    if (json.commits.length > 0) {
      expect(json.commits[0]).toHaveProperty("sha");
      expect(json.commits[0]).toHaveProperty("shortSha");
      expect(json.commits[0]).toHaveProperty("message");
    }
  });

  it("4. Inicia novo deploy e cria registro Deployment no banco", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/deploy/start",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        commitSha: "73bd95b68fbb709d4616c56db7d35b224d1cc602",
        branch: "main",
      },
    });

    expect(res.statusCode).toBe(202);
    const json = res.json();
    expect(json.deploymentId).toBeDefined();
    expect(json.commitShortSha).toBe("73bd95b");
    testDeploymentId = json.deploymentId;

    // Valida no banco
    const dbDep = await prisma.deployment.findUnique({ where: { id: testDeploymentId } });
    expect(dbDep).toBeDefined();
    expect(dbDep?.startedById).toBe(superadminUser.id);
  });

  it("5. Lock de concorrência: bloqueia segundo deploy enquanto houver um ativo (HTTP 409)", async () => {
    // Cria um deploy em andamento no banco para testar o lock
    const activeDep = await prisma.deployment.create({
      data: {
        environment: "production",
        branch: "main",
        commitSha: "73bd95b68fbb709d4616c56db7d35b224d1cc602",
        commitShortSha: "73bd95b",
        commitMessage: "Active Deploy Lock Test",
        startedById: superadminUser.id,
        status: "BUILDING",
        startedAt: new Date(),
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/admin/deploy/start",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { branch: "main" },
    });

    expect(res.statusCode).toBe(409);
    const json = res.json();
    expect(json.message).toContain("Já existe um deploy em andamento");

    // Limpa o lock
    await prisma.deployment.delete({ where: { id: activeDep.id } });
  });

  it("6. Retorna histórico paginado de deploys", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/history?page=1&limit=10",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.items).toBeDefined();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.total).toBeGreaterThanOrEqual(1);
  });

  it("7. Retorna detalhes e logs de um deployment", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/deploy/${testDeploymentId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.id).toBe(testDeploymentId);
    expect(json.logs).toBeDefined();
    expect(typeof json.logs).toBe("string");
  });

  it("8. Rollback: permite reimplantação de versão anterior concluída", async () => {
    // Marca o deploy de teste como COMPLETED para permitir rollback
    await prisma.deployment.update({
      where: { id: testDeploymentId },
      data: { status: "COMPLETED", finishedAt: new Date(), durationSeconds: 45 },
    });

    const res = await app.inject({
      method: "POST",
      url: `/admin/deploy/${testDeploymentId}/rollback`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(202);
    const json = res.json();
    expect(json.deploymentId).toBeDefined();

    // Valida no banco
    const rollbackDep = await prisma.deployment.findUnique({ where: { id: json.deploymentId } });
    expect(rollbackDep?.isRollback).toBe(true);
    expect(rollbackDep?.rollbackFromSha).toBe("73bd95b68fbb709d4616c56db7d35b224d1cc602");

    // Limpa o rollback criado
    await prisma.deployment.delete({ where: { id: json.deploymentId } }).catch(() => {});
  });

  it("9. Segurança: nenhum token ou secret vaza nas respostas JSON", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/status",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    const raw = res.body;
    expect(raw).not.toContain("ghp_");
    expect(raw).not.toContain("EASYPANEL_API_TOKEN");
    expect(raw).not.toContain("ca13e3e9f211");
  });

  it("10. Regra de Comparação: SHA igual resulta em UP_TO_DATE e SHA diferente em UPDATE_AVAILABLE", async () => {
    // 1. Cria um deployment concluído com o MESMO SHA que o latest do GitHub
    const statusBefore = await app.inject({
      method: "GET",
      url: "/admin/deploy/status",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    const latestGhSha = (statusBefore.json() as any)?.latestGitHubCommit?.sha;

    if (latestGhSha) {
      const upToDateDep = await prisma.deployment.create({
        data: {
          environment: "production",
          branch: "main",
          commitSha: latestGhSha,
          commitShortSha: latestGhSha.slice(0, 7),
          commitMessage: "Latest deployed commit",
          startedById: superadminUser.id,
          status: "COMPLETED",
          startedAt: new Date(),
          finishedAt: new Date(),
          durationSeconds: 30,
        },
      });

      const resUp = await app.inject({
        method: "GET",
        url: "/admin/deploy/status",
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resUp.json().status).toBe("UP_TO_DATE");

      // 2. Agora altera para um SHA anterior/diferente
      await prisma.deployment.update({
        where: { id: upToDateDep.id },
        data: { commitSha: "0000000000000000000000000000000000000000", commitShortSha: "0000000" },
      });

      const resDiff = await app.inject({
        method: "GET",
        url: "/admin/deploy/status",
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resDiff.json().status).toBe("UPDATE_AVAILABLE");

      // Limpeza
      await prisma.deployment.delete({ where: { id: upToDateDep.id } });
    }
  });

  it("11. Configuração do EasyPanel: salvar criptografado, obter mascarado e testar conexão", async () => {
    // 1. Salva configuração
    const saveRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/config",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        url: "https://easypanel2.i9atendimento.com.br",
        token: "52372a0b8c6e955d7710feacfb9b3b1e786a665406872484f20dae19a70e7455",
        projectName: "i9atendimento",
        serviceName: "nexaflow",
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // 2. Consulta configuração (token NUNCA é retornado)
    const getRes = await app.inject({
      method: "GET",
      url: "/admin/deploy/config",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const json = getRes.json();
    expect(json.configured).toBe(true);
    expect(json.url).toBe("https://easypanel2.i9atendimento.com.br");
    expect(json.hasToken).toBe(true);
    expect(json.tokenPreview).toContain("••••");
    expect(getRes.body).not.toContain("52372a0b8c6e955d");

    // 3. Testa conexão com EasyPanel
    const testRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/config/test",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        url: "https://easypanel2.i9atendimento.com.br",
        projectName: "i9atendimento",
        serviceName: "nexaflow",
      },
    });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json().success).toBe(true);
    expect(testRes.json().state).toBe("CONNECTED");
  });

  it("12. Produção desconhecida: quando não há versão registrada, status é UNKNOWN", async () => {
    // Garante que não há nenhum deploy COMPLETED
    await prisma.deployment.deleteMany({
      where: { startedById: superadminUser.id },
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/deploy/status",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    if (!json.currentCommit) {
      expect(json.status).toBe("UNKNOWN");
    }
  });
}, 30_000);
