import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  timingSafeEqualString,
  verifyMetaSignature,
} from "./meta-webhook";

describe("meta-webhook security", () => {
  it("timingSafeEqualString rejects different lengths", () => {
    expect(timingSafeEqualString("abc", "ab")).toBe(false);
  });

  it("timingSafeEqualString accepts equal strings", () => {
    expect(timingSafeEqualString("token-value", "token-value")).toBe(true);
  });

  it("verifyMetaSignature accepts valid hmac", () => {
    const secret = "meta-app-secret-test";
    const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
  });

  it("verifyMetaSignature rejects wrong secret", () => {
    const body = Buffer.from("{}");
    const sig =
      "sha256=" + createHmac("sha256", "good").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "bad")).toBe(false);
  });

  it("verifyMetaSignature rejects missing header", () => {
    expect(verifyMetaSignature("{}", undefined, "secret")).toBe(false);
  });

  it("verifyMetaSignature rejects empty app secret", () => {
    expect(verifyMetaSignature("{}", "sha256=abc", "")).toBe(false);
  });
});
