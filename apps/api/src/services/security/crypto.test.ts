import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, hasMinSecretEntropy } from "./crypto";

describe("crypto AES-GCM", () => {
  it("roundtrip encrypt/decrypt", () => {
    const plain = "JBSWY3DPEHPK3PXP";
    const enc = encryptSecret(plain);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(enc).plain).toBe(plain);
  });

  it("legado plaintext marca needsReencrypt", () => {
    const r = decryptSecret("PLAIN_SECRET_LEGACY");
    expect(r.plain).toBe("PLAIN_SECRET_LEGACY");
    expect(r.needsReencrypt).toBe(true);
  });

  it("rejeita secrets fracos", () => {
    expect(hasMinSecretEntropy("dev-secret-change-me", 24)).toBe(false);
    expect(hasMinSecretEntropy("a".repeat(40), 24)).toBe(true);
  });
});
