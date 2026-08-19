import { describe, expect, it } from "vitest";
import {
  normalizeCnpj,
  normalizeColor,
  normalizeEmail,
  normalizePhone,
  normalizeUf,
  normalizeWebsite,
} from "./company-fields";

describe("company field normalization", () => {
  it("normaliza CNPJ para 14 dígitos", () => {
    expect(normalizeCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(() => normalizeCnpj("123")).toThrow();
  });

  it("normaliza telefone com +55", () => {
    expect(normalizePhone("34996537860")).toBe("+5534996537860");
    expect(normalizePhone("+55 34 99653-7860")).toBe("+5534996537860");
  });

  it("e-mail comercial lowercase", () => {
    expect(normalizeEmail("  Contato@Empresa.COM ")).toBe("contato@empresa.com");
  });

  it("site só http(s)", () => {
    expect(normalizeWebsite("empresa.com.br")).toMatch(/^https:\/\/empresa\.com\.br/);
    expect(() => normalizeWebsite("javascript:alert(1)")).toThrow();
  });

  it("UF oficial", () => {
    expect(normalizeUf("mg")).toBe("MG");
    expect(() => normalizeUf("XX")).toThrow();
  });

  it("cor #RRGGBB", () => {
    expect(normalizeColor("#6366F1")).toBe("#6366f1");
    expect(() => normalizeColor("blue")).toThrow();
  });
});
