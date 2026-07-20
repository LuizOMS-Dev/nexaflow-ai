import { describe, expect, it } from "vitest";
import { generateApiKeySecret, hashApiKey, hasScope } from "./api-keys";

describe("api keys", () => {
  it("gera prefixo nxf_live_ e hash estável", () => {
    const { secret, prefix, hash } = generateApiKeySecret();
    expect(secret.startsWith("nxf_live_")).toBe(true);
    expect(prefix.startsWith("nxf_live_")).toBe(true);
    expect(hash).toBe(hashApiKey(secret));
    expect(hash).not.toBe(secret);
  });

  it("escopos", () => {
    expect(hasScope(["contacts:read"], "contacts:read")).toBe(true);
    expect(hasScope(["contacts:read"], "contacts:write")).toBe(false);
  });
});
