import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

type Counts = {
  inbox: number;
  mine: number;
  waiting: number;
  ai: number;
  closed: number;
};

describe("GET /conversations/counts", () => {
  let app: FastifyInstance;
  let tenantId = "";
  let adminToken: string;
  let agentToken: string;
  let otherConversationId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst({ select: { id: true } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Conversation counts ${suffix}`,
        slug: `conversation-counts-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "conversation-counts" }),
      },
    });
    tenantId = tenant.id;

    const admin = await prisma.user.create({
      data: {
        email: `conversation-counts-admin-${suffix}@test.nexaflow.local`,
        name: "Admin Counts",
        passwordHash,
        memberships: { create: { tenantId, role: "ADMIN" } },
      },
    });
    const agent = await prisma.user.create({
      data: {
        email: `conversation-counts-agent-${suffix}@test.nexaflow.local`,
        name: "Agent Counts",
        passwordHash,
        memberships: { create: { tenantId, role: "AGENT" } },
      },
    });
    const other = await prisma.user.create({
      data: {
        email: `conversation-counts-other-${suffix}@test.nexaflow.local`,
        name: "Other Counts",
        passwordHash,
        memberships: { create: { tenantId, role: "AGENT" } },
      },
    });
    const contact = await prisma.contact.create({
      data: { tenantId, name: "Cliente Counts", phone: `55119${Date.now().toString().slice(-8)}` },
    });

    await prisma.conversation.createMany({
      data: [
        { tenantId, contactId: contact.id, status: "OPEN" },
        { tenantId, contactId: contact.id, status: "OPEN", assignedToId: agent.id },
        { tenantId, contactId: contact.id, status: "OPEN", assignedToId: other.id },
        { tenantId, contactId: contact.id, status: "PENDING" },
        { tenantId, contactId: contact.id, status: "PENDING", assignedToId: agent.id },
        { tenantId, contactId: contact.id, status: "CLOSED" },
        { tenantId, contactId: contact.id, status: "CLOSED", assignedToId: agent.id },
        { tenantId, contactId: contact.id, status: "ARCHIVED" },
      ],
    });
    otherConversationId = (
      await prisma.conversation.findFirstOrThrow({
        where: { tenantId, assignedToId: other.id, status: "OPEN" },
        select: { id: true },
      })
    ).id;

    async function login(email: string): Promise<string> {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
      });
      expect(response.statusCode).toBe(200);
      return (response.json() as { accessToken: string }).accessToken;
    }

    adminToken = await login(admin.email);
    agentToken = await login(agent.email);
  }, 60_000);

  afterAll(async () => {
    if (tenantId) await cleanupTestTenant(tenantId);
    await app.close();
  });

  async function getCounts(token: string): Promise<Counts> {
    const response = await app.inject({
      method: "GET",
      url: "/conversations/counts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as Counts;
  }

  it("retorna as cinco filas em uma única chamada", async () => {
    await expect(getCounts(adminToken)).resolves.toEqual({
      inbox: 3,
      mine: 0,
      waiting: 1,
      ai: 1,
      closed: 2,
    });
  });

  it("respeita o escopo do atendente e exclui encerradas de Minha fila", async () => {
    await expect(getCounts(agentToken)).resolves.toEqual({
      inbox: 2,
      mine: 2,
      waiting: 1,
      ai: 1,
      closed: 2,
    });
  });

  it("não permite que o atendente abra conversa atribuída a outro atendente", async () => {
    const denied = await app.inject({
      method: "GET",
      url: `/conversations/${otherConversationId}`,
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(denied.statusCode).toBe(404);

    const allowed = await app.inject({
      method: "GET",
      url: `/conversations/${otherConversationId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(allowed.statusCode).toBe(200);
  });
});
