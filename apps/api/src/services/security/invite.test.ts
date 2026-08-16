import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "./password";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";

describe("team invite + accept", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const suffix = Date.now().toString(36);
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan =
      (await prisma.plan.findFirst({ where: { maxUsers: { gte: 5 }, isActive: true } })) ||
      (await prisma.plan.findFirst({ where: { isActive: true } })) ||
      (await prisma.plan.findFirst());
    const tenant = await prisma.tenant.create({
      data: {
        name: `Invite Co ${suffix}`,
        slug: `inv-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "invite" }),
      },
    });
    tenantId = tenant.id;
    if (plan) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          billingStatus: "ACTIVE",
          billingCycle: "MONTHLY",
          priceMonthly: 99,
          billingDueDay: 10,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
    const admin = await prisma.user.create({
      data: {
        email: `inv-admin-${suffix}@test.local`,
        name: "Invite Admin",
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: admin.email, password: "Test@Pass12345" },
      headers: { origin: "http://localhost:3000" },
    });
    adminToken = (login.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
    await app.close().catch(() => null);
  });

  it("cria convite sem senha default e aceita com token", async () => {
    const email = `newuser-${Date.now().toString(36)}@test.local`;
    const inv = await app.inject({
      method: "POST",
      url: "/team/invite",
      headers: {
        authorization: `Bearer ${adminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { email, name: "Novo User", role: "AGENT" },
    });
    expect(inv.statusCode).toBe(200);
    const body = inv.json() as { inviteTokenDevOnly?: string; email: string };
    expect(body.email).toBe(email);
    expect(body.inviteTokenDevOnly).toBeTruthy();

    const uniqueIp = `10.0.1.${Math.floor(Math.random() * 200 + 10)}`;
    const accept = await app.inject({
      method: "POST",
      url: "/auth/accept-invite",
      remoteAddress: uniqueIp,
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      payload: {
        token: body.inviteTokenDevOnly,
        password: "NovaSenha@12345",
        name: "Novo User",
      },
    });
    expect(accept.statusCode).toBe(200);
    const ok = accept.json() as { accessToken: string; user: { email: string } };
    expect(ok.accessToken).toBeTruthy();
    expect(ok.user.email).toBe(email);

    // token reutilizado falha
    const replay = await app.inject({
      method: "POST",
      url: "/auth/accept-invite",
      remoteAddress: `10.0.1.${Math.floor(Math.random() * 200 + 10)}`,
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      payload: {
        token: body.inviteTokenDevOnly,
        password: "OutraSenha@12345",
      },
    });
    expect(replay.statusCode).toBe(400);
  });
});
