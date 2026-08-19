import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("platform admin — isolamento e contratos", () => {
  let app: FastifyInstance;
  let tenantToken: string;
  let superToken: string;
  let tenantId: string;
  let superId: string;
  let otherUserId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    const tenant = await prisma.tenant.create({
      data: {
        name: `NegA ${suffix}`,
        slug: `nega-admin-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "platform-admin" }),
      },
    });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        email: `nega-admin-${suffix}@test.local`,
        name: "Tenant Admin",
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    const superUser = await prisma.user.create({
      data: {
        email: `super-admin-${suffix}@test.local`,
        name: "Super",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    superId = superUser.id;

    const other = await prisma.user.create({
      data: {
        email: `other-admin-${suffix}@test.local`,
        name: "Other",
        passwordHash,
        status: "ACTIVE",
      },
    });
    otherUserId = other.id;

    const tenantLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `nega-admin-${suffix}@test.local`, password: "Test@Pass12345" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(tenantLogin.statusCode).toBe(200);
    tenantToken = (tenantLogin.json() as { accessToken: string }).accessToken;

    const superLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `super-admin-${suffix}@test.local`, password: "Test@Pass12345" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(superLogin.statusCode).toBe(200);
    superToken = (superLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `super-admin-${suffix}@test.local`,
            `other-admin-${suffix}@test.local`,
            `visible-paginated-${suffix}@nexaflow.example`,
            `co-user-${suffix}@nexaflow.example`,
            `sa-only-${suffix}@nexaflow.example`,
            `sa-sess-${suffix}@nexaflow.example`,
          ],
        },
      },
    }).catch(() => null);
    await app.close().catch(() => null);
  });

  it("sem sessão → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/overview" });
    expect(res.statusCode).toBe(401);
  });

  it("admin de empresa não acessa /admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { authorization: `Bearer ${tenantToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error?: string }).error).toBe("FORBIDDEN");
  });

  it("superadmin lê overview sem carregar fixtures de teste como empresa real", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stats: { tenants: number }; recentTenants: Array<{ slug?: string; name: string }> };
    expect(body.stats).toBeTruthy();
    expect(body.recentTenants.some((t) => t.name.includes(`NegA ${suffix}`))).toBe(false);
  });

  it("listagem de empresas pagina e resume", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants?page=1&limit=10",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; page: number; summary: { total: number } };
    expect(body.page).toBe(1);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.summary.total).toBe("number");
  });

  it("usuários vêm paginados", async () => {
    // @test.local é filtrado da listagem operacional — cria identidade visível.
    await prisma.user.create({
      data: {
        email: `visible-paginated-${suffix}@nexaflow.example`,
        name: "Visible Paginated",
        passwordHash: await hashPassword("Test@Pass12345"),
        status: "ACTIVE",
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/admin/users?page=1&limit=10",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number; totalPages: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("KPI de empresas e listagem usam a mesma semântica de Membership", async () => {
    const before = await app.inject({
      method: "GET",
      url: "/admin/users/stats",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect(before.statusCode).toBe(200);
    const beforeKpi = before.json() as { companyUniqueUsers: number };

    await prisma.user.create({
      data: {
        email: `sa-only-${suffix}@nexaflow.example`,
        name: "SA Only",
        passwordHash: await hashPassword("Test@Pass12345"),
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    const afterSa = await app.inject({
      method: "GET",
      url: "/admin/users/stats",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    const afterSaKpi = afterSa.json() as { companyUniqueUsers: number };
    expect(afterSaKpi.companyUniqueUsers).toBe(beforeKpi.companyUniqueUsers);

    await prisma.user.create({
      data: {
        email: `co-user-${suffix}@nexaflow.example`,
        name: "Company User",
        passwordHash: await hashPassword("Test@Pass12345"),
        status: "ACTIVE",
        memberships: { create: { tenantId, role: "AGENT", status: "ACTIVE", isActive: true } },
      },
    });

    const statsRes = await app.inject({
      method: "GET",
      url: "/admin/users/stats",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    const kpi = statsRes.json() as { companyUniqueUsers: number; platformActiveSessions: number };
    expect(kpi.companyUniqueUsers).toBe(beforeKpi.companyUniqueUsers + 1);

    const listCo = await app.inject({
      method: "GET",
      url: `/admin/users?scope=companies&search=co-user-${suffix}&limit=10`,
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    const coBody = listCo.json() as { total: number; items: Array<{ email: string }> };
    expect(coBody.total).toBe(1);
    expect(coBody.items[0].email).toBe(`co-user-${suffix}@nexaflow.example`);

    const listSa = await app.inject({
      method: "GET",
      url: `/admin/users?scope=companies&search=sa-only-${suffix}&limit=10`,
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect((listSa.json() as { total: number }).total).toBe(0);

    expect(typeof kpi.platformActiveSessions).toBe("number");
    expect(kpi.platformActiveSessions).toBeGreaterThanOrEqual(0);

    const unfiltered = await app.inject({
      method: "GET",
      url: "/admin/users?scope=companies&limit=30",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect((unfiltered.json() as { total: number }).total).toBe(kpi.companyUniqueUsers);
  });

  it("KPI de sessões ativas ignora revogadas, expiradas e impersonação encerrada", async () => {
    const passwordHash = await hashPassword("Test@Pass12345");
    const sa = await prisma.user.create({
      data: {
        email: `sa-sess-${suffix}@nexaflow.example`,
        name: "SA Sessions",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    const before = await app.inject({
      method: "GET",
      url: "/admin/users/stats",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    const beforeCount = (before.json() as { platformActiveSessions: number }).platformActiveSessions;
    const now = Date.now();
    await prisma.authSession.createMany({
      data: [
        {
          userId: sa.id,
          refreshTokenHash: `valid-${suffix}`,
          familyId: `fam-valid-${suffix}`,
          expiresAt: new Date(now + 3_600_000),
        },
        {
          userId: sa.id,
          refreshTokenHash: `revoked-${suffix}`,
          familyId: `fam-revoked-${suffix}`,
          expiresAt: new Date(now + 3_600_000),
          revokedAt: new Date(now),
        },
        {
          userId: sa.id,
          refreshTokenHash: `expired-${suffix}`,
          familyId: `fam-expired-${suffix}`,
          expiresAt: new Date(now - 3_600_000),
        },
        {
          userId: sa.id,
          refreshTokenHash: `imp-end-${suffix}`,
          familyId: `fam-impend-${suffix}`,
          expiresAt: new Date(now + 3_600_000),
          isImpersonation: true,
          impersonationExpiresAt: new Date(now - 60_000),
        },
        {
          userId: sa.id,
          refreshTokenHash: `imp-ok-${suffix}`,
          familyId: `fam-impok-${suffix}`,
          expiresAt: new Date(now + 3_600_000),
          isImpersonation: true,
          impersonationExpiresAt: new Date(now + 3_600_000),
        },
      ],
    });
    const after = await app.inject({
      method: "GET",
      url: "/admin/users/stats",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });
    expect((after.json() as { platformActiveSessions: number }).platformActiveSessions).toBe(
      beforeCount + 2
    );
  });

  it("superadmin não altera o próprio status", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${superId}/status`,
      payload: { status: "DISABLED" },
      headers: {
        authorization: `Bearer ${superToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("superadmin altera status de outro usuário", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/users/${otherUserId}/status`,
      payload: { status: "SUSPENDED", reason: "teste" },
      headers: {
        authorization: `Bearer ${superToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("SUSPENDED");
    await prisma.user.update({ where: { id: otherUserId }, data: { status: "ACTIVE", isActive: true } });
  });
});
