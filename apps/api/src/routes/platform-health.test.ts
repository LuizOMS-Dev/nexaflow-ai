import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { buildApp } from "../app";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Platform Health Route (/admin/platform-health)", () => {
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
    const passwordHash = await hashPassword("HealthPass123!");

    // 1. Cria Tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        name: `Health Tenant ${suffix}`,
        slug: `health-tenant-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "platform-health" }),
      },
    });
    tenantId = tenant.id;

    // 2. Cria usuário comum
    regularUser = await prisma.user.create({
      data: {
        email: `health-tenant-${suffix}@test.local`,
        name: "Health Tenant User",
        passwordHash,
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    // 3. Cria usuário Superadmin
    superadminUser = await prisma.user.create({
      data: {
        email: `health-super-${suffix}@test.local`,
        name: "Health Superadmin",
        passwordHash,
        status: "ACTIVE",
        platformRole: "SUPERADMIN",
      },
    });

    // 4. Login Tenant
    const tenantLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `health-tenant-${suffix}@test.local`, password: "HealthPass123!" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(tenantLogin.statusCode).toBe(200);
    regularToken = (tenantLogin.json() as { accessToken: string }).accessToken;

    // 5. Login Superadmin
    const superLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `health-super-${suffix}@test.local`, password: "HealthPass123!" },
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
      url: "/admin/platform-health",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejeita acesso de usuário não-superadmin com 403 Forbidden", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/platform-health",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("permite acesso de superadmin e retorna status de saúde estruturado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/platform-health",
      headers: { authorization: `Bearer ${superadminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty("overall");
    expect(["operational", "degraded", "down"]).toContain(body.overall);
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("operational");
    expect(body.summary).toHaveProperty("degraded");
    expect(body.summary).toHaveProperty("down");
    expect(body.summary).toHaveProperty("notConfigured");
    expect(body).toHaveProperty("services");
    expect(Array.isArray(body.services)).toBe(true);

    const apiService = body.services.find((s: any) => s.id === "api");
    expect(apiService).toBeDefined();
    expect(apiService.criticality).toBe("CRITICAL");
    expect(apiService.status).toBe("operational");

    const postgresService = body.services.find((s: any) => s.id === "postgres");
    expect(postgresService).toBeDefined();
    expect(postgresService.criticality).toBe("CRITICAL");
    expect(["operational", "degraded", "down"]).toContain(postgresService.status);

    // Verifica que nenhum secret foi exposto
    expect(res.body).not.toContain("password");
    expect(res.body).not.toContain("postgres://");
    expect(res.body).not.toContain("postgresql://");
    expect(res.body).not.toContain("redis://");
  });
});
