import { describe, expect, it } from "vitest";
import { isBlockedIp, validateWebhookUrlFormat } from "./ssrf";
import { signPayload, generateWebhookSecret } from "./dispatch";
import { createHmac } from "crypto";

describe("webhook SSRF", () => {
  it("bloqueia localhost e IPs privados", () => {
    expect(validateWebhookUrlFormat("http://localhost/hook").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://127.0.0.1/hook").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://192.168.0.1/hook").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://10.0.0.5/hook").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://[::1]/x").ok).toBe(false);
    expect(validateWebhookUrlFormat("file:///etc/passwd").ok).toBe(false);
    expect(validateWebhookUrlFormat("ftp://evil.com/").ok).toBe(false);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });

  it("bloqueia hosts docker / metadata", () => {
    expect(validateWebhookUrlFormat("http://postgres/x").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://host.docker.internal/x").ok).toBe(false);
    expect(validateWebhookUrlFormat("http://169.254.169.254/latest").ok).toBe(false);
  });

  it("aceita HTTPS público em formato", () => {
    const r = validateWebhookUrlFormat("https://hooks.example.com/nexa");
    expect(r.ok).toBe(true);
  });
});

describe("webhook signature", () => {
  it("HMAC SHA-256 verificável", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt_1", type: "webhook.test" });
    const ts = "1700000000";
    const header = signPayload(secret, body, ts);
    const m = header.match(/^t=(\d+),v1=([a-f0-9]+)$/);
    expect(m).toBeTruthy();
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");
    expect(m![2]).toBe(expected);
  });
});
