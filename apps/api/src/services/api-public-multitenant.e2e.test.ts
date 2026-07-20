/**
 * E2E IDOR multi-tenant — API pública v1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "./security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { generateApiKeySecret, hashApiKey } from "./api-keys";
import { asInputJson } from "../lib/json";

describe("API pública multi-tenant / IDOR E2E", () => {
  let app: FastifyInstance;
  let tenantAId: string;
  let tenantBId: string;
  let contactAId: string;
  let contactBId: string;
  let convBId: string;
  let oppBId: string;
  let taskBId: string;
  let secretA: string;
  let secretB: string;
  let secretReadOnly: string;
  let secretRevoked: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const suffix = `api-${Date.now().toString(36)}`;
    const passwordHash = await hashPassword("Test@Pass12345");

    // Plan com API habilitada (cria se schema de teste estiver vazio)
    let plan = await prisma.plan.findFirst({ where: { slug: "business" } });
    if (!plan) plan = await prisma.plan.findFirst();
    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          name: "Test Business",
          slug: `test-biz-${suffix}`,
          priceMonthly: 0,
          maxUsers: 50,
          maxChannels: 5,
          maxContacts: 10000,
          maxConversations: 50000,
          maxAiMessages: 10000,
          isActive: true,
          features: asInputJson({
            api: true,
            webhooks: true,
            webhooksLimit: 20,
            apiKeysLimit: 10,
            crm: true,
            inbox: true,
            ai: true,
          }),
        },
      });
    } else {
      const f = (plan.features || {}) as Record<string, unknown>;
      plan = await prisma.plan.update({
        where: { id: plan.id },
        data: {
          features: asInputJson({
            ...f,
            api: true,
            webhooks: true,
            webhooksLimit: 20,
            apiKeysLimit: 10,
          }),
        },
      });
    }

    const tenantA = await prisma.tenant.create({
      data: {
        name: `API Tenant A ${suffix}`,
        slug: `api-a-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "api-idor" }),
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: `API Tenant B ${suffix}`,
        slug: `api-b-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "api-idor" }),
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        email: `api-a-${suffix}@test.nexaflow.local`,
        name: "API User A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "ADMIN" } },
      },
    });
    await prisma.user.create({
      data: {
        email: `api-b-${suffix}@test.nexaflow.local`,
        name: "API User B",
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
      data: { tenantId: tenantB.id, contactId: cB.id, channelId: chB.id, status: "OPEN" },
    });
    convBId = convB.id;

    const pipeB = await prisma.pipeline.create({
      data: {
        tenantId: tenantB.id,
        name: "Pipe B",
        stages: { create: [{ name: "S1", position: 0, color: "#000" }] },
      },
      include: { stages: true },
    });
    const oppB = await prisma.opportunity.create({
      data: {
        tenantId: tenantB.id,
        title: "Opp B",
        contactId: cB.id,
        pipelineId: pipeB.id,
        stageId: pipeB.stages[0].id,
      },
    });
    oppBId = oppB.id;

    const taskB = await prisma.task.create({
      data: { tenantId: tenantB.id, title: "Task B", status: "TODO" },
    });
    taskBId = taskB.id;

    // Cria keys direto no banco (evita flakiness de entitlement em suite isolada)
    async function seedKey(
      tenantId: string,
      name: string,
      scopes: string[],
      revoked = false
    ) {
      const { secret, prefix, hash } = generateApiKeySecret();
      await prisma.apiKey.create({
        data: {
          tenantId,
          name,
          keyPrefix: prefix,
          keyHash: hash,
          scopes: asInputJson(scopes),
          revokedAt: revoked ? new Date() : null,
        },
      });
      return secret;
    }

    secretA = await seedKey(tenantA.id, "Key A full", [
      "contacts:read",
      "contacts:write",
      "conversations:read",
      "opportunities:read",
      "opportunities:write",
      "tasks:read",
      "tasks:write",
    ]);
    secretB = await seedKey(tenantB.id, "Key B full", [
      "contacts:read",
      "contacts:write",
      "conversations:read",
      "opportunities:read",
      "tasks:read",
    ]);
    secretReadOnly = await seedKey(tenantA.id, "Key A read", ["contacts:read"]);
    secretRevoked = await seedKey(tenantA.id, "Key A revoke", ["contacts:read"], true);
  }, 60_000);

  afterAll(async () => {
    if (tenantAId) await cleanupTestTenant(tenantAId);
    if (tenantBId) await cleanupTestTenant(tenantBId);
    await app.close();
  });

  function auth(secret: string) {
    return { authorization: `Bearer ${secret}` };
  }

  it("lista contatos só do tenant da key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string; name: string }> };
    expect(body.items.some((i) => i.id === contactAId)).toBe(true);
    expect(body.items.some((i) => i.id === contactBId)).toBe(false);
  });

  it("IDOR: key A não lê contact B", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/contacts/${contactBId}`,
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: { code?: string }; message?: string };
    const code = body.error?.code || (body as { error?: string }).error;
    expect(String(code || "")).not.toMatch(/B Only/i);
  });

  it("tenantId no body/query/header é ignorado (autoridade = key)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/contacts?tenantId=${tenantBId}`,
      headers: {
        ...auth(secretA),
        "x-tenant-id": tenantBId,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.every((i) => i.id !== contactBId)).toBe(true);
  });

  it("POST contact com tenantId no body cria no tenant da key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contacts",
      headers: auth(secretA),
      payload: {
        name: "Created Via API A",
        tenantId: tenantBId,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    const row = await prisma.contact.findUnique({ where: { id: body.id } });
    expect(row?.tenantId).toBe(tenantAId);
    expect(row?.tenantId).not.toBe(tenantBId);
  });

  it("scope contacts:read bloqueia write", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contacts",
      headers: auth(secretReadOnly),
      payload: { name: "Should Fail" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("scope contacts:read permite GET", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
      headers: auth(secretReadOnly),
    });
    expect(res.statusCode).toBe(200);
  });

  it("key revogada → 401 imediato", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth(secretRevoked),
    });
    expect(res.statusCode).toBe(401);
  });

  it("key inválida → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth("nxf_live_invalid_key_xxxxx"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("key sem prefixo → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth("totally_wrong"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("IDOR conversa B com key A → 404/vazio", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/conversations",
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.some((i) => i.id === convBId)).toBe(false);
  });

  it("IDOR opportunity B com key A → não lista", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/opportunities",
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.some((i) => i.id === oppBId)).toBe(false);
  });

  it("IDOR task B com key A → não lista", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.some((i) => i.id === taskBId)).toBe(false);
  });

  it("key B não vê contact A", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/contacts/${contactAId}`,
      headers: auth(secretB),
    });
    expect(res.statusCode).toBe(404);
  });

  it("hash da key nunca é o secret plaintext", () => {
    expect(hashApiKey(secretA)).not.toBe(secretA);
    expect(hashApiKey(secretA).length).toBe(64);
  });

  it("key A /me retorna tenant A", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth(secretA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenant: { id: string } };
    expect(body.tenant.id).toBe(tenantAId);
  });
});
