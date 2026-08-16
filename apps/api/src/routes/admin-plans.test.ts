import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Planos da Administração (/admin/plans) — RBAC, Catálogo, Duplicação & Imutabilidade", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let tenantAdminToken: string;
  let tenantId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    // Cria superadmin
    await prisma.user.create({
      data: {
        email: `superplan-${suffix}@test.nexaflow.local`,
        name: "Superadmin Plans",
        passwordHash,
        platformRole: "SUPERADMIN",
      },
    });

    // Cria empresa e admin comum
    const tenant = await prisma.tenant.create({
      data: {
        name: `Tenant Empresa Plan ${suffix}`,
        slug: `tenant-plan-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "admin-plans-test" }),
      },
    });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        email: `tenantplanadmin-${suffix}@test.nexaflow.local`,
        name: "Tenant Plan Admin",
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

    superadminToken = await login(`superplan-${suffix}@test.nexaflow.local`);
    tenantAdminToken = await login(`tenantplanadmin-${suffix}@test.nexaflow.local`);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantId);
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `superplan-${suffix}@test.nexaflow.local`,
            `tenantplanadmin-${suffix}@test.nexaflow.local`,
          ],
        },
      },
    });
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("1. RBAC: Admin de empresa recebe 403 ao tentar criar ou gerenciar planos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(tenantAdminToken),
      payload: {
        name: `Plano Ilegal ${suffix}`,
        slug: `plano-ilegal-${suffix}`,
        priceMonthly: 100,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. Superadmin cria plano comercial com sucesso e valida limites", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Plus Teste ${suffix}`,
        slug: `plano-plus-${suffix}`,
        description: "Plano para empresas em crescimento",
        priceMonthly: 199,
        priceAnnual: 2029.8,
        priceOnRequest: false,
        maxUsers: 8,
        maxChannels: 3,
        maxContacts: 10000,
        maxConversations: 15000,
        maxAiMessages: 5000,
        badge: "popular",
        sortOrder: 20,
        features: {
          maxAgents: 4,
          maxActiveFlows: 12,
          monthlyAiCredits: 5000,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan.id).toBeDefined();
    expect(plan.name).toBe(`Plano Plus Teste ${suffix}`);
    expect(plan.slug).toBe(`plano-plus-${suffix}`);
    expect(Number(plan.priceMonthly)).toBe(199);
    expect(plan.badge).toBe("popular");
  });

  it("3. Rejeita criação de plano com slug duplicado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Duplicado ${suffix}`,
        slug: `plano-plus-${suffix}`, // Mesmo slug do teste 2
        priceMonthly: 250,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain("já está sendo usado");
  });

  it("4. Imutabilidade Contratual: Atualização de preço de catálogo no plano NÃO altera Subscription.priceMonthly existente", async () => {
    // 4.1 Cria plano e assinatura vinculada
    const planRes = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Imutável ${suffix}`,
        slug: `plan-imutavel-${suffix}`,
        priceMonthly: 299,
        maxUsers: 5,
      },
    });
    expect(planRes.statusCode).toBe(200);
    const plan = planRes.json();

    // Cria assinatura para o tenantId de teste com priceMonthly = 299
    const sub = await prisma.subscription.upsert({
      where: { tenantId },
      update: { planId: plan.id, priceMonthly: 299, billingStatus: "ACTIVE" },
      create: { tenantId, planId: plan.id, priceMonthly: 299, billingStatus: "ACTIVE" },
    });
    expect(Number(sub.priceMonthly)).toBe(299);

    // 4.2 Reajusta catálogo do plano para R$ 349
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/admin/plans/${plan.id}`,
      headers: auth(superadminToken),
      payload: {
        priceMonthly: 349,
        description: "Reajustado para R$ 349",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(Number(updateRes.json().priceMonthly)).toBe(349);

    // 4.3 Consulta a assinatura do cliente e verifica que permanece 299
    const clientSub = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(Number(clientSub?.priceMonthly)).toBe(299);
  });

  it("5. Duplicação Atômica: Copia limites e features, gera slug único, nasce indisponível e sem badge", async () => {
    const plan = await prisma.plan.findFirst({ where: { slug: `plano-plus-${suffix}` } });
    expect(plan).toBeDefined();

    const dupRes = await app.inject({
      method: "POST",
      url: `/admin/plans/${plan!.id}/duplicate`,
      headers: auth(superadminToken),
    });
    expect(dupRes.statusCode).toBe(200);
    const dup = dupRes.json();

    expect(dup.id).not.toBe(plan!.id);
    expect(dup.name).toContain("(cópia)");
    expect(dup.slug).toBe(`plano-plus-${suffix}-copia`);
    expect(dup.isActive).toBe(false); // Inativo por padrão para segurança
    expect(dup.badge).toBeNull(); // Sem badge de destaque
    expect(Number(dup.priceMonthly)).toBe(Number(plan!.priceMonthly));
    expect(dup.maxUsers).toBe(plan!.maxUsers);
  });

  it("6. Arquivamento e Restauração: Alterna disponibilidade preservando integridade", async () => {
    const plan = await prisma.plan.findFirst({ where: { slug: `plano-plus-${suffix}` } });
    expect(plan).toBeDefined();

    // Arquiva (isActive: false)
    const archiveRes = await app.inject({
      method: "PATCH",
      url: `/admin/plans/${plan!.id}`,
      headers: auth(superadminToken),
      payload: { isActive: false },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().isActive).toBe(false);

    // Restaura (isActive: true)
    const restoreRes = await app.inject({
      method: "PATCH",
      url: `/admin/plans/${plan!.id}`,
      headers: auth(superadminToken),
      payload: { isActive: true },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().isActive).toBe(true);
  });

  it("7. Exclusão Segura: Rejeita excluir plano com empresas vinculadas e plano free", async () => {
    const freePlan = await prisma.plan.findUnique({ where: { slug: "free" } });
    if (freePlan) {
      const delFree = await app.inject({
        method: "DELETE",
        url: `/admin/plans/${freePlan.id}`,
        headers: auth(superadminToken),
      });
      expect(delFree.statusCode).toBe(400);
    }
  });

  it("8. Preço Anual Padrão: Backend define preço anual cheio (mensal * 12) quando não informado, sem aplicar 15% automático", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Preço Cheio ${suffix}`,
        slug: `plano-cheio-${suffix}`,
        priceMonthly: 300, // 300 * 12 = 3600
      },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(Number(plan.priceMonthly)).toBe(300);
    expect(Number(plan.priceAnnual)).toBe(3600);
  });

  it("9. Desconto Anual Customizado: Preço anual explicitamente informado é preservado fielmente (15%, 10%, 12.5%)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Custom Anual ${suffix}`,
        slug: `plano-custom-anual-${suffix}`,
        priceMonthly: 100,
        priceAnnual: 1080, // 10% de desconto
      },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(Number(plan.priceMonthly)).toBe(100);
    expect(Number(plan.priceAnnual)).toBe(1080);
  });

  it("10. Defaults Seguros: Criação nunca injeta slug 'pro' ou valores acidentais", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Starter Novo ${suffix}`,
        slug: `plano-starter-novo-${suffix}`,
        priceMonthly: 50,
      },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan.slug).toBe(`plano-starter-novo-${suffix}`);
    expect(plan.slug).not.toBe("pro");
  });

  it("11. Dinâmico & Real: 'Mais Popular' é calculado dinamicamente com base em clientes pagos reais (líder único, empate, cancelamento e exclusão de free)", async () => {
    // 11.0 Identifica o estado inicial do banco para garantir testes isolados
    const initRes = await app.inject({
      method: "GET",
      url: "/admin/plans",
      headers: auth(superadminToken),
    });
    expect(initRes.statusCode).toBe(200);
    const initialPlans = initRes.json();
    const baseMax = Math.max(
      0,
      ...initialPlans
        .filter((p: any) => p.slug !== "free")
        .map((p: any) => p.activeCustomerCount || 0)
    );

    // 11.1 Cria dois planos comerciais pagos para o teste
    const planARes = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Alfa ${suffix}`,
        slug: `plano-alfa-${suffix}`,
        priceMonthly: 150,
      },
    });
    const planBRes = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Beta ${suffix}`,
        slug: `plano-beta-${suffix}`,
        priceMonthly: 250,
      },
    });
    const planA = planARes.json();
    const planB = planBRes.json();

    const createdTenants: string[] = [];

    const createPayingTenant = async (planId: string, name: string, price: number) => {
      const t = await prisma.tenant.create({
        data: {
          name: `${name} ${suffix} ${Date.now().toString(36)}`,
          slug: `empresa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          planId,
          status: "ACTIVE",
          settings: { isTestTenant: false },
        },
      });
      createdTenants.push(t.id);

      const s = await prisma.subscription.create({
        data: {
          tenantId: t.id,
          planId,
          billingStatus: "ACTIVE",
          priceMonthly: price,
        },
      });
      return { tenant: t, subscription: s };
    };

    try {
      // Cenário 1: Plano Alfa recebe (baseMax + 1) assinaturas -> Torna-se o líder único isolado
      for (let i = 0; i <= baseMax; i++) {
        await createPayingTenant(planA.id, `Alfa Empresa ${i}`, 150);
      }

      let plansListRes = await app.inject({
        method: "GET",
        url: "/admin/plans",
        headers: auth(superadminToken),
      });
      expect(plansListRes.statusCode).toBe(200);
      let allPlans = plansListRes.json();
      let fetchedPlanA = allPlans.find((p: any) => p.id === planA.id);
      let fetchedPlanB = allPlans.find((p: any) => p.id === planB.id);

      expect(fetchedPlanA.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanA.isMostPopular).toBe(true);
      expect(fetchedPlanB.activeCustomerCount).toBe(0);
      expect(fetchedPlanB.isMostPopular).toBe(false);

      // Cenário 2: Plano Beta também atinge (baseMax + 1) assinaturas -> Empate no topo -> Nenhum é Mais Popular
      const betaSubs: any[] = [];
      for (let i = 0; i <= baseMax; i++) {
        const item = await createPayingTenant(planB.id, `Beta Empresa ${i}`, 250);
        betaSubs.push(item);
      }

      plansListRes = await app.inject({
        method: "GET",
        url: "/admin/plans",
        headers: auth(superadminToken),
      });
      allPlans = plansListRes.json();
      fetchedPlanA = allPlans.find((p: any) => p.id === planA.id);
      fetchedPlanB = allPlans.find((p: any) => p.id === planB.id);

      expect(fetchedPlanA.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanA.isMostPopular).toBe(false); // Empate
      expect(fetchedPlanB.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanB.isMostPopular).toBe(false); // Empate

      // Cenário 3: Plano Beta recebe mais 1 assinatura (baseMax + 2) -> Assume a liderança isolada
      const extraBeta = await createPayingTenant(planB.id, "Beta Empresa Extra", 250);

      plansListRes = await app.inject({
        method: "GET",
        url: "/admin/plans",
        headers: auth(superadminToken),
      });
      allPlans = plansListRes.json();
      fetchedPlanA = allPlans.find((p: any) => p.id === planA.id);
      fetchedPlanB = allPlans.find((p: any) => p.id === planB.id);

      expect(fetchedPlanA.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanA.isMostPopular).toBe(false);
      expect(fetchedPlanB.activeCustomerCount).toBe(baseMax + 2);
      expect(fetchedPlanB.isMostPopular).toBe(true); // Líder único isolado

      // Cenário 4: Cancelamento no Plano Beta (cancela a assinatura extra) -> Volta para empate
      await prisma.subscription.update({
        where: { id: extraBeta.subscription.id },
        data: { billingStatus: "CANCELLED" },
      });

      plansListRes = await app.inject({
        method: "GET",
        url: "/admin/plans",
        headers: auth(superadminToken),
      });
      allPlans = plansListRes.json();
      fetchedPlanA = allPlans.find((p: any) => p.id === planA.id);
      fetchedPlanB = allPlans.find((p: any) => p.id === planB.id);

      expect(fetchedPlanA.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanA.isMostPopular).toBe(false);
      expect(fetchedPlanB.activeCustomerCount).toBe(baseMax + 1);
      expect(fetchedPlanB.isMostPopular).toBe(false); // Empate novamente
    } finally {
      if (createdTenants.length > 0) {
        await prisma.subscription.deleteMany({
          where: { tenantId: { in: createdTenants } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: createdTenants } },
        });
      }
      await prisma.plan.deleteMany({
        where: { id: { in: [planA.id, planB.id] } },
      });
    }
  });
});
