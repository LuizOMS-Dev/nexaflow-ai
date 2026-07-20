import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "./password";
import type { FastifyInstance } from "fastify";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";

/**
 * Testes de isolamento multi-tenant / IDOR.
 * Roda somente no banco DATABASE_URL_TEST (ver vitest setup).
 */
describe("tenant isolation / IDOR", () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let contactAId: string;
  let contactBId: string;
  let convBId: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const suffix = Date.now().toString(36);
    const passwordHash = await hashPassword("Test@Pass12345");

    const plan = await prisma.plan.findFirst();
    const tenantA = await prisma.tenant.create({
      data: {
        name: `Tenant A ${suffix}`,
        slug: `tenant-a-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "tenant-isolation" }),
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: `Tenant B ${suffix}`,
        slug: `tenant-b-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "tenant-isolation" }),
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const userA = await prisma.user.create({
      data: {
        email: `a-${suffix}@test.nexaflow.local`,
        name: "User A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "ADMIN" } },
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `b-${suffix}@test.nexaflow.local`,
        name: "User B",
        passwordHash,
        memberships: { create: { tenantId: tenantB.id, role: "ADMIN" } },
      },
    });

    const cA = await prisma.contact.create({
      data: { tenantId: tenantA.id, name: "Contact A Only", email: `ca-${suffix}@x.com` },
    });
    const cB = await prisma.contact.create({
      data: { tenantId: tenantB.id, name: "Contact B Only", email: `cb-${suffix}@x.com` },
    });
    contactAId = cA.id;
    contactBId = cB.id;

    const chB = await prisma.channel.create({
      data: { tenantId: tenantB.id, type: "WEBCHAT", name: "Chat B" },
    });
    const convB = await prisma.conversation.create({
      data: {
        tenantId: tenantB.id,
        contactId: cB.id,
        channelId: chB.id,
        status: "OPEN",
      },
    });
    convBId = convB.id;

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { accessToken?: string; mfaRequired?: boolean };
      expect(body.mfaRequired).toBeFalsy();
      expect(body.accessToken).toBeTruthy();
      return body.accessToken!;
    };

    tokenA = await login(userA.email);
    tokenB = await login(userB.email);

    // silence unused
    void userA;
    void userB;
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantAId).catch(() => null);
    await cleanupTestTenant(tenantBId).catch(() => null);
    await app.close().catch(() => null);
  });

  it("tenant A lista só seus contatos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(contactAId);
    expect(ids).not.toContain(contactBId);
  });

  it("IDOR: A não lê contato de B (404 genérico)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/contacts/${contactBId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("IDOR: A não lê conversa de B", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/conversations/${convBId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("IDOR: A não atualiza contato de B", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/contacts/${contactBId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: "Hacked" },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("tenant B acessa o próprio contato", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/contacts/${contactBId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(contactBId);
  });

  it("sem token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/contacts" });
    expect(res.statusCode).toBe(401);
  });
});
