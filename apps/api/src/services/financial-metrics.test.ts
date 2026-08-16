import { describe, it, expect } from "vitest";
import {
  computePlansCommercialStats,
  type PlanWithCommercialStats,
} from "./financial-metrics";
import type { Plan } from "@prisma/client";

describe("computePlansCommercialStats — Mais Popular Dinâmico, Contagens & Métricas", () => {
  const mockPlans: Plan[] = [
    {
      id: "plan-free",
      name: "Gratuito",
      slug: "free",
      description: "Plano gratuito",
      priceMonthly: 0 as any,
      priceAnnual: 0 as any,
      priceOnRequest: false,
      maxUsers: 1,
      maxChannels: 1,
      maxContacts: 100,
      maxConversations: 500,
      maxAiMessages: 50,
      features: {},
      badge: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "plan-starter",
      name: "Iniciante",
      slug: "starter",
      description: "Plano inicial",
      priceMonthly: 99 as any,
      priceAnnual: 1009.8 as any,
      priceOnRequest: false,
      maxUsers: 3,
      maxChannels: 2,
      maxContacts: 1000,
      maxConversations: 2500,
      maxAiMessages: 500,
      features: {},
      badge: null,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "plan-pro",
      name: "Profissional",
      slug: "pro",
      description: "Plano para times",
      priceMonthly: 299 as any,
      priceAnnual: 3049.8 as any,
      priceOnRequest: false,
      maxUsers: 10,
      maxChannels: 5,
      maxContacts: 10000,
      maxConversations: 20000,
      maxAiMessages: 3000,
      features: {},
      badge: null,
      sortOrder: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "plan-enterprise",
      name: "Enterprise",
      slug: "enterprise",
      description: "Contrato sob medida",
      priceMonthly: 0 as any,
      priceAnnual: null,
      priceOnRequest: true,
      maxUsers: 50,
      maxChannels: 20,
      maxContacts: 100000,
      maxConversations: 100000,
      maxAiMessages: 50000,
      features: {},
      badge: null,
      sortOrder: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("1. Catálogo sem clientes pagantes: Nenhum plano é mais popular e status é 'empty'", () => {
    const res = computePlansCommercialStats({
      plans: mockPlans,
      tenants: [],
      subscriptions: [],
    });

    expect(res.summary.payingCompaniesCount).toBe(0);
    expect(res.summary.mostPopularStatus).toBe("empty");
    expect(res.summary.mostPopularPlanId).toBeNull();
    expect(res.summary.mostPopularPlanName).toBeNull();

    for (const p of res.plans) {
      expect(p.isMostPopular).toBe(false);
      expect(p.activeCustomerCount).toBe(0);
    }
  });

  it("2. Líder único isolado: Plano com mais assinaturas ativas recebe isMostPopular = true", () => {
    const tenants = [
      { id: "t1", name: "Empresa 1", slug: "empresa-1", status: "ACTIVE", planId: "plan-starter", createdAt: new Date(), updatedAt: new Date() },
      { id: "t2", name: "Empresa 2", slug: "empresa-2", status: "ACTIVE", planId: "plan-pro", createdAt: new Date(), updatedAt: new Date() },
      { id: "t3", name: "Empresa 3", slug: "empresa-3", status: "ACTIVE", planId: "plan-pro", createdAt: new Date(), updatedAt: new Date() },
    ];
    const subscriptions = [
      { id: "s1", tenantId: "t1", planId: "plan-starter", billingStatus: "ACTIVE", priceMonthly: 99 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
      { id: "s2", tenantId: "t2", planId: "plan-pro", billingStatus: "ACTIVE", priceMonthly: 299 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
      { id: "s3", tenantId: "t3", planId: "plan-pro", billingStatus: "ACTIVE", priceMonthly: 299 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
    ];

    const res = computePlansCommercialStats({
      plans: mockPlans,
      tenants,
      subscriptions,
    });

    const starter = res.plans.find((p) => p.id === "plan-starter");
    const pro = res.plans.find((p) => p.id === "plan-pro");

    expect(starter?.activeCustomerCount).toBe(1);
    expect(starter?.isMostPopular).toBe(false);

    expect(pro?.activeCustomerCount).toBe(2);
    expect(pro?.isMostPopular).toBe(true);

    expect(res.summary.payingCompaniesCount).toBe(3);
    expect(res.summary.mostPopularStatus).toBe("leader");
    expect(res.summary.mostPopularPlanName).toBe("Profissional");
  });

  it("3. Empate no topo: Nenhum plano recebe isMostPopular e status é 'tie'", () => {
    const tenants = [
      { id: "t1", name: "Empresa 1", slug: "empresa-1", status: "ACTIVE", planId: "plan-starter", createdAt: new Date(), updatedAt: new Date() },
      { id: "t2", name: "Empresa 2", slug: "empresa-2", status: "ACTIVE", planId: "plan-pro", createdAt: new Date(), updatedAt: new Date() },
    ];
    const subscriptions = [
      { id: "s1", tenantId: "t1", planId: "plan-starter", billingStatus: "ACTIVE", priceMonthly: 99 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
      { id: "s2", tenantId: "t2", planId: "plan-pro", billingStatus: "ACTIVE", priceMonthly: 299 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
    ];

    const res = computePlansCommercialStats({
      plans: mockPlans,
      tenants,
      subscriptions,
    });

    const starter = res.plans.find((p) => p.id === "plan-starter");
    const pro = res.plans.find((p) => p.id === "plan-pro");

    expect(starter?.activeCustomerCount).toBe(1);
    expect(starter?.isMostPopular).toBe(false);

    expect(pro?.activeCustomerCount).toBe(1);
    expect(pro?.isMostPopular).toBe(false);

    expect(res.summary.mostPopularStatus).toBe("tie");
    expect(res.summary.mostPopularPlanId).toBeNull();
  });

  it("4. Exclusão do Plano Free: Mesmo com 100 usuários no Free, o plano pago com 1 cliente é o Mais Popular", () => {
    const freeTenants = Array.from({ length: 50 }, (_, i) => ({
      id: `free-t-${i}`,
      name: `Free Tenant ${i}`,
      slug: `free-slug-${i}`,
      status: "ACTIVE",
      planId: "plan-free",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const paidTenant = {
      id: "paid-t-1",
      name: "Paid Tenant 1",
      slug: "paid-slug-1",
      status: "ACTIVE",
      planId: "plan-starter",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const subscriptions = [
      { id: "sub-1", tenantId: "paid-t-1", planId: "plan-starter", billingStatus: "ACTIVE", priceMonthly: 99 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
    ];

    const res = computePlansCommercialStats({
      plans: mockPlans,
      tenants: [...freeTenants, paidTenant],
      subscriptions,
    });

    const free = res.plans.find((p) => p.id === "plan-free");
    const starter = res.plans.find((p) => p.id === "plan-starter");

    expect(free?.activeCustomerCount).toBe(50);
    expect(free?.isMostPopular).toBe(false); // Free nunca recebe mais popular

    expect(starter?.activeCustomerCount).toBe(1);
    expect(starter?.isMostPopular).toBe(true); // Único líder comercial pago
  });

  it("5. Cancelamentos e Status Inativos não contam como clientes ativos pagantes", () => {
    const tenants = [
      { id: "t1", name: "Empresa 1", slug: "empresa-1", status: "CANCELLED", planId: "plan-pro", createdAt: new Date(), updatedAt: new Date() },
      { id: "t2", name: "Empresa 2", slug: "empresa-2", status: "ACTIVE", planId: "plan-starter", createdAt: new Date(), updatedAt: new Date() },
    ];
    const subscriptions = [
      { id: "s1", tenantId: "t1", planId: "plan-pro", billingStatus: "ACTIVE", priceMonthly: 299 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
      { id: "s2", tenantId: "t2", planId: "plan-starter", billingStatus: "CANCELLED", priceMonthly: 99 as any, billingCycle: "MONTHLY", billingDueDay: 10, currentPeriodEnd: new Date(), trialEndsAt: null, cancelAt: null, createdAt: new Date(), updatedAt: new Date(), provider: null, externalId: null, extraAiCredits: 0, priceAnnual: null, metadata: null },
    ];

    const res = computePlansCommercialStats({
      plans: mockPlans,
      tenants,
      subscriptions,
    });

    expect(res.summary.payingCompaniesCount).toBe(0);
    expect(res.summary.mostPopularStatus).toBe("empty");
  });
});
