import { describe, expect, it } from "vitest";
import {
  isVersionFormat,
  maskApiKeyPrefix,
  redactMetadata,
  redactString,
} from "./platform-log-redaction";

describe("platform-log-redaction", () => {
  it("valida versão semver-like", () => {
    expect(isVersionFormat("1.0.0")).toBe(true);
    expect(isVersionFormat("1.8.0")).toBe(true);
    expect(isVersionFormat("2.0.0-beta.1")).toBe(true);
    expect(isVersionFormat("v1")).toBe(false);
    expect(isVersionFormat("abc")).toBe(false);
  });

  it("mascara API key prefix", () => {
    expect(maskApiKeyPrefix("nxf_live_ab12cd34")).toMatch(/\*{4,}/);
  });

  it("redige secrets em string e metadata", () => {
    expect(redactString("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb")).toContain(
      "[redacted]"
    );
    const meta = redactMetadata({
      password: "secret",
      token: "abc",
      ok: true,
      nested: { apiKey: "sk-abcdefghijklmnop" },
    }) as Record<string, unknown>;
    expect(meta.password).toBe("[omitido]");
    expect(meta.token).toBe("[omitido]");
    expect(meta.ok).toBe(true);
  });
});
