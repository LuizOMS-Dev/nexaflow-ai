import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

/**
 * GET /team/members — directory leve (assignee) multi-tenant.
 */
describe("GET /team/members", () => {
  let app: FastifyInstance;
  let tenantAId: string;
  let tenantBId: string;
  let agentToken: string;
  let adminAToken: string;
  let adminBToken: string;
  let agentUserId: string;
  let adminAUserId: string;
  let inactiveUserId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    const tenantA = await prisma.tenant.create({
      data: {
        name: `TM A ${suffix}`,
        slug: `tm-a-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "team-members" }),
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: `TM B ${suffix}`,
        slug: `tm-b-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "team-members" }),
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminA = await prisma.user.create({
      data: {
        email: `tm-admin-a-${suffix}@test.local`,
        name: "Admin A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "ADMIN", isActive: true } },
      },
    });
    adminAUserId = adminA.id;

    const agent = await prisma.user.create({
      data: {
        email: `tm-agent-a-${suffix}@test.local`,
        name: "Agent A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "AGENT", isActive: true } },
      },
    });
    agentUserId = agent.id;

    const inactive = await prisma.user.create({
      data: {
        email: `tm-inactive-a-${suffix}@test.local`,
        name: "Inactive Member",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "AGENT", isActive: false } },
      },
    });
    inactiveUserId = inactive.id;

    const adminB = await prisma.user.create({
      data: {
        email: `tm-admin-b-${suffix}@test.local`,
        name: "Admin B Only",
        passwordHash,
        memberships: { create: { tenantId: tenantB.id, role: "ADMIN", isActive: true } },
      },
    });

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
        headers: { origin: "http://localhost:3000" },
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { accessToken: string }).accessToken;
    };

    adminAToken = await login(adminA.email);
    agentToken = await login(agent.email);
    adminBToken = await login(adminB.email);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantAId).catch(() => null);
    await cleanupTestTenant(tenantBId).catch(() => null);
    await app.close().catch(() => null);
  });

  it("401 sem auth", async () => {
    const res = await app.inject({ method: "GET", url: "/team/members" });
    expect(res.statusCode).toBe(401);
  });

  it("AGENT com contacts.read lista membros ativos do próprio tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/team/members",
      headers: { authorization: `Bearer ${agentToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ id: string; name: string; email: string; role: string; avatarUrl: string | null }>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(agentUserId);
    expect(ids).toContain(adminAUserId);
    expect(ids).not.toContain(inactiveUserId);
    // shape mínimo
    for (const item of body.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("email");
      expect(item).toHaveProperty("role");
      expect(item).not.toHaveProperty("lastLoginAt");
      expect(item).not.toHaveProperty("pendingInvites");
    }
    // sem seats/invites no root
    expect(body).not.toHaveProperty("seats");
    expect(body).not.toHaveProperty("pendingInvites");
    expect(body).not.toHaveProperty("members");
  });

  it("não vaza membros de outro tenant", async () => {
    const resA = await app.inject({
      method: "GET",
      url: "/team/members",
      headers: { authorization: `Bearer ${adminAToken}`, origin: "http://localhost:3000" },
    });
    const resB = await app.inject({
      method: "GET",
      url: "/team/members",
      headers: { authorization: `Bearer ${adminBToken}`, origin: "http://localhost:3000" },
    });
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    const idsA = (resA.json() as { items: Array<{ id: string }> }).items.map((i) => i.id);
    const idsB = (resB.json() as { items: Array<{ id: string }> }).items.map((i) => i.id);
    expect(idsA).not.toEqual(expect.arrayContaining(idsB));
    expect(idsB).not.toContain(adminAUserId);
    expect(idsA).not.toContain(
      (resB.json() as { items: Array<{ id: string }> }).items[0]?.id
    );
  });

  it("GET /team continua exigindo team.manage (AGENT 403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/team",
      headers: { authorization: `Bearer ${agentToken}`, origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(403);
  });
});
