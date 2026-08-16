import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Financeiro da Empresa (/finance) — Isolamento Multi-Tenant & Cálculos", () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;
  let tenantBId: string;
  let contactAId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    const tenantA = await prisma.tenant.create({
      data: {
        name: `Finance Tenant A ${suffix}`,
        slug: `fin-a-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "finance-multi-tenant-a" }),
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: `Finance Tenant B ${suffix}`,
        slug: `fin-b-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "finance-multi-tenant-b" }),
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        email: `fina-${suffix}@test.nexaflow.local`,
        name: "Admin Fin A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "ADMIN" } },
      },
    });

    await prisma.user.create({
      data: {
        email: `finb-${suffix}@test.nexaflow.local`,
        name: "Admin Fin B",
        passwordHash,
        memberships: { create: { tenantId: tenantB.id, role: "ADMIN" } },
      },
    });

    const contactA = await prisma.contact.create({
      data: {
        tenantId: tenantA.id,
        name: "Cliente Alpha",
        email: `alpha-${suffix}@example.com`,
      },
    });
    contactAId = contactA.id;

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { accessToken: string }).accessToken;
    };

    tokenA = await login(`fina-${suffix}@test.nexaflow.local`);
    tokenB = await login(`finb-${suffix}@test.nexaflow.local`);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantAId);
    await cleanupTestTenant(tenantBId);
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("1. Retorna empty state limpo para empresa sem dados financeiros cadastrados", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/finance/overview",
      headers: auth(tokenB),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.mrr).toBe(0);
    expect(body.stats.arr).toBe(0);
    expect(body.stats.periodRevenue).toBe(0);
    expect(body.stats.avgTicket).toBe(0);
    expect(body.stats.payingClientsCount).toBe(0);
    expect(body.performance.monthlyCosts).toBe(0);
    expect(body.performance.costsConfigured).toBe(false);
    expect(body.revenueByCategory).toEqual([]);
    expect(body.upcomingCharges).toEqual([]);
    expect(body.overdueSummary.count).toBe(0);
    expect(body.history.hasEnoughHistory).toBe(false);
  });

  it("2. Tenant A cria cobrança e custo operacional com sucesso", async () => {
    const chargeRes = await app.inject({
      method: "POST",
      url: "/finance/charges",
      headers: auth(tokenA),
      payload: {
        title: "Mensalidade Consultoria",
        contactId: contactAId,
        category: "SUBSCRIPTION",
        amount: 1500,
        recurrence: "MONTHLY",
        dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        notes: "Contrato assinado em 2026",
      },
    });

    expect(chargeRes.statusCode).toBe(200);
    const charge = chargeRes.json();
    expect(charge.id).toBeDefined();
    expect(charge.amount).toBe(1500);
    expect(charge.status).toBe("PENDING");

    const costRes = await app.inject({
      method: "POST",
      url: "/finance/costs",
      headers: auth(tokenA),
      payload: {
        name: "Servidor Cloud",
        category: "INFRASTRUCTURE",
        amount: 300,
        recurrence: "MONTHLY",
        notes: "Hospedagem principal",
      },
    });

    expect(costRes.statusCode).toBe(200);
    const cost = costRes.json();
    expect(cost.id).toBeDefined();
    expect(cost.amount).toBe(300);
    expect(cost.isActive).toBe(true);
  });

  it("3. ISOLAMENTO MULTI-TENANT: Tenant B não enxerga cobranças nem custos do Tenant A", async () => {
    const listChargesB = await app.inject({
      method: "GET",
      url: "/finance/charges",
      headers: auth(tokenB),
    });
    expect(listChargesB.statusCode).toBe(200);
    expect(listChargesB.json().total).toBe(0);
    expect(listChargesB.json().items).toHaveLength(0);

    const listCostsB = await app.inject({
      method: "GET",
      url: "/finance/costs",
      headers: auth(tokenB),
    });
    expect(listCostsB.statusCode).toBe(200);
    expect(listCostsB.json()).toHaveLength(0);

    const overviewB = await app.inject({
      method: "GET",
      url: "/finance/overview",
      headers: auth(tokenB),
    });
    expect(overviewB.statusCode).toBe(200);
    expect(overviewB.json().stats.mrr).toBe(0);
  });

  it("4. IDOR PREVENTION: Tenant B não pode editar ou excluir cobrança/custo do Tenant A", async () => {
    const listChargesA = await app.inject({
      method: "GET",
      url: "/finance/charges",
      headers: auth(tokenA),
    });
    const chargeAId = listChargesA.json().items[0].id;

    const listCostsA = await app.inject({
      method: "GET",
      url: "/finance/costs",
      headers: auth(tokenA),
    });
    const costAId = listCostsA.json()[0].id;

    // Tenant B tenta alterar cobrança do Tenant A
    const idorPatchCharge = await app.inject({
      method: "PATCH",
      url: `/finance/charges/${chargeAId}`,
      headers: auth(tokenB),
      payload: { status: "PAID" },
    });
    expect(idorPatchCharge.statusCode).toBe(404);

    // Tenant B tenta deletar cobrança do Tenant A
    const idorDeleteCharge = await app.inject({
      method: "DELETE",
      url: `/finance/charges/${chargeAId}`,
      headers: auth(tokenB),
    });
    expect(idorDeleteCharge.statusCode).toBe(404);

    // Tenant B tenta alterar custo do Tenant A
    const idorPatchCost = await app.inject({
      method: "PATCH",
      url: `/finance/costs/${costAId}`,
      headers: auth(tokenB),
      payload: { amount: 9999 },
    });
    expect(idorPatchCost.statusCode).toBe(404);

    // Tenant B tenta deletar custo do Tenant A
    const idorDeleteCost = await app.inject({
      method: "DELETE",
      url: `/finance/costs/${costAId}`,
      headers: auth(tokenB),
    });
    expect(idorDeleteCost.statusCode).toBe(404);
  });

  it("5. Cálculos Financeiros: MRR, ticket médio, lucro estimado e margem no Tenant A", async () => {
    // Adiciona mais uma cobrança anual no Tenant A (R$ 12.000 / ano = R$ 1.000 / mês)
    await app.inject({
      method: "POST",
      url: "/finance/charges",
      headers: auth(tokenA),
      payload: {
        title: "Licença Anual Software",
        category: "PRODUCT",
        amount: 12000,
        recurrence: "ANNUAL",
        dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const overviewA = await app.inject({
      method: "GET",
      url: "/finance/overview",
      headers: auth(tokenA),
    });

    expect(overviewA.statusCode).toBe(200);
    const data = overviewA.json();

    // MRR = 1500 (mensal) + 1000 (12000 / 12 anual) = 2500
    expect(data.stats.mrr).toBe(2500);
    // ARR = 2500 * 12 = 30000
    expect(data.stats.arr).toBe(30000);
    // Custos = 300
    expect(data.performance.monthlyCosts).toBe(300);
    // Lucro estimado = 2500 - 300 = 2200
    expect(data.performance.estimatedProfit).toBe(2200);
    // Margem estimada = (2200 / 2500) * 100 = 88%
    expect(data.performance.estimatedMargin).toBeCloseTo(88, 1);
    expect(data.performance.costsConfigured).toBe(true);

    // Receita por categoria
    expect(data.revenueByCategory).toHaveLength(2);
    const subCat = data.revenueByCategory.find((c: { category: string }) => c.category === "SUBSCRIPTION");
    const prodCat = data.revenueByCategory.find((c: { category: string }) => c.category === "PRODUCT");
    expect(subCat?.amount).toBe(1500);
    expect(prodCat?.amount).toBe(1000);
  });

  it("6. Transição de status e pagamento de cobrança", async () => {
    const listCharges = await app.inject({
      method: "GET",
      url: "/finance/charges",
      headers: auth(tokenA),
    });
    const firstCharge = listCharges.json().items[0];

    const markPaidRes = await app.inject({
      method: "PATCH",
      url: `/finance/charges/${firstCharge.id}`,
      headers: auth(tokenA),
      payload: { status: "PAID" },
    });

    expect(markPaidRes.statusCode).toBe(200);
    expect(markPaidRes.json().status).toBe("PAID");
    expect(markPaidRes.json().paidAt).toBeDefined();
  });
});
