import { describe, it, expect } from "vitest";
import {
  getAnnualDiscountPercent,
  calculateAnnualPriceWithDiscount,
  calculateFullAnnualPrice,
  emptyForm,
  planToForm,
  slugify,
  type Plan,
} from "./plans";

describe("Módulo de Planos Admin: Cálculos de Desconto e Estado do Formulário", () => {
  it("Caso A: Preço cheio anual (mensal * 12) não tem desconto", () => {
    const monthly = 299;
    const annual = calculateFullAnnualPrice(monthly); // 3588
    expect(annual).toBe(3588);
    expect(getAnnualDiscountPercent(monthly, annual)).toBe(0);
  });

  it("Caso B: Aplicar 15% de desconto calcula R$ 3.049,80/ano e badge 15% OFF", () => {
    const monthly = 299;
    const annualDiscounted = calculateAnnualPriceWithDiscount(monthly, 15); // 3049.80
    expect(annualDiscounted).toBe(3049.8);
    expect(getAnnualDiscountPercent(monthly, annualDiscounted)).toBe(15);
  });

  it("Caso C: Remover desconto restaura o valor integral de 12 meses", () => {
    const monthly = 299;
    const full = calculateFullAnnualPrice(monthly);
    expect(full).toBe(3588);
    expect(getAnnualDiscountPercent(monthly, full)).toBe(0);
  });

  it("Caso D: Preço anual manual personalizado (ex: 10% OFF)", () => {
    const monthly = 299;
    const annualManual = 3229.2; // 10% de desconto
    expect(getAnnualDiscountPercent(monthly, annualManual)).toBe(10);
  });

  it("Caso E: Preço anual maior que mensal * 12 nunca gera desconto negativo", () => {
    const monthly = 299;
    const annualHigher = 3800;
    expect(getAnnualDiscountPercent(monthly, annualHigher)).toBe(0);
  });

  it("Caso F: Preços zerados, nulos ou negativos retornam 0 de desconto", () => {
    expect(getAnnualDiscountPercent(0, 0)).toBe(0);
    expect(getAnnualDiscountPercent(299, null)).toBe(0);
    expect(getAnnualDiscountPercent(299, undefined)).toBe(0);
    expect(getAnnualDiscountPercent(0, 3000)).toBe(0);
  });

  it("Caso G: emptyForm inicia rigorosamente sem dados residuais (zero state leakage)", () => {
    const fresh = emptyForm();
    expect(fresh.name).toBe("");
    expect(fresh.slug).toBe("");
    expect(fresh.description).toBe("");
    expect(fresh.priceMonthly).toBe("");
    expect(fresh.priceAnnual).toBe("");
    expect(fresh.badge).toBe("");
    expect(fresh.isActive).toBe(true);
  });

  it("Caso H: Normalização de slugs com slugify", () => {
    expect(slugify("Plano Profissional Plus")).toBe("plano-profissional-plus");
    expect(slugify("  Plano IA Super & Avançado!  ")).toBe("plano-ia-super-avancado");
    expect(slugify("---premium---")).toBe("premium");
  });

  it("Caso I: planToForm converte planos comerciais e protege slugs", () => {
    const mockPlan: Plan = {
      id: "plan-1",
      name: "Profissional",
      slug: "pro",
      description: "Plano para empresas em crescimento",
      priceMonthly: 299,
      priceAnnual: 3049.8,
      maxUsers: 5,
      maxChannels: 2,
      maxContacts: 5000,
      maxConversations: 10000,
      maxAiMessages: 2000,
      isActive: true,
      features: { maxAgents: 3, maxActiveFlows: 10 },
    };

    const form = planToForm(mockPlan);
    expect(form.name).toBe("Profissional");
    expect(form.slug).toBe("pro");
    expect(form.priceMonthly).toBe("299,00");
    expect(form.priceAnnual).toBe("3.049,80");
    expect(form.maxUsers).toBe("5");
  });
});
