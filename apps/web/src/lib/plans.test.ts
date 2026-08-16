import { describe, it, expect } from "vitest";
import {
  getAnnualDiscountPercent,
  formatDiscountPercent,
  calculateAnnualPriceWithDiscount,
  calculateFullAnnualPrice,
  calculateAnnualSavings,
  detectDiscountMode,
  parsePercentInput,
  emptyForm,
  planToForm,
  slugify,
  DISCOUNT_PRESET_OPTIONS,
  type Plan,
} from "./plans";

describe("Módulo de Planos Admin: Cálculos de Desconto, Presets e Estado do Formulário", () => {
  it("Caso A: Preço cheio anual (mensal * 12) tem 0% de desconto e economia 0", () => {
    const monthly = 299;
    const annual = calculateFullAnnualPrice(monthly); // 3588
    expect(annual).toBe(3588);
    expect(getAnnualDiscountPercent(monthly, annual)).toBe(0);
    expect(formatDiscountPercent(0)).toBe("0%");
    expect(calculateAnnualSavings(monthly, annual)).toBe(0);
    expect(detectDiscountMode(0).mode).toBe("0");
  });

  it("Caso B: Preset 15% de desconto calcula R$ 3.049,80/ano e economia de R$ 538,20", () => {
    const monthly = 299;
    const annualDiscounted = calculateAnnualPriceWithDiscount(monthly, 15); // 3049.80
    expect(annualDiscounted).toBe(3049.8);
    expect(getAnnualDiscountPercent(monthly, annualDiscounted)).toBe(15);
    expect(formatDiscountPercent(15)).toBe("15%");
    expect(calculateAnnualSavings(monthly, annualDiscounted)).toBe(538.2);
    expect(detectDiscountMode(15).mode).toBe("15");
  });

  it("Caso C: Desconto Personalizado Decimal (ex: 12,5% e 22,75%)", () => {
    const monthly = 299;
    const pct12_5 = parsePercentInput("12,5");
    expect(pct12_5).toBe(12.5);

    const annual12_5 = calculateAnnualPriceWithDiscount(monthly, 12.5); // 3139.50
    expect(annual12_5).toBe(3139.5);
    expect(getAnnualDiscountPercent(monthly, annual12_5)).toBe(12.5);
    expect(formatDiscountPercent(12.5)).toBe("12,5%");
    expect(detectDiscountMode(12.5)).toEqual({ mode: "custom", customVal: "12,5" });

    const pct22_75 = parsePercentInput("22,75");
    expect(pct22_75).toBe(22.75);
    const annual22_75 = calculateAnnualPriceWithDiscount(monthly, 22.75);
    expect(getAnnualDiscountPercent(monthly, annual22_75)).toBe(22.75);
    expect(formatDiscountPercent(22.75)).toBe("22,75%");
  });

  it("Caso D: Preço anual manual personalizado (ex: R$ 3.100,00 para mensal R$ 299,00)", () => {
    const monthly = 299;
    const annualManual = 3100;
    const detectedPct = getAnnualDiscountPercent(monthly, annualManual);
    expect(detectedPct).toBe(13.6);
    expect(formatDiscountPercent(detectedPct)).toBe("13,6%");
    expect(detectDiscountMode(detectedPct).mode).toBe("custom");
  });

  it("Caso E: Preço anual maior que mensal * 12 nunca gera desconto negativo", () => {
    const monthly = 299;
    const annualHigher = 3800;
    expect(getAnnualDiscountPercent(monthly, annualHigher)).toBe(0);
    expect(calculateAnnualSavings(monthly, annualHigher)).toBe(0);
  });

  it("Caso F: Preços zerados, nulos ou negativos retornam 0 de desconto e modo 0", () => {
    expect(getAnnualDiscountPercent(0, 0)).toBe(0);
    expect(getAnnualDiscountPercent(299, null)).toBe(0);
    expect(getAnnualDiscountPercent(299, undefined)).toBe(0);
    expect(getAnnualDiscountPercent(0, 3000)).toBe(0);
    expect(detectDiscountMode(0).mode).toBe("0");
  });

  it("Caso G: emptyForm inicia rigorosamente sem dados residuais (zero state leakage) e annualPricingMode full", () => {
    const fresh = emptyForm();
    expect(fresh.name).toBe("");
    expect(fresh.slug).toBe("");
    expect(fresh.description).toBe("");
    expect(fresh.priceMonthly).toBe("");
    expect(fresh.priceAnnual).toBe("");
    expect(fresh.annualPricingMode).toBe("full");
    expect(fresh.discountMode).toBe("0");
    expect(fresh.customDiscountPercent).toBe("");
    expect(fresh.badge).toBe("");
    expect(fresh.isActive).toBe(true);
  });

  it("Caso H: Normalização de slugs com slugify", () => {
    expect(slugify("Plano Profissional Plus")).toBe("plano-profissional-plus");
    expect(slugify("  Plano IA Super & Avançado!  ")).toBe("plano-ia-super-avancado");
    expect(slugify("---premium---")).toBe("premium");
  });

  it("Caso I: planToForm converte planos comerciais, detecta presets e define annualPricingMode", () => {
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
    expect(form.annualPricingMode).toBe("percentage");
    expect(form.discountMode).toBe("15");
    expect(form.maxUsers).toBe("5");
  });

  it("Caso J: Presets 10%, 20%, 25%, 30% calculam preços anuais exatos", () => {
    const monthly = 299;
    expect(calculateAnnualPriceWithDiscount(monthly, 10)).toBe(3229.2);
    expect(calculateAnnualPriceWithDiscount(monthly, 20)).toBe(2870.4);
    expect(calculateAnnualPriceWithDiscount(monthly, 25)).toBe(2691);
    expect(calculateAnnualPriceWithDiscount(monthly, 30)).toBe(2511.6);
  });

  it("Caso K: Opção 0% tem label 'Sem desconto'", () => {
    const zeroOption = DISCOUNT_PRESET_OPTIONS.find((o) => o.value === "0");
    expect(zeroOption?.label).toBe("Sem desconto");
  });
});
