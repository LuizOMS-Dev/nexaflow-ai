import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { githubClient } from "../services/deploy/github-client";
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
    expect(json.message).toContain("Já existe uma implantação em andamento");

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
    // Garante que não há deploy ativo pendente
    await prisma.deployment.deleteMany({
      where: { status: { in: ["PENDING", "PREPARING", "BUILDING", "DEPLOYING", "VALIDATING"] } },
    });

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

    expect(res.statusCode).toBe(200);
    const json = res.json();
    const rawString = JSON.stringify(json);
    expect(rawString).not.toContain("ghp_");
    expect(rawString).not.toContain("github_pat_");
    expect(rawString).not.toContain("enc:v1");
  });

  it("10. Regra de Comparação: SHA igual resulta em UP_TO_DATE e SHA diferente em UPDATE_AVAILABLE", async () => {
    // Garante que não há deploy ativo pendente
    await prisma.deployment.deleteMany({
      where: { status: { in: ["PENDING", "PREPARING", "BUILDING", "DEPLOYING", "VALIDATING"] } },
    });

    // 1. Obtém o status atual do repositório
    const repoStatus = await githubClient.getRepoStatus();
    if (repoStatus.latestCommit) {
      // Simula que a produção está no mesmo SHA exato do GitHub
      const upToDateDep = await prisma.deployment.create({
        data: {
          environment: "production",
          branch: "main",
          commitSha: repoStatus.latestCommit.sha,
          commitShortSha: repoStatus.latestCommit.shortSha,
          commitMessage: repoStatus.latestCommit.message,
          commitAuthor: repoStatus.latestCommit.author,
          startedById: superadminUser.id,
          status: "COMPLETED",
          finishedAt: new Date(),
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

  it("11. Configuração do EasyPanel Write-Only: salvar criptografado, obter sem vazar token e testar conexão", async () => {
    const testSecret = "52372a0b8c6e955d7710feacfb9b3b1e786a665406872484f20dae19a70e7455";

    // 1. Salva configuração
    const saveRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/config",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        url: "https://easypanel2.i9atendimento.com.br",
        token: testSecret,
        projectName: "i9atendimento",
        serviceName: "nexaflow",
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // 2. Consulta configuração (WRITE-ONLY: token NUNCA é retornado, nem preview ou ciphertext)
    const getRes = await app.inject({
      method: "GET",
      url: "/admin/deploy/config",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers["cache-control"]).toContain("no-store");
    const json = getRes.json();
    expect(json.configured).toBe(true);
    expect(json.url).toBe("https://easypanel2.i9atendimento.com.br");
    expect(json.tokenConfigured).toBe(true);
    expect(json.token).toBeUndefined();
    expect(json.tokenPreview).toBeUndefined();
    expect(json.encryptedToken).toBeUndefined();
    expect(getRes.body).not.toContain(testSecret);
    expect(getRes.body).not.toContain("enc:v1");

    // 3. Testa conexão com EasyPanel usando o segredo salvo internamente
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

  it("13. Auditoria e Persistência: token é gravado com AES-256-GCM e nunca aparece nos AuditLogs", async () => {
    const testSecret = "52372a0b8c6e955d7710feacfb9b3b1e786a665406872484f20dae19a70e7455";

    // 1. Verifica no banco de dados que o token NÃO está em plaintext
    const setting = await prisma.platformSetting.findUnique({
      where: { key: "easypanel_config" },
    });
    expect(setting).toBeDefined();
    const rawSetting = JSON.stringify(setting?.value || {});
    expect(rawSetting).not.toContain(testSecret);
    expect((setting?.value as any).encryptedToken).toMatch(/^enc:v1:[^:]+:[^:]+:[^:]+$/);

    // 2. Verifica que nenhum AuditLog gravou o segredo
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: { startsWith: "easypanel." } },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
    for (const log of auditLogs) {
      const rawLog = JSON.stringify(log);
      expect(rawLog).not.toContain(testSecret);
    }
  });

  it("14. Limpar histórico visual de commits: limpa visualização sem alterar GitHub ou Deployments", async () => {
    // 1. Usuário comum é bloqueado (403)
    const blockedRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/commits/clear",
      headers: { authorization: `Bearer ${regularUserToken}` },
    });
    expect(blockedRes.statusCode).toBe(403);

    // 2. Superadmin executa a limpeza visual
    const clearRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/commits/clear",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().success).toBe(true);
    expect(clearRes.json().clearedAt).toBeDefined();

    // 3. Verifica que os commits anteriores não aparecem mais em GET /admin/deploy/commits
    const commitsRes = await app.inject({
      method: "GET",
      url: "/admin/deploy/commits",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(commitsRes.statusCode).toBe(200);
    expect(commitsRes.json().commits).toEqual([]);

    // 4. Verifica auditoria registrada
    const clearAudit = await prisma.auditLog.findFirst({
      where: { action: "github.update_history.cleared" },
      orderBy: { createdAt: "desc" },
    });
    expect(clearAudit).toBeDefined();
    expect(clearAudit?.userId).toBe(superadminUser.id);

    // 5. Restaura marcador para não afetar outros testes
    await prisma.platformSetting.deleteMany({
      where: { key: "github_history_cleared_at" },
    });
  });

  it("15. Semântica de Saúde: status BUILDING não pode mostrar saúde OK ou HEALTHY", async () => {
    // Cria um deployment em estado BUILDING
    const buildingDep = await prisma.deployment.create({
      data: {
        environment: "production",
        branch: "main",
        commitSha: "1111111111111111111111111111111111111111",
        commitShortSha: "1111111",
        commitMessage: "Test building stage",
        commitAuthor: "Superadmin",
        startedById: superadminUser.id,
        status: "BUILDING",
        healthStatus: "PENDING_VALIDATION",
        services: ["nexaflow"],
        startedAt: new Date(),
        logs: "Building containers...",
      },
    });

    // Consulta detalhes do deploy
    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/deploy/${buildingDep.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(detailRes.statusCode).toBe(200);
    const detailJson = detailRes.json();
    expect(detailJson.status).toBe("BUILDING");
    expect(detailJson.stage).toBe("BUILDING");
    expect(detailJson.healthStatus).toBe("PENDING_VALIDATION");
    expect(detailJson.apiHealth).toBe("PENDING");
    expect(detailJson.webHealth).toBe("PENDING");
    expect(detailJson.healthStatus).not.toBe("HEALTHY");
    expect(detailJson.healthStatus).not.toBe("OK");

    // Limpeza
    await prisma.deployment.delete({ where: { id: buildingDep.id } });
  });

  it("16. Validação independente de API e Web no Health Check pós-deploy", async () => {
    const completedDep = await prisma.deployment.create({
      data: {
        environment: "production",
        branch: "main",
        commitSha: "2222222222222222222222222222222222222222",
        commitShortSha: "2222222",
        commitMessage: "Test verified health",
        commitAuthor: "Superadmin",
        startedById: superadminUser.id,
        status: "COMPLETED",
        healthStatus: "HEALTHY",
        services: ["nexaflow"],
        startedAt: new Date(Date.now() - 60000),
        finishedAt: new Date(),
        durationSeconds: 60,
        logs: "Deploy complete.",
      },
    });

    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/deploy/${completedDep.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(detailRes.statusCode).toBe(200);
    const json = detailRes.json();
    expect(json.status).toBe("COMPLETED");
    expect(json.healthStatus).toBe("HEALTHY");
    expect(json.apiHealth).toBe("HEALTHY");
    expect(json.webHealth).toBe("HEALTHY");

    // Limpeza
    await prisma.deployment.delete({ where: { id: completedDep.id } });
  });

  it("17. Pré-checks e Imutabilidade de SHA: valida EasyPanel configurado e respeita SHA selecionado", async () => {
    // 1. Inicia deploy com SHA específico
    const customSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
    const startRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/start",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        commitSha: customSha,
        branch: "main",
      },
    });

    expect(startRes.statusCode).toBe(202);
    const startJson = startRes.json();
    expect(startJson.deploymentId).toBeDefined();
    expect(startJson.commitShortSha).toBe("a1b2c3d");

    // 2. Tentar disparar segundo deploy concorrente retorna 409 (Lock)
    const concurrentRes = await app.inject({
      method: "POST",
      url: "/admin/deploy/start",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        commitSha: "9999999999999999999999999999999999999999",
      },
    });
    expect(concurrentRes.statusCode).toBe(409);
    expect(concurrentRes.json().message).toContain("Já existe uma implantação em andamento");

    // Limpeza
    await prisma.deployment.delete({ where: { id: startJson.deploymentId } });
  });
}, 30_000);
