import { describe, it, expect } from "vitest";
import { wahaStatusToRuntime } from "./waha-client";
import { parseWahaWebhook } from "./webhook-parse";

describe("wahaStatusToRuntime", () => {
  it("maps WORKING → open", () => {
    expect(wahaStatusToRuntime("WORKING")).toEqual({ state: "open", needsQr: false });
  });

  it("maps SCAN_QR_CODE → connecting + needsQr", () => {
    expect(wahaStatusToRuntime("SCAN_QR_CODE")).toEqual({
      state: "connecting",
      needsQr: true,
    });
  });

  it("maps FAILED → close + needsQr", () => {
    expect(wahaStatusToRuntime("FAILED")).toEqual({ state: "close", needsQr: true });
  });

  it("maps STOPPED → close", () => {
    expect(wahaStatusToRuntime("STOPPED")).toEqual({ state: "close", needsQr: false });
  });
});

describe("parseWahaWebhook", () => {
  it("parses session.status WORKING", () => {
    const parsed = parseWahaWebhook({
      event: "session.status",
      session: "nf-test",
      me: { id: "5511999999999@c.us", pushName: "Test" },
      payload: { status: "WORKING" },
    });
    expect(parsed.connection?.state).toBe("open");
    expect(parsed.connection?.phone).toBe("5511999999999");
  });

  it("parses inbound text message", () => {
    const parsed = parseWahaWebhook({
      event: "message",
      session: "nf-test",
      payload: {
        id: "ABCD123",
        from: "5511888777666@c.us",
        fromMe: false,
        body: "Olá",
        pushName: "Cliente",
      },
    });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].phone).toBe("5511888777666");
    expect(parsed.messages[0].content).toBe("Olá");
    expect(parsed.messages[0].externalId).toBe("waha:ABCD123");
    expect(parsed.messages[0].fromMe).toBe(false);
  });

  it("parses inbound image with media url", () => {
    const parsed = parseWahaWebhook({
      event: "message",
      session: "nf-test",
      payload: {
        id: "IMG1",
        from: "5511888777666@c.us",
        fromMe: false,
        hasMedia: true,
        body: "foto",
        media: {
          url: "http://waha:3000/api/files/abc",
          mimetype: "image/jpeg",
          filename: "foto.jpg",
        },
      },
    });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaUrl).toBe("http://waha:3000/api/files/abc");
    expect(parsed.messages[0].mediaMime).toBe("image/jpeg");
    expect(parsed.messages[0].content).toBe("foto");
  });

  it("ignores groups", () => {
    const parsed = parseWahaWebhook({
      event: "message",
      payload: {
        id: "G1",
        from: "120363@g.us",
        fromMe: false,
        body: "grupo",
      },
    });
    expect(parsed.messages).toHaveLength(0);
  });
});
