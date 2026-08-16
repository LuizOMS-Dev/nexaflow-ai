import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

describe("Leads Comerciais da Administração (/admin/sales-leads) — Backend, KPIs, Status, Conversão & Segurança", () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let tenantAdminToken: string;
  let regularTenantId: string;
  const createdTenantIds: string[] = [];
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan =
      (await prisma.plan.findFirst({ where: { slug: "free", isActive: true } })) ||
      (await prisma.plan.findFirst({ where: { isActive: true } }));

    // 1. Cria Superadmin
    const superadmin = await prisma.user.create({
      data: {
        email: `superlead-${suffix}@test.nexaflow.local`,
        name: "Superadmin Leads",
        passwordHash,
        platformRole: "SUPERADMIN",
      },
    });

    // 2. Cria Tenant e Admin comum (não superadmin)
    const tenant = await prisma.tenant.create({
      data: {
        name: `Tenant Lead Test ${suffix}`,
        slug: `tenant-lead-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "admin-leads-test" }),
      },
    });
    regularTenantId = tenant.id;
    createdTenantIds.push(tenant.id);

    const tenantAdmin = await prisma.user.create({
      data: {
        email: `tenantleadadmin-${suffix}@test.nexaflow.local`,
        name: "Tenant Lead Admin",
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
        headers: { origin: "http://localhost:3000" },
      });
      return (res.json() as { accessToken: string }).accessToken;
    };

    superadminToken = await login(superadmin.email);
    tenantAdminToken = await login(tenantAdmin.email);
  }, 60_000);

  afterAll(async () => {
    for (const tId of createdTenantIds) {
      await cleanupTestTenant(tId).catch(() => null);
    }
    await prisma.salesLead
      .deleteMany({
        where: { email: { contains: suffix } },
      })
      .catch(() => null);
    await app.close().catch(() => null);
  });

  it("1. RBAC: rejeita acesso sem token ou com usuário não-superadmin", async () => {
    const unauth = await app.inject({
      method: "GET",
      url: "/admin/sales-leads",
    });
    expect(unauth.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: "GET",
      url: "/admin/sales-leads",
      headers: { authorization: `Bearer ${tenantAdminToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("2. Listagem, KPIs reais agregados e filtros de busca / status", async () => {
    // Cria conjunto controlado de leads para validação exata
    const leadNew = await prisma.salesLead.create({
      data: {
        name: `Lead Alfa ${suffix}`,
        email: `alfa-${suffix}@empresa-alfa.test`,
        companyName: `Alfa Tech ${suffix}`,
        phone: "+55 11 98888-1111",
        status: "NEW",
        source: "website",
      },
    });

    const leadContacted = await prisma.salesLead.create({
      data: {
        name: `Lead Beta ${suffix}`,
        email: `beta-${suffix}@empresa-beta.test`,
        companyName: `Beta Soluções ${suffix}`,
        phone: "+55 21 97777-2222",
        status: "CONTACTED",
        source: "website",
      },
    });

    const leadQualified = await prisma.salesLead.create({
      data: {
        name: `Lead Gama ${suffix}`,
        email: `gama-${suffix}@empresa-gama.test`,
        companyName: `Gama Corp ${suffix}`,
        status: "QUALIFIED",
        source: "website",
      },
    });

    const leadLost = await prisma.salesLead.create({
      data: {
        name: `Lead Delta ${suffix}`,
        email: `delta-${suffix}@empresa-delta.test`,
        companyName: `Delta Ltd ${suffix}`,
        status: "LOST",
        source: "website",
      },
    });

    const leadSpam = await prisma.salesLead.create({
      data: {
        name: `Lead Epsilon ${suffix}`,
        email: `epsilon-${suffix}@spam.test`,
        companyName: `Spam Co ${suffix}`,
        status: "SPAM",
        source: "website",
      },
    });

    // 2.1 Consulta geral
    const resAll = await app.inject({
      method: "GET",
      url: "/admin/sales-leads",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resAll.statusCode).toBe(200);
    const bodyAll = resAll.json() as {
      items: Array<{ id: string; status: string; name: string }>;
      total: number;
      summary: {
        total: number;
        new: number;
        inPipeline: number;
        converted: number;
        lost: number;
        spam: number;
      };
    };

    expect(bodyAll.summary.total).toBeGreaterThanOrEqual(5);
    expect(bodyAll.summary.new).toBeGreaterThanOrEqual(1);
    expect(bodyAll.summary.inPipeline).toBeGreaterThanOrEqual(2); // CONTACTED + QUALIFIED
    expect(bodyAll.summary.lost).toBeGreaterThanOrEqual(1);
    expect(bodyAll.summary.spam).toBeGreaterThanOrEqual(1);

    // 2.2 Busca server-side por nome
    const resSearchName = await app.inject({
      method: "GET",
      url: `/admin/sales-leads?search=Alfa Tech ${suffix}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resSearchName.statusCode).toBe(200);
    const bodySearchName = resSearchName.json();
    expect(bodySearchName.items.length).toBe(1);
    expect(bodySearchName.items[0].id).toBe(leadNew.id);

    // 2.3 Busca server-side por telefone
    const resSearchPhone = await app.inject({
      method: "GET",
      url: `/admin/sales-leads?search=97777-2222`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resSearchPhone.statusCode).toBe(200);
    const bodySearchPhone = resSearchPhone.json();
    expect(bodySearchPhone.items.some((i: any) => i.id === leadContacted.id)).toBe(true);

    // 2.4 Filtro por status QUALIFIED
    const resStatusFilter = await app.inject({
      method: "GET",
      url: `/admin/sales-leads?status=QUALIFIED`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(resStatusFilter.statusCode).toBe(200);
    const bodyStatus = resStatusFilter.json();
    expect(bodyStatus.items.every((i: any) => i.status === "QUALIFIED")).toBe(true);
    expect(bodyStatus.items.some((i: any) => i.id === leadQualified.id)).toBe(true);
  });

  it("3. Atualização de status e bloqueio de CONVERTED direto", async () => {
    const lead = await prisma.salesLead.create({
      data: {
        name: `Lead Status Test ${suffix}`,
        email: `status-${suffix}@empresa.test`,
        companyName: `Status Corp ${suffix}`,
        status: "NEW",
        source: "website",
      },
    });

    // 3.1 Atualiza para CONTACTED
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/admin/sales-leads/${lead.id}`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { status: "CONTACTED" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("CONTACTED");

    // Verifica que AuditLog foi gerado
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "admin.lead.update_status", metadata: { path: ["leadId"], equals: lead.id } },
    });
    expect(auditLog).toBeTruthy();

    // 3.2 Tentativa de alterar diretamente para CONVERTED sem converter empresa deve ser rejeitada
    const directConvertRes = await app.inject({
      method: "PATCH",
      url: `/admin/sales-leads/${lead.id}`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { status: "CONVERTED" },
    });
    expect(directConvertRes.statusCode).toBe(400);
  });

  it("4. Conversão oficial e transacional em Empresa", async () => {
    const freePlan =
      (await prisma.plan.findFirst({ where: { slug: "free", isActive: true } })) ||
      (await prisma.plan.findFirst({ where: { isActive: true } }));

    const lead = await prisma.salesLead.create({
      data: {
        name: "Carlos Fundador",
        email: `carlos-${suffix}@novastartup.local`,
        companyName: `Nova Startup ${suffix}`,
        phone: "+55 11 91234-5678",
        teamSize: "6-15",
        message: "Gostaria de contratar o plano para minha equipe de 10 pessoas.",
        status: "QUALIFIED",
        source: "website",
      },
    });

    // Executa conversão
    const convertRes = await app.inject({
      method: "POST",
      url: `/admin/sales-leads/${lead.id}/convert`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        name: `Nova Startup ${suffix}`,
        planId: freePlan?.id,
        adminName: "Carlos Fundador",
        adminEmail: `carlos-${suffix}@novastartup.local`,
        adminPassword: "Password@12345",
      },
    });

    expect(convertRes.statusCode).toBe(200);
    const convertBody = convertRes.json() as {
      company: { id: string; name: string; slug: string };
      lead: { id: string; status: string; convertedTenantId: string };
    };

    expect(convertBody.company.id).toBeTruthy();
    createdTenantIds.push(convertBody.company.id);

    expect(convertBody.lead.status).toBe("CONVERTED");
    expect(convertBody.lead.convertedTenantId).toBe(convertBody.company.id);

    // Verifica persistência no banco
    const dbLead = await prisma.salesLead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { convertedTenant: true },
    });
    expect(dbLead.status).toBe("CONVERTED");
    expect(dbLead.convertedTenantId).toBe(convertBody.company.id);
    expect(dbLead.convertedTenant?.id).toBe(convertBody.company.id);

    // Verifica recursos criados na empresa através do service oficial
    const [tenantDetails, subscription] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: convertBody.company.id },
        include: {
          members: { include: { user: true } },
          pipelines: { include: { stages: true } },
          channels: true,
          aiAgents: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { tenantId: convertBody.company.id },
      }),
    ]);

    expect(tenantDetails.name).toBe(`Nova Startup ${suffix}`);
    expect(tenantDetails.members[0].user.email).toBe(`carlos-${suffix}@novastartup.local`);
    expect(tenantDetails.members[0].role).toBe("ADMIN");
    expect(tenantDetails.pipelines.length).toBeGreaterThanOrEqual(1);
    expect(tenantDetails.channels.length).toBeGreaterThanOrEqual(1);
    expect(tenantDetails.aiAgents.length).toBeGreaterThanOrEqual(1);
    expect(subscription).toBeTruthy();

    // 4.1 Tentativa de re-converter lead já convertido retorna 409
    const reconvertRes = await app.inject({
      method: "POST",
      url: `/admin/sales-leads/${lead.id}/convert`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        name: `Outra Empresa ${suffix}`,
      },
    });
    expect(reconvertRes.statusCode).toBe(409);
  });

  it("5. Falha durante conversão (ex: plano inexistente) mantém lead NÃO convertido", async () => {
    const lead = await prisma.salesLead.create({
      data: {
        name: "Lead Falha Test",
        email: `falha-${suffix}@empresa-falha.local`,
        companyName: `Empresa Falha ${suffix}`,
        status: "QUALIFIED",
        source: "website",
      },
    });

    const failedConvertRes = await app.inject({
      method: "POST",
      url: `/admin/sales-leads/${lead.id}/convert`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        planId: "plano_inexistente_12345",
      },
    });

    expect(failedConvertRes.statusCode).toBe(400);

    // Lead continua com status original e sem empresa vinculada
    const checkLead = await prisma.salesLead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(checkLead.status).toBe("QUALIFIED");
    expect(checkLead.convertedTenantId).toBeNull();
  });
});
