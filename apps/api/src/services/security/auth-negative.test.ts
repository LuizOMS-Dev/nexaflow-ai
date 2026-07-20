import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "./password";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";

/**
 * Testes negativos de autenticação / sessão / isolamento extra.
 * Banco: DATABASE_URL_TEST apenas.
 */
describe("auth negative paths", () => {
  let app: FastifyInstance;
  let token: string;
  let otherContactId: string;
  let tAId: string;
  let tBId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const suffix = Date.now().toString(36);
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    const tA = await prisma.tenant.create({
      data: {
        name: `NegA ${suffix}`,
        slug: `nega-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "auth-negative" }),
      },
    });
    const tB = await prisma.tenant.create({
      data: {
        name: `NegB ${suffix}`,
        slug: `negb-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "auth-negative" }),
      },
    });
    tAId = tA.id;
    tBId = tB.id;
    const uA = await prisma.user.create({
      data: {
        email: `nega-${suffix}@test.local`,
        name: "Neg A",
        passwordHash,
        memberships: { create: { tenantId: tA.id, role: "ADMIN" } },
      },
    });
    const cB = await prisma.contact.create({
      data: { tenantId: tB.id, name: "Secret B", email: `b-${suffix}@x.com` },
    });
    otherContactId = cB.id;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: uA.email, password: "Test@Pass12345" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(login.statusCode).toBe(200);
    token = (login.json() as { accessToken: string }).accessToken;
    void token;
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tAId).catch(() => null);
    await cleanupTestTenant(tBId).catch(() => null);
    await app.close().catch(() => null);
  });

  it("token adulterado → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: {
        authorization: `Bearer ${token.slice(0, -4)}xxxx`,
        origin: "http://localhost:3000",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("sem token → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("JSON malformado → 400 sem expor detalhes internos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: '{"email":',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: "BAD_REQUEST",
      message: "Requisição inválida",
    });
    expect(res.body).not.toContain("FST_ERR_CTP_INVALID_JSON_BODY");
  });

  it("IDOR task/contact cross-tenant 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/contacts/${otherContactId}`,
      headers: {
        authorization: `Bearer ${token}`,
        origin: "http://localhost:3000",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("mass assignment: body.tenantId ignorado no create contact", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: {
        authorization: `Bearer ${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        name: "Inject Tenant",
        tenantId: "evil-tenant-id",
        role: "SUPERADMIN",
        isSuperAdmin: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenantId: string; id: string };
    expect(body.tenantId).not.toBe("evil-tenant-id");
    // cleanup
    await prisma.contact.delete({ where: { id: body.id } }).catch(() => null);
  });

  it("paginação excessiva limitada ou rejeitada", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/contacts?limit=1000000",
      headers: {
        authorization: `Bearer ${token}`,
        origin: "http://localhost:3000",
      },
    });
    // Zod max(100) → 400 validation
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { limit?: number; items?: unknown[] };
      if (body.limit != null) expect(body.limit).toBeLessThanOrEqual(100);
      if (body.items) expect(body.items.length).toBeLessThanOrEqual(100);
    }
  });
});
