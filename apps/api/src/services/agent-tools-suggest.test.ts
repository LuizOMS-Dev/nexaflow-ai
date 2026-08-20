import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { executeAgentTool } from "./agent-tools";

describe("executeAgentTool — copiloto não muta", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";
  let agentId = "";
  let contactId = "";
  let conversationId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `ToolsSuggest ${suffix}`,
        slug: `tools-sug-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "agent-tools-suggest" }),
      },
    });
    tenantId = tenant.id;
    const agent = await prisma.aiAgent.create({
      data: {
        tenantId,
        name: "Copiloto",
        isActive: true,
        mode: "SUGGEST",
        publishStatus: "PUBLISHED",
      },
    });
    agentId = agent.id;
    const contact = await prisma.contact.create({
      data: { tenantId, name: "Cliente Original", phone: `55${suffix.slice(-8)}` },
    });
    contactId = contact.id;
    const conv = await prisma.conversation.create({
      data: { tenantId, contactId: contact.id, status: "OPEN" },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("source=suggest simula update_contact e não altera o CRM", async () => {
    const r = await executeAgentTool(
      {
        tenantId,
        agentId,
        conversationId,
        contactId,
        source: "suggest",
      },
      "update_contact",
      { name: "Nome Hackeado" }
    );
    expect(r.ok).toBe(true);
    expect(r.result).toEqual(expect.objectContaining({ simulated: true }));
    const after = await prisma.contact.findUnique({ where: { id: contactId } });
    expect(after?.name).toBe("Cliente Original");
  });

  it("source=suggest simula request_human e não faz handoff", async () => {
    const r = await executeAgentTool(
      {
        tenantId,
        agentId,
        conversationId,
        contactId,
        source: "suggest",
      },
      "request_human",
      {}
    );
    expect(r.result).toEqual(expect.objectContaining({ simulated: true }));
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conv?.status).toBe("OPEN");
    expect(conv?.assignedToId).toBeNull();
  });
});
