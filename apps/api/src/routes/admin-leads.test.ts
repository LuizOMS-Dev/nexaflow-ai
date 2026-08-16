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
      page: number;
      limit: number;
      totalPages: number;
    };

    expect(bodyAll.total).toBeGreaterThanOrEqual(5);
    expect(bodyAll.items.some((i) => i.id === leadNew.id)).toBe(true);
    expect(bodyAll.totalPages).toBeGreaterThanOrEqual(1);

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

    // 3.3 Status WON não existe mais no enum comercial — deve ser rejeitado
    const wonRes = await app.inject({
      method: "PATCH",
      url: `/admin/sales-leads/${lead.id}`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { status: "WON" },
    });
    expect(wonRes.statusCode).toBe(400);
    expect(wonRes.json().error).toBe("VALIDATION_ERROR");

    // 3.4 CSRF: mutação com origin não autorizada é bloqueada
    const csrfRes = await app.inject({
      method: "PATCH",
      url: `/admin/sales-leads/${lead.id}`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "https://evil.example.com",
        "content-type": "application/json",
      },
      payload: { status: "LOST" },
    });
    expect(csrfRes.statusCode).toBe(403);
    expect(csrfRes.json().error).toBe("CSRF_ORIGIN_DENIED");
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

    // KPIs antes da conversão (via endpoint /summary)
    const summaryBefore = (
      await app.inject({
        method: "GET",
        url: "/admin/sales-leads/summary",
        headers: { authorization: `Bearer ${superadminToken}` },
      })
    ).json() as { inPipeline: number; converted: number };

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

    // 4.2 KPIs reagem à conversão: QUALIFIED sai do pipeline e vira CONVERTED
    const summaryAfter = (
      await app.inject({
        method: "GET",
        url: "/admin/sales-leads/summary",
        headers: { authorization: `Bearer ${superadminToken}` },
      })
    ).json() as { inPipeline: number; converted: number };
    expect(summaryAfter.converted - summaryBefore.converted).toBe(1);
    expect(summaryAfter.inPipeline - summaryBefore.inPipeline).toBe(-1);
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

  it("6. /summary com groupBy: deltas exatos de pipeline, convertidos, perdidos e spam", async () => {
    const getSummary = async () =>
      (
        await app.inject({
          method: "GET",
          url: "/admin/sales-leads/summary",
          headers: { authorization: `Bearer ${superadminToken}` },
        })
      ).json() as {
        total: number;
        new: number;
        inPipeline: number;
        converted: number;
        lost: number;
        spam: number;
      };

    const base = await getSummary();

    await prisma.salesLead.createMany({
      data: [
        { name: `KPI A ${suffix}`, email: `kpi-a-${suffix}@test.local`, companyName: `Kpi A Co ${suffix}`, status: "NEW" },
        { name: `KPI B ${suffix}`, email: `kpi-b-${suffix}@test.local`, companyName: `Kpi B Co ${suffix}`, status: "CONTACTED" },
        { name: `KPI C ${suffix}`, email: `kpi-c-${suffix}@test.local`, companyName: `Kpi C Co ${suffix}`, status: "QUALIFIED" },
        { name: `KPI D ${suffix}`, email: `kpi-d-${suffix}@test.local`, companyName: `Kpi D Co ${suffix}`, status: "LOST" },
        { name: `KPI E ${suffix}`, email: `kpi-e-${suffix}@test.local`, companyName: `Kpi E Co ${suffix}`, status: "SPAM" },
      ],
    });

    const after = await getSummary();

    // Deltas exatos: os status fora de NEW só mudam por ações deste próprio suite
    expect(after.inPipeline - base.inPipeline).toBe(2); // CONTACTED + QUALIFIED
    expect(after.converted - base.converted).toBe(0); // CONVERTED não é contado como WON
    expect(after.lost - base.lost).toBe(1);
    expect(after.spam - base.spam).toBe(1);
    // total/new podem crescer com outras suítes rodando em paralelo
    expect(after.total).toBeGreaterThanOrEqual(base.total + 5);
    expect(after.new).toBeGreaterThanOrEqual(base.new + 1);

    // O endpoint NUNCA expõe WON
    expect(JSON.stringify(after)).not.toContain("WON");
  });

  it("7. Histórico de auditoria do lead via /:id/history", async () => {
    const lead = await prisma.salesLead.create({
      data: {
        name: `Lead Hist ${suffix}`,
        email: `hist-${suffix}@empresa-hist.test`,
        companyName: `Hist Corp ${suffix}`,
        status: "NEW",
        source: "website",
      },
    });

    for (const status of ["CONTACTED", "QUALIFIED"]) {
      const res = await app.inject({
        method: "PATCH",
        url: `/admin/sales-leads/${lead.id}`,
        headers: {
          authorization: `Bearer ${superadminToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        payload: { status },
      });
      expect(res.statusCode).toBe(200);
    }

    const res = await app.inject({
      method: "GET",
      url: `/admin/sales-leads/${lead.id}/history`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ action: string; metadata: Record<string, unknown> }> };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items[0].action).toBe("admin.lead.update_status");
    expect(body.items[0].metadata.leadId).toBe(lead.id);
    expect(body.items[0].metadata.newStatus).toBe("QUALIFIED");
    expect(
      body.items.some(
        (e) => e.metadata.oldStatus === "NEW" && e.metadata.newStatus === "CONTACTED"
      )
    ).toBe(true);

    // Histórico de lead inexistente → 404
    const missing = await app.inject({
      method: "GET",
      url: "/admin/sales-leads/inexistente-xyz/history",
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("8. Conversão com nome similar: 409 SIMILAR_TENANT_NAME, depois forceSimilarName", async () => {
    // O teste 4 já criou a empresa `Nova Startup ${suffix}` — reutiliza o nome para forçar o conflito
    const lead = await prisma.salesLead.create({
      data: {
        name: "Lead Duplicado",
        email: `dup-${suffix}@empresa-dup.test`,
        companyName: `Nova Startup ${suffix}`,
        status: "QUALIFIED",
        source: "website",
      },
    });

    const payload = {
      name: `Nova Startup ${suffix}`,
      planId: undefined as string | undefined,
      adminName: "Lead Duplicado",
      adminEmail: `dup-${suffix}@empresa-dup.test`,
      adminPassword: "Password@12345",
    };
    const freePlan =
      (await prisma.plan.findFirst({ where: { slug: "free", isActive: true } })) ||
      (await prisma.plan.findFirst({ where: { isActive: true } }));
    payload.planId = freePlan?.id;

    const conflictRes = await app.inject({
      method: "POST",
      url: `/admin/sales-leads/${lead.id}/convert`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload,
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json().error).toBe("SIMILAR_TENANT_NAME");

    // Lead NÃO foi consumido pelo conflito
    const leadStill = await prisma.salesLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadStill.status).toBe("QUALIFIED");
    expect(leadStill.convertedTenantId).toBeNull();

    // Confirmação explícita (forceSimilarName) prossegue com criação transacional
    const forcedRes = await app.inject({
      method: "POST",
      url: `/admin/sales-leads/${lead.id}/convert`,
      headers: {
        authorization: `Bearer ${superadminToken}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: { ...payload, forceSimilarName: true },
    });
    expect(forcedRes.statusCode).toBe(200);
    const forcedBody = forcedRes.json() as { company: { id: string }; lead: { status: string; convertedTenantId: string } };
    createdTenantIds.push(forcedBody.company.id);
    expect(forcedBody.lead.status).toBe("CONVERTED");
    expect(forcedBody.lead.convertedTenantId).toBe(forcedBody.company.id);

    const leadAfter = await prisma.salesLead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadAfter.status).toBe("CONVERTED");
    expect(leadAfter.convertedTenantId).toBe(forcedBody.company.id);
  });
});
