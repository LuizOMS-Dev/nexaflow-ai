import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";
import { autoReplyStillEligible } from "./index";

describe("autoReplyStillEligible — IA x humano", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";
  let conversationId = "";
  let agentId = "";
  let userId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `AutoGuard ${suffix}`,
        slug: `auto-guard-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "auto-reply-guard" }),
      },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        email: `guard-${suffix}@test.nexaflow.local`,
        name: "Atendente Guard",
        passwordHash: "x",
        status: "ACTIVE",
      },
    });
    userId = user.id;
    const agent = await prisma.aiAgent.create({
      data: {
        tenantId,
        name: "Guard Agent",
        isActive: true,
        mode: "AUTO",
        publishStatus: "PUBLISHED",
      },
    });
    agentId = agent.id;
    const contact = await prisma.contact.create({
      data: { tenantId, name: "Cliente", phone: `55${suffix.slice(-8)}` },
    });
    const conv = await prisma.conversation.create({
      data: { tenantId, contactId: contact.id, status: "OPEN" },
    });
    conversationId = conv.id;
    await prisma.message.create({
      data: {
        conversationId,
        direction: "INBOUND",
        content: "oi",
        type: "TEXT",
      },
    });
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
    await prisma.user.delete({ where: { id: userId } }).catch(() => null);
  });

  it("permite AUTO quando conversa está com a IA", async () => {
    await expect(
      autoReplyStillEligible({ tenantId, conversationId, agentId })
    ).resolves.toBe(true);
  });

  it("bloqueia envio se humano assumiu durante a geração", async () => {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedToId: userId },
    });
    await expect(
      autoReplyStillEligible({ tenantId, conversationId, agentId })
    ).resolves.toBe(false);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedToId: null },
    });
  });

  it("bloqueia se o agente não está mais PUBLISHED/AUTO", async () => {
    await prisma.aiAgent.update({
      where: { id: agentId },
      data: { mode: "SUGGEST" },
    });
    await expect(
      autoReplyStillEligible({ tenantId, conversationId, agentId })
    ).resolves.toBe(false);
    await prisma.aiAgent.update({
      where: { id: agentId },
      data: { mode: "AUTO" },
    });
  });
});
