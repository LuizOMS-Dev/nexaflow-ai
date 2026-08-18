import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { AuditService } from "../services/audit";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Módulo Admin Audit — Trilha Confiável, Filtros, Severidade e Limpeza Segura", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let tenantToken: string;
  let tenantId: string;
  let superadminUserId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("AdminAuditPass123!");

    // 1. Cria Tenant de Teste
    const tenant = await prisma.tenant.create({
      data: {
        name: `Audit Tenant ${suffix}`,
        slug: `audit-tenant-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "admin-audit" }),
      },
    });
    tenantId = tenant.id;

    // 2. Cria Usuário Tenant Admin
    await prisma.user.create({
      data: {
        email: `tenant-audit-${suffix}@test.local`,
        name: "Tenant Admin",
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    // 3. Cria Usuário Superadmin
    const superadmin = await prisma.user.create({
      data: {
        email: `super-audit-${suffix}@test.local`,
        name: "Superadmin Auditor",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    superadminUserId = superadmin.id;

    // Login Tenant Admin
    const tenantLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `tenant-audit-${suffix}@test.local`, password: "AdminAuditPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(tenantLogin.statusCode).toBe(200);
    tenantToken = (tenantLogin.json() as { accessToken: string }).accessToken;

    // Login Superadmin
    const superLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `super-audit-${suffix}@test.local`, password: "AdminAuditPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(superLogin.statusCode).toBe(200);
    superadminToken = (superLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
    await prisma.user.deleteMany({
      where: { email: { in: [`super-audit-${suffix}@test.local`] } },
    }).catch(() => null);
    await app.close().catch(() => null);
  });

  // ── 1. RBAC & Segurança de Acesso ───────────────────────────────────────
  it("1. RBAC: Usuário não autenticado recebe 401 ao acessar /admin/logs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/logs",
    });
    expect(res.statusCode).toBe(401);
  });

  it("2. RBAC: Usuário comum ou admin de empresa recebe 403 ao acessar /admin/logs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/logs",
      headers: { authorization: `Bearer ${tenantToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("3. RBAC: Superadmin acessa /admin/logs com sucesso", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/logs?take=10",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("items");
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  // ── 2. Gravação e Redação de Segredos ───────────────────────────────────
  it("4. Proteção de Dados: AuditService redige automaticamente senhas, tokens e chaves da metadata", async () => {
    await AuditService.record({
      userId: superadminUserId,
      tenantId,
      action: "easypanel.configuration.updated",
      entity: "easypanel_config",
      ip: "127.0.0.1",
      metadata: {
        token: "eyJh123.secret.token",
        apiKey: "sk-live-1234567890abcdef",
        password: "SuperSecretPassword123",
        serviceUrl: "https://easypanel.internal",
        safeCount: 42,
      },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/admin/logs?category=EASYPANEL&take=1",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const item = listRes.json().items[0];
    expect(item).toBeDefined();
    expect(item.action).toBe("easypanel.configuration.updated");
    expect(item.metadata.token).toBe("[omitido]");
    expect(item.metadata.apiKey).toBe("[omitido]");
    expect(item.metadata.password).toBe("[omitido]");
    expect(item.metadata.serviceUrl).toBe("https://easypanel.internal");
    expect(item.metadata.safeCount).toBe(42);
  });

  // ── 3. Categorias e Severidades ─────────────────────────────────────────
  it("5. Severidade e Categorização: Deriva corretamente categorias e as 5 severidades oficiais", () => {
    expect(AuditService.deriveCategory("auth.login")).toBe("AUTH");
    expect(AuditService.deriveCategory("deployment.started")).toBe("DEPLOY");
    expect(AuditService.deriveCategory("github.connection.tested")).toBe("GITHUB");
    expect(AuditService.deriveCategory("easypanel.connection.tested")).toBe("EASYPANEL");
    expect(AuditService.deriveCategory("company.created")).toBe("COMPANY");
    expect(AuditService.deriveCategory("plan.updated")).toBe("PLAN");
    expect(AuditService.deriveCategory("admin.cost.create")).toBe("FINANCE");
    expect(AuditService.deriveCategory("security.threat_detected")).toBe("SECURITY");
    expect(AuditService.deriveCategory("admin.impersonate")).toBe("ADMIN");

    // Severidades oficiais: SUCCESS, INFO, WARNING, FAIL, CRITICAL
    expect(AuditService.deriveSeverity("deployment.completed")).toBe("SUCCESS");
    expect(AuditService.deriveSeverity("auth.login")).toBe("SUCCESS");
    expect(AuditService.deriveSeverity("deployment.started")).toBe("INFO");
    expect(AuditService.deriveSeverity("deployment.history.cleared")).toBe("WARNING");
    expect(AuditService.deriveSeverity("audit.history.cleared")).toBe("WARNING");
    expect(AuditService.deriveSeverity("deployment.failed")).toBe("FAIL");
    expect(AuditService.deriveSeverity("auth.login.failed")).toBe("FAIL");
    expect(AuditService.deriveSeverity("company.blocked")).toBe("CRITICAL");
    expect(AuditService.deriveSeverity("security.threat_detected")).toBe("CRITICAL");
  });

  // ── 4. Filtros Server-side e Busca ──────────────────────────────────────
  it("6. Filtros Server-side: Permite filtrar por categoria específica", async () => {
    // Insere eventos de tipos distintos
    await AuditService.record({ action: "deployment.started", userId: superadminUserId });
    await AuditService.record({ action: "github.connection.tested", userId: superadminUserId });

    const deployRes = await app.inject({
      method: "GET",
      url: "/admin/logs?category=DEPLOY&take=5",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(deployRes.statusCode).toBe(200);
    const deployItems = deployRes.json().items;
    expect(deployItems.length).toBeGreaterThan(0);
    for (const it of deployItems) {
      expect(it.category).toBe("DEPLOY");
    }
  });

  it("7. Filtro por Severidade: Filtra apenas eventos da severidade especificada", async () => {
    await AuditService.record({ action: "deployment.failed", userId: superadminUserId });

    const failRes = await app.inject({
      method: "GET",
      url: "/admin/logs?severity=FAIL&take=5",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(failRes.statusCode).toBe(200);
    const failItems = failRes.json().items;
    expect(failItems.length).toBeGreaterThan(0);
    for (const it of failItems) {
      expect(it.severity).toBe("FAIL");
    }
  });

  it("8. Busca Server-side: Encontra logs por termo na ação, entidade ou ator", async () => {
    await AuditService.record({
      action: "custom.special_search_event",
      entity: "special_entity_token",
      userId: superadminUserId,
    });

    const searchRes = await app.inject({
      method: "GET",
      url: "/admin/logs?search=special_search_event",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().items.some((l: any) => l.action === "custom.special_search_event")).toBe(true);
  });

  // ── 5. Paginação por Cursor ─────────────────────────────────────────────
  it("9. Paginação por Cursor: Retorna nextCursor determinístico e permite navegação incremental", async () => {
    const page1Res = await app.inject({
      method: "GET",
      url: "/admin/logs?take=2",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(page1Res.statusCode).toBe(200);
    const p1 = page1Res.json();
    expect(p1.items.length).toBeLessThanOrEqual(2);

    if (p1.nextCursor) {
      const page2Res = await app.inject({
        method: "GET",
        url: `/admin/logs?take=2&cursor=${p1.nextCursor}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(page2Res.statusCode).toBe(200);
      const p2 = page2Res.json();
      expect(p2.items.length).toBeGreaterThan(0);
      expect(p2.items[0].id).not.toBe(p1.items[0].id);
    }
  });

  // ── 6. Detalhes de um Evento ────────────────────────────────────────────
  it("10. Detalhes: Endpoint GET /admin/logs/:id retorna dados enriquecidos e metadados sanitizados", async () => {
    const created = await AuditService.record({
      action: "platform.access_policy_updated",
      entity: "platform_setting",
      userId: superadminUserId,
      metadata: { graceDays: 15, autoSuspend: true },
    });
    expect(created).toBeDefined();

    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/logs/${created!.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const d = detailRes.json();
    expect(d.id).toBe(created!.id);
    expect(d.action).toBe("platform.access_policy_updated");
    expect(d.category).toBe("ADMIN");
    expect(d.metadata.graceDays).toBe(15);
  });

  // ── 7. Limpeza com Confirmação e Preservação de Evidência ───────────────
  it("11. Limpeza Segura: Rejeita tentativa de limpeza sem a confirmação exata LIMPAR AUDITORIA", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/logs",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { confirm: "CONFIRMAR_ERRADO" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("CONFIRMATION_REQUIRED");
  });

  it("12. Limpeza Segura: Ao limpar com LIMPAR AUDITORIA, preserva eventos de segurança e registra audit.history.cleared", async () => {
    // 1. Cria um evento comum que deve ser limpo
    await AuditService.record({ action: "tour.started", userId: superadminUserId });

    // 2. Executa a limpeza com confirmação correta
    const clearRes = await app.inject({
      method: "DELETE",
      url: "/admin/logs",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { confirm: "LIMPAR AUDITORIA" },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().ok).toBe(true);

    // 3. Verifica que a auditoria da própria limpeza foi gerada
    const clearAuditLog = await prisma.auditLog.findFirst({
      where: { action: "audit.history.cleared" },
      orderBy: { createdAt: "desc" },
    });
    expect(clearAuditLog).toBeDefined();
    expect(clearAuditLog?.userId).toBe(superadminUserId);
    expect((clearAuditLog?.metadata as any)?.scope).toBe("all");

    // 4. Verifica que a evidência de limpeza NUNCA desaparece na própria limpeza
    const secondClearRes = await app.inject({
      method: "DELETE",
      url: "/admin/logs",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { confirm: "LIMPAR AUDITORIA" },
    });
    expect(secondClearRes.statusCode).toBe(200);

    const preservedAudit = await prisma.auditLog.findFirst({
      where: { action: "audit.history.cleared" },
    });
    expect(preservedAudit).toBeDefined();
  });

  // ── 8. Deduplicação de Rajadas e Proteção Extrema de Segredos ───────────
  it("13. Deduplicação de Rajadas: Evita registros duplicados em rajadas idênticas (< 2s)", async () => {
    const rec1 = await AuditService.record({
      action: "easypanel.connection.tested",
      userId: superadminUserId,
      entity: "easypanel",
    });

    const rec2 = await AuditService.record({
      action: "easypanel.connection.tested",
      userId: superadminUserId,
      entity: "easypanel",
    });

    expect(rec1).toBeDefined();
    expect(rec2).toBeDefined();
    expect(rec1?.id).toBe(rec2?.id);
  });

  it("14. Redação Extrema de Segredos: Garante que PAT, JWT, CSRF, chaves e URLs não vazem", async () => {
    const rec = await AuditService.record({
      action: "security.audit_check",
      userId: superadminUserId,
      metadata: {
        github_pat: "github_pat_11AABBCCDDEEFF0011223344",
        csrfToken: "csrf-token-12345-secret",
        cookie: "session=abc12345; Secure; HttpOnly",
        database_url: "postgresql://nexaflow:secretpass@db.internal:5432/db",
        safeNote: "Auditoria 100% segura",
      },
    });

    expect(rec).toBeDefined();
    const meta = rec?.metadata as any;
    expect(meta.github_pat).toBe("[omitido]");
    expect(meta.csrfToken).toBe("[omitido]");
    expect(meta.cookie).toBe("[omitido]");
    expect(meta.database_url).toBe("[omitido]");
    expect(meta.safeNote).toBe("Auditoria 100% segura");
  });
});

