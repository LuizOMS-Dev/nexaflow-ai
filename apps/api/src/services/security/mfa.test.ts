import { describe, it, expect } from "vitest";
import { generateSync } from "otplib";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
  storeTotpSecret,
  loadTotpSecret,
} from "./mfa";

describe("MFA TOTP", () => {
  it("gera secret e URI otpauth", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(10);
    const uri = totpKeyUri("user@nexaflow.ai", secret);
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("NexaFlow");
  });

  it("verifica código TOTP válido e rejeita inválido", () => {
    const secret = generateTotpSecret();
    const token = generateSync({ secret });
    const ok = verifyTotpCode(secret, token);
    expect(ok.ok).toBe(true);
    expect(verifyTotpCode(secret, "000000").ok).toBe(false);
  });

  it("anti-replay: mesmo timestep rejeitado", () => {
    const secret = generateTotpSecret();
    const token = generateSync({ secret });
    const first = verifyTotpCode(secret, token);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const again = verifyTotpCode(secret, token, first.step);
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.reason).toBe("replay");
    }
  });

  it("criptografa secret TOTP em repouso", () => {
    const secret = generateTotpSecret();
    const stored = storeTotpSecret(secret);
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(loadTotpSecret(stored)).toBe(secret);
  });

  it("consome código de backup uma vez", () => {
    const { plain, hashed } = generateBackupCodes();
    expect(plain).toHaveLength(8);
    const first = consumeBackupCode(JSON.stringify(hashed), plain[0]);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const again = consumeBackupCode(first.remainingJson, plain[0]);
      expect(again.ok).toBe(false);
      const other = consumeBackupCode(first.remainingJson, plain[1]);
      expect(other.ok).toBe(true);
    }
  });
});
