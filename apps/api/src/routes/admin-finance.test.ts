import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Financeiro do Superadmin (/admin/finance) — RBAC, Métricas & Custos", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let tenantAdminToken: string;
  let tenantId: string;
  let superadminUserId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    // Cria superadmin
    const superadmin = await prisma.user.create({
      data: {
        email: `superfin-${suffix}@test.nexaflow.local`,
        name: "Superadmin Fin",
        passwordHash,
        platformRole: "SUPERADMIN",
      },
    });
    superadminUserId = superadmin.id;

    // Cria empresa e admin comum
    const tenant = await prisma.tenant.create({
      data: {
        name: `Tenant Empresa Fin ${suffix}`,
        slug: `tenant-fin-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "superadmin-finance-test" }),
      },
    });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        email: `tenantadmin-${suffix}@test.nexaflow.local`,
        name: "Tenant Admin",
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { accessToken: string }).accessToken;
    };

    superadminToken = await login(`superfin-${suffix}@test.nexaflow.local`);
    tenantAdminToken = await login(`tenantadmin-${suffix}@test.nexaflow.local`);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantId);
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `superfin-${suffix}@test.nexaflow.local`,
            `tenantadmin-${suffix}@test.nexaflow.local`,
          ],
        },
      },
    });
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("1. RBAC: Admin de empresa recebe 403 ao tentar acessar /admin/finance", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/finance",
      headers: auth(tenantAdminToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. Superadmin acessa /admin/finance com sucesso e recebe contrato completo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/finance",
      headers: auth(superadminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.mrr).toBeDefined();
    expect(body.summary.arr).toBeDefined();
    expect(body.summary.avgTicket).toBeDefined();
    expect(body.summary.paidSubscriptions).toBeDefined();
    expect(body.performance).toBeDefined();
    expect(body.revenueByPlan).toBeDefined();
    expect(Array.isArray(body.revenueByPlan)).toBe(true);
    expect(body.recentSubscriptions).toBeDefined();
    expect(body.trials).toBeDefined();
    expect(body.attention).toBeDefined();
    expect(body.history).toBeDefined();
  });

  it("3. Superadmin gerencia custos operacionais da plataforma (CRUD)", async () => {
    // 3.1 Criação de custo
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/finance/costs",
      headers: auth(superadminToken),
      payload: {
        name: `Servidor EasyPanel Cloud ${suffix}`,
        category: "INFRASTRUCTURE",
        amount: 350,
        recurrence: "MONTHLY",
        notes: "Servidor primário de produção",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const cost = createRes.json();
    expect(cost.id).toBeDefined();
    expect(cost.amount).toBe(350);

    // 3.2 Listagem de custos
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/finance/costs",
      headers: auth(superadminToken),
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    const created = list.find((c: { id: string }) => c.id === cost.id);
    expect(created).toBeDefined();
    expect(created.name).toBe(`Servidor EasyPanel Cloud ${suffix}`);

    // 3.3 Edição / Atualização
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/admin/finance/costs/${cost.id}`,
      headers: auth(superadminToken),
      payload: {
        amount: 450,
        notes: "Atualizado para 450 BRL",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().amount).toBe(450);

    // 3.4 Exclusão
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/admin/finance/costs/${cost.id}`,
      headers: auth(superadminToken),
    });
    expect(deleteRes.statusCode).toBe(200);
  });

  it("4. Consistência: ARR é estritamente MRR * 12 e ticket médio trata divisão por zero com segurança", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/finance",
      headers: auth(superadminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const { mrr, arr, avgTicket, paidSubscriptions } = body.summary;
    expect(arr).toBe(mrr * 12);
    if (paidSubscriptions > 0) {
      expect(avgTicket).toBeCloseTo(mrr / paidSubscriptions, 2);
    } else {
      expect(avgTicket).toBe(0);
    }
  });

  it("5. Performance: Lucro e margem estimados refletem MRR e custos ativos", async () => {
    // Cria custo ativo temporário
    const costRes = await app.inject({
      method: "POST",
      url: "/admin/finance/costs",
      headers: auth(superadminToken),
      payload: {
        name: `Infra IA Groq ${suffix}`,
        category: "AI",
        amount: 200,
        recurrence: "MONTHLY",
      },
    });
    expect(costRes.statusCode).toBe(200);
    const cost = costRes.json();

    const finRes = await app.inject({
      method: "GET",
      url: "/admin/finance",
      headers: auth(superadminToken),
    });
    expect(finRes.statusCode).toBe(200);
    const fin = finRes.json();
    expect(fin.performance.costsConfigured).toBe(true);
    expect(fin.performance.monthlyCosts).toBeGreaterThanOrEqual(200);
    expect(fin.performance.estimatedProfit).toBe(fin.summary.mrr - fin.performance.monthlyCosts);

    // Cleanup
    await app.inject({
      method: "DELETE",
      url: `/admin/finance/costs/${cost.id}`,
      headers: auth(superadminToken),
    });
  });

  it("6. Consistência Absoluta: /admin/overview e /admin/finance compartilham exatamente os mesmos valores de MRR, ARR e empresas pagantes", async () => {
    const [overviewRes, financeRes] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/admin/overview",
        headers: auth(superadminToken),
      }),
      app.inject({
        method: "GET",
        url: "/admin/finance",
        headers: auth(superadminToken),
      }),
    ]);

    expect(overviewRes.statusCode).toBe(200);
    expect(financeRes.statusCode).toBe(200);

    const overview = overviewRes.json();
    const finance = financeRes.json();

    // Compara MRR, ARR, Ticket Médio e Empresas Pagantes
    expect(finance.summary.mrr).toBe(overview.finance.mrr);
    expect(finance.summary.arr).toBe(overview.finance.arr);
    expect(finance.summary.avgTicket).toBe(overview.finance.avgTicket);
    expect(finance.summary.paidSubscriptions).toBe(overview.finance.paidSubscriptions);
    expect(finance.performance.costsConfigured).toBe(overview.finance.costsAvailable);
  });
});


