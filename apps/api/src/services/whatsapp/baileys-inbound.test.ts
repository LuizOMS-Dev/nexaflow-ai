import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";
import { bindWhatsAppSessionMeta } from "./wa-alerts";
import { handleBaileysInbound } from "./baileys-inbound";

describe("Baileys inbound → inbox", () => {
  const suffix = Date.now().toString(36);
  const instanceName = `nf-inb-${suffix}`;
  let tenantId = "";
  let channelId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `WA Inbound ${suffix}`,
        slug: `wa-inb-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "baileys-inbound" }),
      },
    });
    tenantId = tenant.id;
    const channel = await prisma.channel.create({
      data: {
        tenantId,
        type: "WHATSAPP",
        name: "Principal",
        isActive: true,
        config: { provider: "baileys", instanceName, session: instanceName, status: "open" },
      },
    });
    channelId = channel.id;
    bindWhatsAppSessionMeta(instanceName, { tenantId, channelId, channelName: "Principal" });
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("sem canal para a instância não cria conversa", async () => {
    const out = await handleBaileysInbound({
      instanceName: `desconhecida-${suffix}`,
      phone: "5511999990000",
      content: "oi",
      externalId: `ext-miss-${suffix}`,
    });
    expect(out).toMatchObject({ skipped: true, reason: "no_channel" });
    expect(await prisma.conversation.count({ where: { tenantId } })).toBe(0);
  });

  it("mensagem no número cadastrado vira contato, conversa e inbound", async () => {
    const phone = `55119${suffix.slice(-8)}`.replace(/\D/g, "").slice(0, 13);
    const result = await handleBaileysInbound({
      instanceName,
      phone,
      name: "Cliente WA",
      content: "Quero atendimento",
      externalId: `wa-msg-${suffix}`,
    });
    expect(result && "duplicate" in result && result.duplicate).toBe(false);
    const convs = await prisma.conversation.findMany({
      where: { tenantId, channelId },
      include: { messages: true, contact: true },
    });
    expect(convs).toHaveLength(1);
    expect(convs[0].contact.phone).toContain(phone.slice(-8));
    expect(convs[0].messages.some((m) => m.direction === "INBOUND" && m.content === "Quero atendimento")).toBe(
      true
    );
  });

  it("a mesma mensagem não duplica (idempotência)", async () => {
    const phone = `55118${suffix.slice(-8)}`.replace(/\D/g, "").slice(0, 13);
    const externalId = `wa-dup-${suffix}`;
    await handleBaileysInbound({
      instanceName,
      phone,
      content: "ping",
      externalId,
    });
    const second = await handleBaileysInbound({
      instanceName,
      phone,
      content: "ping",
      externalId,
    });
    expect(second && "duplicate" in second && second.duplicate).toBe(true);
    const n = await prisma.message.count({
      where: { externalId, conversation: { tenantId } },
    });
    expect(n).toBe(1);
  });
});
