import { describe, expect, it } from "vitest";
import {
  cleanJid,
  contactIdentityOk,
  formatDisplayPhone,
  isPhoneOrJidLike,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  phoneLookupVariants,
  resolveContactName,
  resolveContactNameWithPriority,
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

describe("contact-fields formatDisplayPhone and cleanJid", () => {
  it("remove JID suffixes", () => {
    expect(cleanJid("5511999998888@c.us")).toBe("5511999998888");
    expect(cleanJid("5534999999999@s.whatsapp.net")).toBe("5534999999999");
    expect(cleanJid("123456@g.us")).toBe("123456");
  });

  it("formata telefone brasileiro para exibição humana", () => {
    expect(formatDisplayPhone("5511988887777")).toBe("+55 (11) 98888-7777");
    expect(formatDisplayPhone("5534999999999@s.whatsapp.net")).toBe("+55 (34) 99999-9999");
    expect(formatDisplayPhone("11988887777")).toBe("+55 (11) 98888-7777");
  });

  it("detecta strings que parecem telefones ou JIDs", () => {
    expect(isPhoneOrJidLike("5511999998888")).toBe(true);
    expect(isPhoneOrJidLike("5511999998888@c.us")).toBe(true);
    expect(isPhoneOrJidLike("+55 (11) 99999-8888")).toBe(true);
    expect(isPhoneOrJidLike("Fernando Medeiros")).toBe(false);
    expect(isPhoneOrJidLike("Ana Consultora")).toBe(false);
  });
});

describe("contact-fields resolveContactNameWithPriority", () => {
  it("prioriza nome customizado salvo no sistema", () => {
    const name = resolveContactNameWithPriority({
      currentName: "Fernando Medeiros",
      pushName: "Fernando WA",
      phone: "5534999999999",
    });
    expect(name).toBe("Fernando Medeiros");
  });

  it("usa pushName se nome atual for vazio ou número", () => {
    const name = resolveContactNameWithPriority({
      currentName: "5534999999999",
      pushName: "Fernando Medeiros",
      phone: "5534999999999",
    });
    expect(name).toBe("Fernando Medeiros");
  });

  it("usa telefone formatado como fallback", () => {
    const name = resolveContactNameWithPriority({
      currentName: "",
      pushName: "",
      phone: "5534999999999",
    });
    expect(name).toBe("+55 (34) 99999-9999");
  });
});
