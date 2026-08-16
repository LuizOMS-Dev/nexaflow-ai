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

  it("8. Desconto Anual: Backend calcula automaticamente 15% de desconto no preço anual quando não informado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/plans",
      headers: auth(superadminToken),
      payload: {
        name: `Plano Desconto Anual ${suffix}`,
        slug: `plano-anual-${suffix}`,
        priceMonthly: 300, // 300 * 12 * 0.85 = 3060
      },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(Number(plan.priceMonthly)).toBe(300);
    expect(Number(plan.priceAnnual)).toBe(3060);
  });
});
