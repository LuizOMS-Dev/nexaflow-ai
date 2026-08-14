import { describe, expect, it } from "vitest";
import {
  completeCompanySchema,
  normalizeWebsite,
  slugFromName,
  tenantNeedsOnboarding,
} from "./company-onboarding";

describe("tenantNeedsOnboarding", () => {
  it("precisa quando settings vazios", () => {
    expect(tenantNeedsOnboarding(null)).toBe(true);
    expect(tenantNeedsOnboarding({})).toBe(true);
  });

  it("não precisa se já concluído", () => {
    expect(tenantNeedsOnboarding({ onboardingCompleted: true })).toBe(false);
  });

  it("não precisa se provisionado no admin", () => {
    expect(tenantNeedsOnboarding({ adminProvisioned: true })).toBe(false);
  });
});

describe("slugFromName", () => {
  it("normaliza acentos e espaços", () => {
    expect(slugFromName("Clínica São José", "x")).toBe("clinica-sao-jose");
  });

  it("cai no fallback se o nome não gera slug", () => {
    expect(slugFromName("!!!", "minha-empresa")).toBe("minha-empresa");
  });
});

describe("normalizeWebsite", () => {
  it("aceita domínio sem protocolo", () => {
    expect(normalizeWebsite("empresa.com.br")).toBe("https://empresa.com.br/");
  });

  it("rejeita javascript:", () => {
    expect(() => normalizeWebsite("javascript:alert(1)")).toThrow();
  });

  it("vazio vira null", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
  });
});

describe("completeCompanySchema", () => {
  it("exige nome", () => {
    const r = completeCompanySchema.safeParse({ name: "A" });
    expect(r.success).toBe(false);
  });

  it("aceita payload mínimo", () => {
    const r = completeCompanySchema.safeParse({ name: "Casa Nova" });
    expect(r.success).toBe(true);
  });

  it("rejeita e-mail inválido", () => {
    const r = completeCompanySchema.safeParse({ name: "Casa Nova", commercialEmail: "x" });
    expect(r.success).toBe(false);
  });

  it("rejeita cor inválida", () => {
    const r = completeCompanySchema.safeParse({ name: "Casa Nova", primaryColor: "blue" });
    expect(r.success).toBe(false);
  });
});
