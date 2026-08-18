import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { buildApp } from "../app";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Platform Diagnostics Route (/admin/diagnostics/*)", () => {
  let app: FastifyInstance;
  let superadminUser: any;
  let regularUser: any;
  let superadminToken: string;
  let regularToken: string;
  let tenantId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("DiagPass123!");

    // 1. Cria Tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: `Diag Tenant ${suffix}`,
        slug: `diag-tenant-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "platform-diagnostics" }),
      },
    });
    tenantId = tenant.id;

    // 2. Cria usuário comum
    regularUser = await prisma.user.create({
      data: {
        email: `diag-tenant-${suffix}@test.local`,
        name: "Diag Tenant User",
        passwordHash,
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    // 3. Cria usuário Superadmin
    superadminUser = await prisma.user.create({
      data: {
        email: `diag-super-${suffix}@test.local`,
        name: "Diag Superadmin",
        passwordHash,
        status: "ACTIVE",
        platformRole: "SUPERADMIN",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    // 4. Login Tenant
    const tenantLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `diag-tenant-${suffix}@test.local`, password: "DiagPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(tenantLogin.statusCode).toBe(200);
    regularToken = (tenantLogin.json() as { accessToken: string }).accessToken;

    // 5. Login Superadmin
    const superLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `diag-super-${suffix}@test.local`, password: "DiagPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(superLogin.statusCode).toBe(200);
    superadminToken = (superLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    if (tenantId) {
      await cleanupTestTenant(tenantId);
    }
    if (superadminUser) {
      await prisma.user.deleteMany({ where: { id: superadminUser.id } });
    }
    await app.close();
  });

  it("rejeita acesso anônimo com 401 Unauthorized", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/diagnostics/run",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejeita acesso de usuário não-superadmin com 403 Forbidden", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/diagnostics/run",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("permite acesso de superadmin e executa varredura de diagnóstico com sucesso (GET)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/diagnostics/run",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty("overallStatus");
    expect(["OK", "WARNING", "FAILURE"]).toContain(body.overallStatus);
    expect(body).toHaveProperty("checks");
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBe(7);

    // Sem segredos
    expect(res.body).not.toContain("password");
    expect(res.body).not.toContain("postgres://");
    expect(res.body).not.toContain("postgresql://");
    expect(res.body).not.toContain("redis://");
  });

  it("permite execução sob demanda via POST /admin/diagnostics/run", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/diagnostics/run",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("overallStatus");
    expect(body.checks.length).toBe(7);
  });

  it("permite acesso a telemetria /admin/diagnostics/overview", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/diagnostics/overview",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("metrics");
    expect(body.metrics).toHaveProperty("activityEvents");
  });
});
