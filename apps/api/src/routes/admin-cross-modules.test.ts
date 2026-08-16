import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import type { FastifyInstance } from "fastify";

describe("Auditoria Cruzada 2.0: Visão Geral + Financeiro + Planos", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  const suffix = `aud-${Date.now().toString(36)}`;
  const createdPlanIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdCostIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await hashPassword("Test@Pass12345");

    // 1. Cria Superadmin dedicado para o teste
    const sa = await prisma.user.create({
      data: {
        email: `sa-${suffix}@test.nexaflow.local`,
        name: `Superadmin Audit ${suffix}`,
        passwordHash,
        platformRole: "SUPERADMIN",
      },
    });
    createdUserIds.push(sa.id);

    // Login via endpoint oficial para obter sessão autenticada completa
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: sa.email, password: "Test@Pass12345" },
    });
    expect(loginRes.statusCode).toBe(200);
    superadminToken = (loginRes.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    // Cleanup de todas as fixtures temporárias
    if (createdCostIds.length > 0) {
      await prisma.platformOperationalCost.deleteMany({
        where: { id: { in: createdCostIds } },
      }).catch(() => null);
    }
    if (createdTenantIds.length > 0) {
      await prisma.membership.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      }).catch(() => null);
      await prisma.subscription.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      }).catch(() => null);
      await prisma.payment.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      }).catch(() => null);
      await prisma.tenant.deleteMany({
        where: { id: { in: createdTenantIds } },
      }).catch(() => null);
    }
    if (createdPlanIds.length > 0) {
      await prisma.plan.deleteMany({
        where: { id: { in: createdPlanIds } },
      }).catch(() => null);
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => null);
    }
    await app.close();
  });

  const auth = (token: string) => ({
    authorization: `Bearer ${token}`,
  });

  it("1. Catálogo → Assinatura → Consistência Exata entre Visão Geral e Financeiro", async () => {
    // Cria plano comercial com 15% de desconto
    const createPlanRes = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Alfa ${suffix}`,
        slug: `plano-alfa-${suffix}`,
        priceMonthly: 100,
        priceAnnual: 1020, // 15% OFF
        maxUsers: 2,
      },
    });
    expect(createPlanRes.statusCode).toBe(200);
    const planA = createPlanRes.json();
    createdPlanIds.push(planA.id);

    // Cria empresa e vincula ao plano com assinatura contratada de R$ 100
    const tenantA = await prisma.tenant.create({
      data: {
        name: `Empresa Alfa ${suffix}`,
        slug: `empresa-alfa-${suffix}`,
        status: "ACTIVE",
        planId: planA.id,
      },
    });
    createdTenantIds.push(tenantA.id);

    await prisma.subscription.create({
      data: {
        tenantId: tenantA.id,
        planId: planA.id,
        billingStatus: "ACTIVE",
        billingCycle: "MONTHLY",
        priceMonthly: 100,
        priceAnnual: 1020,
      },
    });

    // Consulta Visão Geral e Financeiro
    const [overviewRes, financeRes] = await Promise.all([
      app.inject({ method: "GET", url: "/admin/overview", headers: auth(superadminToken) }),
      app.inject({ method: "GET", url: "/admin/finance", headers: auth(superadminToken) }),
    ]);

    expect(overviewRes.statusCode).toBe(200);
    expect(financeRes.statusCode).toBe(200);

    const overview = overviewRes.json();
    const finance = financeRes.json();

    // MRR e ARR compartilham rigorosamente o mesmo valor
    expect(overview.stats.mrr).toBe(finance.summary.mrr);
    expect(overview.stats.arr).toBe(finance.summary.arr);
    expect(overview.stats.paidSubscriptions).toBe(finance.summary.paidSubscriptions);

    // Receita por plano fecha exatamente no total do MRR
    const totalPlanMrr = finance.revenueByPlan.reduce((acc: number, p: any) => acc + p.mrr, 0);
    expect(totalPlanMrr).toBe(finance.summary.mrr);
  }, 60_000);

  it("2. Imutabilidade Contratual: Reajustar catálogo de R$ 100 para R$ 200 não afeta assinatura existente", async () => {
    const planAId = createdPlanIds[0];

    // Atualiza o catálogo para R$ 200
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/admin/plans/${planAId}`,
      headers: auth(superadminToken),
      payload: {
        priceMonthly: 200,
        priceAnnual: 2040,
      },
    });
    expect(patchRes.statusCode).toBe(200);

    // Verifica que a assinatura da Empresa Alfa continua R$ 100
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: createdTenantIds[0] },
    });
    expect(Number(sub?.priceMonthly)).toBe(100);

    // Overview e Finance continuam consistentes
    const [overviewRes, financeRes] = await Promise.all([
      app.inject({ method: "GET", url: "/admin/overview", headers: auth(superadminToken) }),
      app.inject({ method: "GET", url: "/admin/finance", headers: auth(superadminToken) }),
    ]);
    expect(overviewRes.json().stats.mrr).toBe(financeRes.json().summary.mrr);
  }, 60_000);

  it("3. Nova Contratação no Novo Valor reflete imediatamente no MRR combinado", async () => {
    const planAId = createdPlanIds[0];

    // Cria segunda empresa contratando pelo novo preço de R$ 200
    const tenantB = await prisma.tenant.create({
      data: {
        name: `Empresa Beta ${suffix}`,
        slug: `empresa-beta-${suffix}`,
        status: "ACTIVE",
        planId: planAId,
      },
    });
    createdTenantIds.push(tenantB.id);

    await prisma.subscription.create({
      data: {
        tenantId: tenantB.id,
        planId: planAId,
        billingStatus: "ACTIVE",
        billingCycle: "MONTHLY",
        priceMonthly: 200,
        priceAnnual: 2040,
      },
    });

    const [overviewRes, financeRes] = await Promise.all([
      app.inject({ method: "GET", url: "/admin/overview", headers: auth(superadminToken) }),
      app.inject({ method: "GET", url: "/admin/finance", headers: auth(superadminToken) }),
    ]);

    const overview = overviewRes.json();
    const finance = financeRes.json();

    expect(overview.stats.mrr).toBe(finance.summary.mrr);
    expect(overview.stats.arr).toBe(finance.summary.arr);
  }, 60_000);

  it("4. Arquivamento de Plano: Preserva contratos existentes no Financeiro", async () => {
    const planAId = createdPlanIds[0];

    // Arquiva o plano
    const archiveRes = await app.inject({
      method: "PATCH",
      url: `/admin/plans/${planAId}`,
      headers: auth(superadminToken),
      payload: { isActive: false },
    });
    expect(archiveRes.statusCode).toBe(200);

    // O MRR continua ativo e idêntico em Overview e Financeiro
    const [overviewRes, financeRes] = await Promise.all([
      app.inject({ method: "GET", url: "/admin/overview", headers: auth(superadminToken) }),
      app.inject({ method: "GET", url: "/admin/finance", headers: auth(superadminToken) }),
    ]);

    const overview = overviewRes.json();
    const finance = financeRes.json();

    expect(overview.stats.mrr).toBe(finance.summary.mrr);
  }, 60_000);

  it("5. Limites Dinâmicos & Overrides: Enforcement no backend", async () => {
    const { getTenantLimits, assertCanAddUser } = await import("../services/entitlements");
    const tenantAId = createdTenantIds[0];

    // Tenant A herda limites do plano (maxUsers: 2)
    const limitsDefault = await getTenantLimits(tenantAId);
    expect(limitsDefault.maxUsers).toBe(2);

    // Cria 2 usuários
    const u1 = await prisma.user.create({
      data: { email: `u1-${suffix}@test.nexaflow.local`, name: "U1", passwordHash: "x" },
    });
    const u2 = await prisma.user.create({
      data: { email: `u2-${suffix}@test.nexaflow.local`, name: "U2", passwordHash: "x" },
    });
    createdUserIds.push(u1.id, u2.id);

    await prisma.membership.createMany({
      data: [
        { userId: u1.id, tenantId: tenantAId, role: "AGENT", isActive: true },
        { userId: u2.id, tenantId: tenantAId, role: "AGENT", isActive: true },
      ],
    });

    // Tentativa de adicionar 3º usuário é rejeitada pelo assertCanAddUser
    await expect(assertCanAddUser(tenantAId)).rejects.toThrow("Seu plano permite até 2 usuários.");

    // Aplica Override customizado para 5 usuários
    await prisma.tenant.update({
      where: { id: tenantAId },
      data: {
        settings: { customLimits: { maxUsers: 5 } },
      },
    });

    const limitsOverride = await getTenantLimits(tenantAId);
    expect(limitsOverride.maxUsers).toBe(5);

    // Agora assertCanAddUser passa sem erro
    await expect(assertCanAddUser(tenantAId)).resolves.toBeUndefined();
  }, 60_000);

  it("6. Custos Operacionais: Cálculo de Margem e Resultado Estimado", async () => {
    // Adiciona custo de infraestrutura de R$ 50
    const createCostRes = await app.inject({
      method: "POST",
      url: "/admin/finance/costs",
      headers: auth(superadminToken),
      payload: {
        name: `Servidor AWS ${suffix}`,
        category: "INFRASTRUCTURE",
        amount: 50,
        recurrence: "MONTHLY",
      },
    });
    expect(createCostRes.statusCode).toBe(200);
    const cost = createCostRes.json();
    createdCostIds.push(cost.id);

    const finRes = await app.inject({
      method: "GET",
      url: "/admin/finance",
      headers: auth(superadminToken),
    });
    const fin = finRes.json();

    expect(fin.performance.costsConfigured).toBe(true);
    expect(fin.performance.monthlyCosts).toBeGreaterThanOrEqual(50);
    expect(fin.performance.estimatedProfit).toBe(fin.performance.mrr - fin.performance.monthlyCosts);
    if (fin.performance.mrr > 0) {
      expect(fin.performance.estimatedMargin).toBe(
        (fin.performance.estimatedProfit / fin.performance.mrr) * 100
      );
    }
  }, 60_000);
});
