import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./index", () => ({
  sendWhatsAppText: vi.fn(async () => ({ ok: true, externalId: "ext-1" })),
}));

import { prisma } from "../../lib/prisma";
import { sendWhatsAppText } from "./index";
import { dispatchWhatsAppText } from "./message-dispatch";

describe("dispatchWhatsAppText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia campanha sem consentWhatsapp", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: "c1",
      consentWhatsapp: false,
    } as never);

    const r = await dispatchWhatsAppText({
      channelId: "ch1",
      to: "+5511999999999",
      text: "Promo",
      purpose: "campaign",
      contactId: "c1",
      idempotencyKey: "camp-1",
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_consent");
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("permite reply sem exigir opt-in de campanha", async () => {
    const r = await dispatchWhatsAppText({
      channelId: "ch1",
      to: "+5511999999999",
      text: "Olá",
      purpose: "reply",
      idempotencyKey: `reply-test-${Date.now()}`,
    });

    expect(r.ok).toBe(true);
    expect(sendWhatsAppText).toHaveBeenCalled();
  });

  it("idempotência: segundo envio com mesma key não reenvia", async () => {
    const key = `idem-${Date.now()}`;
    const a = await dispatchWhatsAppText({
      channelId: "ch1",
      to: "+5511888888888",
      text: "Hi",
      purpose: "reply",
      idempotencyKey: key,
    });
    const b = await dispatchWhatsAppText({
      channelId: "ch1",
      to: "+5511888888888",
      text: "Hi",
      purpose: "reply",
      idempotencyKey: key,
    });

    expect(a.ok).toBe(true);
    expect(b.skipped).toBe(true);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });
});
