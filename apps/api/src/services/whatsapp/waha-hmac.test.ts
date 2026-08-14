import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  apiKeyMatches,
  extractProvidedApiKey,
  extractWahaHmacHeader,
  verifyWahaHmac,
} from "./waha-hmac";

const secret = "waha-test-secret";
const body = Buffer.from(JSON.stringify({ event: "message", payload: { id: "1" } }));

describe("verifyWahaHmac", () => {
  it("aceita SHA-512 hex (oficial WAHA)", () => {
    const hex = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWahaHmac(body, hex, secret)).toBe(true);
  });

  it("aceita sha512=<hex>", () => {
    const hex = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWahaHmac(body, `sha512=${hex}`, secret)).toBe(true);
  });

  it("aceita SHA-256", () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWahaHmac(body, hex, secret, "sha256")).toBe(true);
  });

  it("rejeita secret errado", () => {
    const hex = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWahaHmac(body, hex, "outro")).toBe(false);
  });

  it("rejeita corpo adulterado", () => {
    const hex = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWahaHmac(Buffer.from("{}"), hex, secret)).toBe(false);
  });

  it("rejeita vazio", () => {
    expect(verifyWahaHmac(body, "", secret)).toBe(false);
    expect(verifyWahaHmac(body, "abc", "")).toBe(false);
    expect(verifyWahaHmac(undefined, "abc", secret)).toBe(false);
  });
});

describe("webhook header helpers", () => {
  it("extrai HMAC e api key sem case-sensitivity", () => {
    const headers = {
      "X-Webhook-Hmac": "deadbeef",
      "X-Webhook-Hmac-Algorithm": "sha512",
      "X-Api-Key": "k1",
    };
    expect(extractWahaHmacHeader(headers)).toEqual({ hmac: "deadbeef", algorithm: "sha512" });
    expect(extractProvidedApiKey(headers)).toBe("k1");
  });

  it("compara api key em tempo constante", () => {
    expect(apiKeyMatches("abc", "abc")).toBe(true);
    expect(apiKeyMatches("abc", "abd")).toBe(false);
    expect(apiKeyMatches("", "abc")).toBe(false);
  });
});
