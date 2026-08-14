import { describe, expect, it } from "vitest";
import {
  contactIdentityOk,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  phoneLookupVariants,
  resolveContactName,
} from "./contact-fields";

describe("contact-fields phone", () => {
  it("aceita BR celular e normaliza dígitos", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
    expect(isValidPhone("+55 11 99999-0000")).toBe(true);
  });

  it("rejeita texto arbitrário", () => {
    expect(isValidPhone("teste")).toBe(false);
    expect(normalizePhone("teste")).toBeNull();
    expect(isValidPhone("abc123")).toBe(false);
  });

  it("rejeita muito curto ou sequências inválidas", () => {
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("0000000000")).toBe(false);
  });
});

describe("contact-fields email", () => {
  it("vazio é válido (opcional)", () => {
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("   ")).toBe(true);
  });

  it("valida formato simples", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("invalido")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("contact-fields identity", () => {
  it("permite só telefone", () => {
    expect(contactIdentityOk("", "11999990000")).toBe(true);
    expect(resolveContactName("", "11999990000")).toBe("11999990000");
  });

  it("permite só nome", () => {
    expect(contactIdentityOk("Ana", "")).toBe(true);
  });

  it("rejeita vazio total", () => {
    expect(contactIdentityOk("", "")).toBe(false);
  });

  it("nome vazio + telefone 'teste' não forma identidade", () => {
    expect(contactIdentityOk("", "teste")).toBe(false);
    expect(contactIdentityOk("   ", "teste")).toBe(false);
    expect(resolveContactName("", "teste")).toBe("teste");
  });
});

describe("contact-fields phone variants", () => {
  it("unifica formatos do mesmo número BR", () => {
    const a = phoneLookupVariants("(11) 99999-0000");
    const b = phoneLookupVariants("+55 11 99999-0000");
    expect(a).toContain("11999990000");
    expect(b).toContain("11999990000");
    expect(b).toContain("5511999990000");
  });
});
