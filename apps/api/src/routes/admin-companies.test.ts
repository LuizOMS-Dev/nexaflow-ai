import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";

describe("Módulo Empresas Admin — Validação Completa de Negócio, Transações e Segurança", () => {
  let app: FastifyInstance;
  let superToken: string;
  let regularToken: string;
  const suffix = `cmp-${Date.now().toString(36)}`;

  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await hashPassword("Test@Pass12345");

    // 1. Cria Superadmin dedicado
    const sa = await prisma.user.create({
      data: {
        email: `sa-${suffix}@test.nexaflow.local`,
        name: `Super Admin ${suffix}`,
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(sa.id);

    // 2. Cria Usuário comum de tenant para teste de RBAC
    const initialTenant = await prisma.tenant.create({
      data: {
        name: `Base Tenant ${suffix}`,
        slug: `base-tenant-${suffix}`,
        status: "ACTIVE",
      },
    });
    createdTenantIds.push(initialTenant.id);

    const reg = await prisma.user.create({
      data: {
        email: `reg-${suffix}@test.nexaflow.local`,
        name: `Regular User ${suffix}`,
        passwordHash,
        status: "ACTIVE",
        memberships: { create: { tenantId: initialTenant.id, role: "ADMIN" } },
      },
    });
    createdUserIds.push(reg.id);

    // 3. Cria planos de teste: Gratuito, Pago (Pro) e Enterprise
    const freePlan = await prisma.plan.upsert({
      where: { slug: "free" },
      update: { isActive: true },
      create: {
        name: "Gratuito",
        slug: "free",
        priceMonthly: 0,
        priceAnnual: 0,
        isActive: true,
        maxUsers: 1,
        maxContacts: 100,
        maxChannels: 1,
        maxConversations: 50,
      },
    });
    createdPlanIds.push(freePlan.id);

    const proPlan = await prisma.plan.create({
      data: {
        name: `Profissional ${suffix}`,
        slug: `pro-${suffix}`,
        priceMonthly: 299,
        priceAnnual: 2990,
        isActive: true,
        maxUsers: 5,
        maxContacts: 5000,
        maxChannels: 3,
        maxConversations: 2000,
      },
    });
    createdPlanIds.push(proPlan.id);

    const enterprisePlan = await prisma.plan.create({
      data: {
        name: `Enterprise ${suffix}`,
        slug: `enterprise-${suffix}`,
        priceMonthly: 0,
        priceOnRequest: true,
        isActive: true,
        maxUsers: 50,
        maxContacts: 50000,
        maxChannels: 20,
        maxConversations: 20000,
      },
    });
    createdPlanIds.push(enterprisePlan.id);

    const archivedPlan = await prisma.plan.create({
      data: {
        name: `Legado Inativo ${suffix}`,
        slug: `legacy-${suffix}`,
        priceMonthly: 199,
        isActive: false,
        maxUsers: 2,
        maxContacts: 1000,
      },
    });
    createdPlanIds.push(archivedPlan.id);

    // 4. Logins
    const saLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: sa.email, password: "Test@Pass12345" },
    });
    expect(saLogin.statusCode).toBe(200);
    superToken = (saLogin.json() as { accessToken: string }).accessToken;

    const regLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: reg.email, password: "Test@Pass12345" },
    });
    expect(regLogin.statusCode).toBe(200);
    regularToken = (regLogin.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.membership.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.subscription.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.payment.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.contact.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.channel.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.pipeline.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.aiAgent.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => null);
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }).catch(() => null);
    }
    if (createdPlanIds.length > 0) {
      await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds, notIn: ["free"] } } }).catch(() => null);
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => null);
    }
    await app.close();
  });

  const auth = (token: string) => ({
    authorization: `Bearer ${token}`,
  });

  it("1. RBAC: Usuário comum é bloqueado com 403 em /admin/tenants", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/tenants",
      headers: auth(regularToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it("2. Criação com Plano Gratuito: Congela preço em R$ 0,00 e provisiona pipeline, canal e agente", async () => {
    const freePlan = createdPlanIds[0];
    const email = `admin-free-${suffix}@test.nexaflow.local`;

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Gratuita ${suffix}`,
        adminEmail: email,
        adminName: "Admin Gratuito",
        adminPassword: "StrongPassword123!",
        planId: freePlan,
      },
    });

    expect(res.statusCode).toBe(200);
    const tenant = res.json();
    createdTenantIds.push(tenant.id);

    // Valida Subscription
    const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    expect(sub).toBeTruthy();
    expect(Number(sub?.priceMonthly)).toBe(0);

    // Valida Pipeline
    const pipeline = await prisma.pipeline.findFirst({
      where: { tenantId: tenant.id },
      include: { stages: true },
    });
    expect(pipeline?.name).toBe("Funil Comercial");
    expect(pipeline?.stages.length).toBe(5);

    // Valida Channel WEBCHAT
    const channel = await prisma.channel.findFirst({ where: { tenantId: tenant.id } });
    expect(channel?.type).toBe("WEBCHAT");

    // Valida AiAgent
    const agent = await prisma.aiAgent.findFirst({ where: { tenantId: tenant.id } });
    expect(agent?.name).toBe("Assistente");

    // Valida Usuário criado e vinculado
    const adminUser = await prisma.user.findUnique({ where: { email } });
    expect(adminUser).toBeTruthy();
    if (adminUser) createdUserIds.push(adminUser.id);

    const membership = await prisma.membership.findFirst({
      where: { tenantId: tenant.id, userId: adminUser?.id },
    });
    expect(membership?.role).toBe("ADMIN");
  });

  it("3. Criação com Plano Pago (Pro): Preço contratado congelado em R$ 299,00", async () => {
    const proPlan = createdPlanIds[1];
    const email = `admin-pro-${suffix}@test.nexaflow.local`;

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Pro ${suffix}`,
        adminEmail: email,
        adminName: "Admin Pro",
        adminPassword: "StrongPassword123!",
        planId: proPlan,
      },
    });

    expect(res.statusCode).toBe(200);
    const tenant = res.json();
    createdTenantIds.push(tenant.id);

    const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    expect(sub).toBeTruthy();
    expect(Number(sub?.priceMonthly)).toBe(299);
    expect(Number(sub?.priceAnnual)).toBe(2990);
  });

  it("4. Criação com Plano Enterprise: Preço contratado permanece null (sob consulta), sem R$ 0,00 fictício", async () => {
    const enterprisePlan = createdPlanIds[2];
    const email = `admin-ent-${suffix}@test.nexaflow.local`;

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Enterprise ${suffix}`,
        adminEmail: email,
        adminName: "Admin Enterprise",
        adminPassword: "StrongPassword123!",
        planId: enterprisePlan,
      },
    });

    expect(res.statusCode).toBe(200);
    const tenant = res.json();
    createdTenantIds.push(tenant.id);

    const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    expect(sub).toBeTruthy();
    expect(sub?.priceMonthly).toBeNull();
  });

  it("5. Administrador Existente: Reutiliza usuário sem alterar senha ou duplicar registro", async () => {
    const existingEmail = `existing-${suffix}@test.nexaflow.local`;
    const initialPasswordHash = await hashPassword("InitialPass123!");

    const existingUser = await prisma.user.create({
      data: {
        email: existingEmail,
        name: "Existing Admin User",
        passwordHash: initialPasswordHash,
        status: "ACTIVE",
      },
    });
    createdUserIds.push(existingUser.id);

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Segunda Empresa ${suffix}`,
        adminEmail: existingEmail,
        adminName: "Existing Admin User",
        // Senha enviada no formulário NÃO deve sobrepor a senha atual do usuário
        adminPassword: "AttemptedNewPassword123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const tenant = res.json();
    createdTenantIds.push(tenant.id);

    // Verifica que o User continua sendo o mesmo e senha intacta
    const userAfter = await prisma.user.findUnique({ where: { email: existingEmail } });
    expect(userAfter?.id).toBe(existingUser.id);
    expect(userAfter?.passwordHash).toBe(initialPasswordHash);

    // Membership de ADMIN foi criada para o novo tenant
    const membership = await prisma.membership.findFirst({
      where: { tenantId: tenant.id, userId: existingUser.id },
    });
    expect(membership?.role).toBe("ADMIN");
  });

  it("6. Rejeição de Plano Indisponível ou Desativado", async () => {
    const archivedPlan = createdPlanIds[3];

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Invalida ${suffix}`,
        adminEmail: `invalid-plan-${suffix}@test.nexaflow.local`,
        adminName: "Admin Invalido",
        planId: archivedPlan,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("PLAN_UNAVAILABLE");
  });

  it("7. Transação Atômica: Se falhar em qualquer etapa, nenhum registro órfão é persistido", async () => {
    const nonExistentPlanId = "non-existent-plan-uuid-9999";

    const res = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Falha Atomica ${suffix}`,
        adminEmail: `atomic-fail-${suffix}@test.nexaflow.local`,
        adminName: "Admin Atomic",
        planId: nonExistentPlanId,
      },
    });

    expect(res.statusCode).toBe(400);

    // Garante que o tenant e o usuário NÃO foram persistidos no banco
    const tenant = await prisma.tenant.findFirst({
      where: { name: `Empresa Falha Atomica ${suffix}` },
    });
    expect(tenant).toBeNull();

    const user = await prisma.user.findUnique({
      where: { email: `atomic-fail-${suffix}@test.nexaflow.local` },
    });
    expect(user).toBeNull();
  });

  it("8. Alerta de Nome Semelhante e Confirmação com forceSimilarName", async () => {
    const res1 = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Pro ${suffix}`, // Mesmo nome da empresa criada no teste 3
        adminEmail: `similar-${suffix}@test.nexaflow.local`,
        adminName: "Admin Similar",
      },
    });

    expect(res1.statusCode).toBe(409);
    expect(res1.json().error).toBe("SIMILAR_TENANT_NAME");

    // Reenvio com forceSimilarName: true deve passar
    const res2 = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Pro ${suffix}`,
        adminEmail: `similar-${suffix}@test.nexaflow.local`,
        adminName: "Admin Similar",
        forceSimilarName: true,
      },
    });

    expect(res2.statusCode).toBe(200);
    createdTenantIds.push(res2.json().id);
  });

  it("9. Listagem, Filtros Combinados e KPIs Agregados", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/tenants?search=${suffix}&page=1&limit=20`,
      headers: auth(superToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.items.length).toBeGreaterThanOrEqual(4);
    expect(body.summary).toBeTruthy();
    expect(body.summary.total).toBeGreaterThanOrEqual(4);
    expect(body.summary.active).toBeGreaterThanOrEqual(4);
    expect(typeof body.summary.suspendedBlocked).toBe("number");
  });

  it("10. Validação de E-mail Inválido e Senha Fraca", async () => {
    // E-mail inválido
    const resInvalidEmail = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Valida ${suffix}`,
        adminEmail: "invalid-email-no-at-sign",
        adminName: "Admin Test",
      },
    });
    expect(resInvalidEmail.statusCode).toBe(400);

    // Senha com menos de 8 caracteres
    const resWeakPass = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Senha Curta ${suffix}`,
        adminEmail: `short-pass-${suffix}@test.nexaflow.local`,
        adminName: "Admin Test",
        adminPassword: "123",
      },
    });
    expect(resWeakPass.statusCode).toBe(400);
  });

  it("11. Slug duplicado explícito retorna 409 SLUG_TAKEN", async () => {
    const existingSlug = `custom-slug-${suffix}`;
    const firstRes = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Slug 1 ${suffix}`,
        slug: existingSlug,
        adminEmail: `slug1-${suffix}@test.nexaflow.local`,
        adminName: "Admin Slug 1",
      },
    });
    expect(firstRes.statusCode).toBe(200);
    createdTenantIds.push(firstRes.json().id);

    const dupRes = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Slug 2 ${suffix}`,
        slug: existingSlug,
        adminEmail: `slug2-${suffix}@test.nexaflow.local`,
        adminName: "Admin Slug 2",
      },
    });
    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error).toBe("SLUG_TAKEN");
  });

  it("12. Congelamento Contratual: Mudança no catálogo do Plano não altera o contrato da Subscription existente", async () => {
    const proPlanId = createdPlanIds[1];
    const email = `freeze-check-${suffix}@test.nexaflow.local`;

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/tenants",
      headers: auth(superToken),
      payload: {
        name: `Empresa Preco Congelado ${suffix}`,
        adminEmail: email,
        adminName: "Admin Freeze",
        planId: proPlanId,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const tenantId = createRes.json().id;
    createdTenantIds.push(tenantId);

    // Altera o preço de catálogo do plano de 299 para 399
    await prisma.plan.update({
      where: { id: proPlanId },
      data: { priceMonthly: 399 },
    });

    // Consulta os dados da empresa via /admin/tenants
    const getRes = await app.inject({
      method: "GET",
      url: `/admin/tenants?search=Empresa%20Preco%20Congelado%20${suffix}`,
      headers: auth(superToken),
    });
    expect(getRes.statusCode).toBe(200);
    const item = getRes.json().items.find((t: any) => t.id === tenantId);
    expect(item).toBeTruthy();
    expect(Number(item.contractedPrice)).toBe(299); // Preserva os 299 originais
  });

  it("13. Filtros por status, plano e financeiro retornam subconjuntos exatos", async () => {
    const proPlanId = createdPlanIds[1];
    const res = await app.inject({
      method: "GET",
      url: `/admin/tenants?status=ACTIVE&planId=${proPlanId}`,
      headers: auth(superToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const item of body.items) {
      expect(item.status).toBe("ACTIVE");
      expect(item.planId).toBe(proPlanId);
    }
  });
});
