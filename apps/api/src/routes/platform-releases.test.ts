import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { buildApp } from "../app";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Módulo de Atualizações e Versões (/admin/system/releases e /changelog)", () => {
  let app: FastifyInstance;
  let superadminUser: any;
  let regularUser: any;
  let superadminToken: string;
  let regularToken: string;
  let tenantId: string;
  let createdReleaseId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("ReleasesPass123!");

    // 1. Cria Tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: `Releases Tenant ${suffix}`,
        slug: `releases-tenant-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "platform-releases" }),
      },
    });
    tenantId = tenant.id;

    // 2. Cria usuário comum / tenant
    regularUser = await prisma.user.create({
      data: {
        email: `releases-tenant-${suffix}@test.local`,
        name: "Releases Tenant User",
        passwordHash,
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    // 3. Cria usuário Superadmin
    superadminUser = await prisma.user.create({
      data: {
        email: `releases-super-${suffix}@test.local`,
        name: "Releases Superadmin",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });

    // Login Tenant
    const tenantLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `releases-tenant-${suffix}@test.local`, password: "ReleasesPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(tenantLogin.statusCode).toBe(200);
    regularToken = (tenantLogin.json() as { accessToken: string }).accessToken;

    // Login Superadmin
    const superLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `releases-super-${suffix}@test.local`, password: "ReleasesPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(superLogin.statusCode).toBe(200);
    superadminToken = (superLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    // Limpeza de dados de teste
    await prisma.userReleaseSeen.deleteMany({
      where: { userId: { in: [superadminUser?.id, regularUser?.id] } },
    }).catch(() => null);

    await prisma.platformReleaseItem.deleteMany({
      where: { release: { version: { startsWith: "9.9." } } },
    }).catch(() => null);

    await prisma.platformRelease.deleteMany({
      where: { version: { startsWith: "9.9." } },
    }).catch(() => null);

    if (tenantId) {
      await cleanupTestTenant(tenantId).catch(() => null);
    }

    await prisma.user.deleteMany({
      where: { id: { in: [superadminUser?.id, regularUser?.id] } },
    }).catch(() => null);

    await app.close();
  });

  it("1. RBAC: Bloqueia acesso de usuário comum às rotas administrativas de releases", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. Superadmin cria nova versão com SemVer válido, itens e sanitização anti-XSS", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "9.9.0",
        title: "Versão Teste 9.9.0 <script>alert('xss')</script>",
        summary: "Resumo seguro da release <iframe src='evil.com'></iframe>",
        visibility: "ALL",
        items: [
          { category: "NOVO", body: "Novo recurso de IA adicionado" },
          { category: "MELHORIA", body: "Melhoria no tempo de resposta" },
          { category: "CORREÇÃO", body: "Correção de bug no modal" },
          { category: "SEGURANÇA", body: "Hardening de autenticação" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.version).toBe("9.9.0");
    expect(body.title).toBe("Versão Teste 9.9.0"); // Script removido
    expect(body.summary).toBe("Resumo seguro da release"); // Iframe removido
    expect(body.status).toBe("DRAFT");
    expect(body.items).toHaveLength(4);
    expect(body.items[0].category).toBe("NEW");
    expect(body.items[1].category).toBe("IMPROVEMENT");
    expect(body.items[2].category).toBe("FIX");
    expect(body.items[3].category).toBe("SECURITY");

    createdReleaseId = body.id;

    // Verifica auditoria
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "release.created", entityId: body.id },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.userId).toBe(superadminUser.id);
  });

  it("3. Validação SemVer: rejeita formatos de versão inválidos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "versao-invalida",
        title: "Versão Inválida",
        items: [{ category: "NEW", body: "Item teste" }],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Informe uma versão válida, como 1.8.0.");
  });

  it("4. Validação de duplicidade: rejeita cadastro de versão já existente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "9.9.0",
        title: "Versão Duplicada",
        items: [{ category: "NEW", body: "Item duplicado" }],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain("Esta versão já está cadastrada.");
  });

  it("5. Validação de itens: rejeita release sem nenhum item válido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "9.9.1",
        title: "Versão Sem Itens",
        items: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("6. Superadmin edita a versão (atualização atômica de título, resumo e itens)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/changelog/${createdReleaseId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        title: "Versão 9.9.0 (Título Editado)",
        summary: "Resumo atualizado com sucesso",
        items: [
          { category: "NEW", body: "Item 1 atualizado" },
          { category: "FIX", body: "Item 2 adicionado" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe("Versão 9.9.0 (Título Editado)");
    expect(body.summary).toBe("Resumo atualizado com sucesso");
    expect(body.items).toHaveLength(2);

    // Auditoria
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "release.updated", entityId: createdReleaseId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).toBeDefined();
  });

  it("7. Superadmin publica a versão e usuário comum passa a visualizá-la em /changelog", async () => {
    // 1. Publica no admin
    const pubRes = await app.inject({
      method: "POST",
      url: `/admin/changelog/${createdReleaseId}/publish`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().status).toBe("PUBLISHED");

    // 2. Usuário comum consulta /changelog
    const clientRes = await app.inject({
      method: "GET",
      url: "/changelog",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(clientRes.statusCode).toBe(200);
    const clientBody = clientRes.json();
    expect(Array.isArray(clientBody.items)).toBe(true);
    const found = clientBody.items.find((r: any) => r.id === createdReleaseId);
    expect(found).toBeDefined();
    expect(found.version).toBe("9.9.0");
    expect(found.title).toBe("Versão 9.9.0 (Título Editado)");
  });

  it("8. Isolamento de Visibilidade: release SUPERADMIN JAMAIS aparece para usuário comum", async () => {
    // 1. Cria release com visibilidade SUPERADMIN
    const saRelRes = await app.inject({
      method: "POST",
      url: "/admin/changelog",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "9.9.2",
        title: "Release Interna Exclusiva Superadmin",
        visibility: "SUPERADMIN",
        items: [{ category: "SECURITY", body: "Patch interno de infraestrutura" }],
      },
    });
    expect(saRelRes.statusCode).toBe(200);
    const saRel = saRelRes.json();

    // 2. Publica a release interna
    await app.inject({
      method: "POST",
      url: `/admin/changelog/${saRel.id}/publish`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    // 3. Usuário comum busca /changelog -> NÃO DEVE ENCONTRAR
    const tenantRes = await app.inject({
      method: "GET",
      url: "/changelog",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(tenantRes.statusCode).toBe(200);
    const tenantReleases = tenantRes.json().items;
    const leak = tenantReleases.find((r: any) => r.id === saRel.id);
    expect(leak).toBeUndefined();

    // Limpeza
    await prisma.platformRelease.delete({ where: { id: saRel.id } });
  });

  it("9. Superadmin duplica uma versão existente", async () => {
    const dupRes = await app.inject({
      method: "POST",
      url: `/admin/changelog/${createdReleaseId}/duplicate`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        version: "9.9.3",
      },
    });

    expect(dupRes.statusCode).toBe(200);
    const dup = dupRes.json();
    expect(dup.version).toBe("9.9.3");
    expect(dup.title).toContain("(cópia)");
    expect(dup.status).toBe("DRAFT");
    expect(dup.items).toHaveLength(2);

    // Auditoria
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "release.duplicated", entityId: dup.id },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).toBeDefined();

    // Limpeza do rascunho duplicado
    await prisma.platformRelease.delete({ where: { id: dup.id } });
  });

  it("10. Exclusão: bloqueia exclusão de versão publicada e permite após despublicar", async () => {
    // 1. Tenta excluir enquanto PUBLISHED -> bloqueia
    const blockedRes = await app.inject({
      method: "DELETE",
      url: `/admin/changelog/${createdReleaseId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(blockedRes.statusCode).toBe(400);
    expect(blockedRes.json().error).toBe("PUBLISHED_LOCKED");

    // 2. Despublica para DRAFT
    const unpubRes = await app.inject({
      method: "POST",
      url: `/admin/changelog/${createdReleaseId}/unpublish`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(unpubRes.statusCode).toBe(200);
    expect(unpubRes.json().status).toBe("DRAFT");

    // 3. Exclui com sucesso
    const delRes = await app.inject({
      method: "DELETE",
      url: `/admin/changelog/${createdReleaseId}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().ok).toBe(true);

    // 4. Confirma exclusão no banco
    const dbRelease = await prisma.platformRelease.findUnique({ where: { id: createdReleaseId } });
    expect(dbRelease).toBeNull();
  });
});
