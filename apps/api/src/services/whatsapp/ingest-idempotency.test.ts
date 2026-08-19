import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";
import { ingestInboundMessage } from "./index";

describe("ingestInboundMessage — idempotência de webhook", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";
  let otherTenantId = "";
  let channelId = "";
  let otherChannelId = "";

  beforeAll(async () => {
    const a = await prisma.tenant.create({
      data: {
        name: `Ingest A ${suffix}`,
        slug: `ingest-a-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "ingest-idempotency" }),
      },
    });
    const b = await prisma.tenant.create({
      data: {
        name: `Ingest B ${suffix}`,
        slug: `ingest-b-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "ingest-idempotency" }),
      },
    });
    tenantId = a.id;
    otherTenantId = b.id;
    const chA = await prisma.channel.create({
      data: {
        tenantId,
        type: "WHATSAPP",
        name: "WA A",
        isActive: true,
        externalId: `wa-a-${suffix}`,
      },
    });
    const chB = await prisma.channel.create({
      data: {
        tenantId: otherTenantId,
        type: "WHATSAPP",
        name: "WA B",
        isActive: true,
        externalId: `wa-b-${suffix}`,
      },
    });
    channelId = chA.id;
    otherChannelId = chB.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
    await cleanupTestTenant(otherTenantId).catch(() => null);
  });

  it("webhook repetido com o mesmo externalId não cria segunda mensagem", async () => {
    const externalId = `waha:dup-${suffix}`;
    const first = await ingestInboundMessage({
      tenantId,
      channelId,
      phone: "5511999000111",
      name: "Cliente Dup",
      content: "Oi, primeira",
      externalId,
    });
    expect(first.duplicate).toBe(false);
    const second = await ingestInboundMessage({
      tenantId,
      channelId,
      phone: "5511999000111",
      name: "Cliente Dup",
      content: "Oi, primeira",
      externalId,
    });
    expect(second.duplicate).toBe(true);
    expect(second.message?.id).toBe(first.message?.id);
    const count = await prisma.message.count({
      where: { externalId, conversation: { tenantId } },
    });
    expect(count).toBe(1);
  });

  it("mesmo externalId em outro tenant não colide", async () => {
    const externalId = `waha:iso-${suffix}`;
    const a = await ingestInboundMessage({
      tenantId,
      channelId,
      phone: "5511999000222",
      content: "Tenant A",
      externalId,
    });
    const b = await ingestInboundMessage({
      tenantId: otherTenantId,
      channelId: otherChannelId,
      phone: "5511999000333",
      content: "Tenant B",
      externalId,
    });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(a.message?.id).not.toBe(b.message?.id);
  });
});
