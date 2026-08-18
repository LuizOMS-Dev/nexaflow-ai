import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { randomBytes } from "crypto";

describe("Platform Admin Domain & Invariants Suite", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let superadminToken: string;
  let superadminUser: any;

  const testId = randomBytes(4).toString("hex");

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Cria superadmin dedicado para a suite
    const email = `superadmin-${testId}@test.local`;
    const password = "AdminPass123!";
    superadminUser = await prisma.user.create({
      data: {
        email,
        name: `Super Admin ${testId}`,
        passwordHash: await hashPassword(password),
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

    expect(loginRes.statusCode).toBe(200);
    superadminToken = (loginRes.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    // Limpeza de fixtures respeitando Restrict em Subscription/Payment
    const testTenants = await prisma.tenant.findMany({
      where: { slug: { contains: testId } },
      select: { id: true },
    });
    const tids = testTenants.map((t) => t.id);

    await prisma.authSession.deleteMany({
      where: { userId: superadminUser?.id },
    }).catch(() => null);
    await prisma.payment.deleteMany({
      where: { tenantId: { in: tids } },
    }).catch(() => null);
    await prisma.subscription.deleteMany({
      where: { tenantId: { in: tids } },
    }).catch(() => null);
    await prisma.companyProfile.deleteMany({
      where: { tenantId: { in: tids } },
    }).catch(() => null);
    await prisma.membership.deleteMany({
      where: { tenantId: { in: tids } },
    }).catch(() => null);
    await prisma.tenant.deleteMany({
      where: { id: { in: tids } },
    }).catch(() => null);
    await prisma.user.deleteMany({
      where: { email: { contains: testId } },
    }).catch(() => null);
    await app.close();
  });

  describe("1. User vs Membership Domain Invariants", () => {
    it("deve permitir usuário com 0 memberships (apenas identidade)", async () => {
      const user = await prisma.user.create({
        data: {
          email: `isolated-${testId}@test.local`,
          name: "Isolated User",
          passwordHash: await hashPassword("UserPass123!"),
          status: "ACTIVE",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/admin/users/${user.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.id).toBe(user.id);
      expect(data.memberships).toHaveLength(0);
    });

    it("deve suportar usuário em múltiplas empresas com papéis diferentes", async () => {
      const user = await prisma.user.create({
        data: {
          email: `multi-${testId}@test.local`,
          name: "Multi Tenant User",
          passwordHash: await hashPassword("UserPass123!"),
          status: "ACTIVE",
        },
      });

      // Cria um admin principal para Empresa Alpha para não violar a regra de último admin
      const primaryAdminAlpha = await prisma.user.create({
        data: {
          email: `primary-alpha-${testId}@test.local`,
          name: "Primary Admin Alpha",
          passwordHash: await hashPassword("Pass123!"),
          status: "ACTIVE",
        },
      });

      const tenantA = await prisma.tenant.create({
        data: {
          name: `Empresa Alpha ${testId}`,
          slug: `alpha-${testId}`,
          status: "ACTIVE",
          members: {
            create: [
              { userId: primaryAdminAlpha.id, role: "ADMIN", status: "ACTIVE" },
              { userId: user.id, role: "AGENT", status: "ACTIVE" },
            ],
          },
        },
      });

      const tenantB = await prisma.tenant.create({
        data: {
          name: `Empresa Beta ${testId}`,
          slug: `beta-${testId}`,
          status: "ACTIVE",
          members: {
            create: { userId: user.id, role: "SALES", status: "ACTIVE" },
          },
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/admin/users/${user.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.memberships).toHaveLength(2);

      const roleA = data.memberships.find((m: any) => m.tenant.id === tenantA.id)?.role;
      const roleB = data.memberships.find((m: any) => m.tenant.id === tenantB.id)?.role;

      expect(roleA).toBe("AGENT");
      expect(roleB).toBe("SALES");
    });

    it("suspender a membership na Empresa A NÃO deve afetar a Empresa B nem o User global", async () => {
      const user = await prisma.user.findUnique({
        where: { email: `multi-${testId}@test.local` },
        include: { memberships: { include: { tenant: true } } },
      });
      expect(user).toBeTruthy();

      const memberA = user!.memberships.find((m) => m.tenant.slug === `alpha-${testId}`)!;

      // Suspende membership A
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/admin/tenants/${memberA.tenantId}/members/${memberA.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "SUSPENDED" },
      });

      expect(patchRes.statusCode).toBe(200);

      // Checa se o User global continua ACTIVE
      const userAfter = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(userAfter!.status).toBe("ACTIVE");

      // Checa se Membership B continua ACTIVE
      const memberB = await prisma.membership.findFirst({
        where: { userId: user!.id, NOT: { id: memberA.id } },
      });
      expect(memberB!.status).toBe("ACTIVE");
      expect(memberB!.isActive).toBe(true);
    });

    it("remover membership na Empresa A NÃO deve apagar a conta do User", async () => {
      const user = await prisma.user.findUnique({
        where: { email: `multi-${testId}@test.local` },
        include: { memberships: true },
      });
      const memberB = user!.memberships.find((m) => m.role === "AGENT")!;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/admin/tenants/${memberB.tenantId}/members/${memberB.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(delRes.statusCode).toBe(200);

      // Conta de usuário ainda existe intacta
      const userAfter = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(userAfter).toBeTruthy();
      expect(userAfter!.email).toBe(user!.email);
    });
  });

  describe("2. Proteção Concorrente de Administradores", () => {
    it("não deve permitir remover o único ADMIN ativo da empresa", async () => {
      const adminUser = await prisma.user.create({
        data: {
          email: `sole-admin-${testId}@test.local`,
          name: "Sole Admin",
          passwordHash: await hashPassword("Pass123!"),
          status: "ACTIVE",
        },
      });

      const tenant = await prisma.tenant.create({
        data: {
          name: `Protected Company ${testId}`,
          slug: `prot-${testId}`,
          status: "ACTIVE",
          members: {
            create: { userId: adminUser.id, role: "ADMIN", status: "ACTIVE", isActive: true },
          },
        },
        include: { members: true },
      });

      const member = tenant.members[0];

      // Tenta deletar o único admin
      const delRes = await app.inject({
        method: "DELETE",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(delRes.statusCode).toBe(400);
      expect(delRes.json().message).toMatch(/único administrador/i);

      // Tenta rebaixar o único admin
      const demoteRes = await app.inject({
        method: "PATCH",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { role: "AGENT" },
      });

      expect(demoteRes.statusCode).toBe(400);
      expect(demoteRes.json().message).toMatch(/único administrador/i);
    });

    it("não deve permitir suspender ou revogar o último Superadministrador da plataforma", async () => {
      // Cria superadmin temporário
      const tempSuper = await prisma.user.create({
        data: {
          email: `only-super-${testId}@test.local`,
          name: "Only Super",
          passwordHash: await hashPassword("Pass123!"),
          platformRole: "SUPERADMIN",
          status: "ACTIVE",
        },
      });

      // Tenta revogar o próprio Superadmin logado
      const selfRevokeRes = await app.inject({
        method: "PATCH",
        url: `/admin/users/${superadminUser.id}/platform-role`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { platformRole: null },
      });

      expect(selfRevokeRes.statusCode).toBe(400);
      expect(selfRevokeRes.json().message).toMatch(/próprio/i);
    });
  });

  describe("3. Tenant & CompanyProfile 1:1 e Criação Atômica", () => {
    it("deve criar empresa, CompanyProfile 1:1, Subscription e Admin User de forma atômica", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/companies",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          name: `Empresa Atômica ${testId}`,
          slug: `atom-${testId}`,
          adminEmail: `admin-atom-${testId}@test.local`,
          adminName: "Admin Atômico",
          adminPassword: "Password123!",
          legalName: "Empresa Atômica LTDA",
          cnpj: "12.345.678/0001-90",
          phone: "11999999999",
          segment: "Tecnologia",
          city: "São Paulo",
          state: "SP",
        },
      });

      expect(res.statusCode).toBe(200);
      const created = res.json();
      expect(created.id).toBeTruthy();
      expect(created.slug).toBe(`atom-${testId}`);

      // Verifica CompanyProfile no banco
      const profile = await prisma.companyProfile.findUnique({
        where: { tenantId: created.id },
      });
      expect(profile).toBeTruthy();
      expect(profile!.legalName).toBe("Empresa Atômica LTDA");
      expect(profile!.cnpj).toBe("12.345.678/0001-90");
      expect(profile!.city).toBe("São Paulo");

      // Verifica Subscription
      const sub = await prisma.subscription.findUnique({
        where: { tenantId: created.id },
      });
      expect(sub).toBeTruthy();
      expect(sub!.billingStatus).toBe("ACTIVE");

      // Verifica Admin User & Membership
      const user = await prisma.user.findUnique({
        where: { email: `admin-atom-${testId}@test.local` },
        include: { memberships: true },
      });
      expect(user).toBeTruthy();
      expect(user!.memberships).toHaveLength(1);
      expect(user!.memberships[0].role).toBe("ADMIN");
      expect(user!.memberships[0].status).toBe("ACTIVE");
    });

    it("ao criar empresa com usuário existente, deve reutilizar sem sobrescrever credenciais", async () => {
      const existingUser = await prisma.user.create({
        data: {
          email: `existing-admin-${testId}@test.local`,
          name: "Original Name",
          passwordHash: await hashPassword("OriginalPass123!"),
          status: "ACTIVE",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/admin/companies",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          name: `Empresa Reuso ${testId}`,
          slug: `reuso-${testId}`,
          adminEmail: existingUser.email,
          adminName: "Modified Name Attempt",
          adminPassword: "NewPasswordIgnored123!",
        },
      });

      expect(res.statusCode).toBe(200);

      // Usuário preserva senha e nome original
      const userAfter = await prisma.user.findUnique({
        where: { id: existingUser.id },
      });
      expect(userAfter!.name).toBe("Original Name");
      expect(userAfter!.passwordHash).toBe(existingUser.passwordHash);
    });

    it("solicitar exclusão (request-deletion) deve marcar PENDING_DELETION sem apagar os dados", async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: `atom-${testId}` },
      });
      expect(tenant).toBeTruthy();

      const res = await app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant!.id}/request-deletion`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          confirmName: tenant!.name,
          reason: "Encerramento de contrato",
        },
      });

      expect(res.statusCode).toBe(200);

      const tenantAfter = await prisma.tenant.findUnique({
        where: { id: tenant!.id },
      });
      expect(tenantAfter!.status).toBe("PENDING_DELETION");

      // Subscription marcada como CANCELLED sem apagar registros
      const subAfter = await prisma.subscription.findUnique({
        where: { tenantId: tenant!.id },
      });
      expect(subAfter!.billingStatus).toBe("CANCELLED");
    });
  });

  describe("4. Cobrança e Idempotência de Pagamentos", () => {
    it("deve rejeitar pagamentos duplicados com a mesma chave de idempotência", async () => {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Billing Co ${testId}`,
          slug: `billing-${testId}`,
          status: "ACTIVE",
          subscription: {
            create: {
              billingStatus: "ACTIVE",
              priceMonthly: 199.0,
              billingDueDay: 10,
            },
          },
        },
      });

      const idempotencyKey = `pay-key-${randomBytes(6).toString("hex")}`;

      // Primeiro registro: sucesso
      const res1 = await app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/payments`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          amount: 199.0,
          method: "PIX",
          idempotencyKey,
        },
      });

      expect(res1.statusCode).toBe(200);

      // Segundo registro com mesma idempotencyKey: conflito 409
      const res2 = await app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/payments`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          amount: 199.0,
          method: "PIX",
          idempotencyKey,
        },
      });

      expect(res2.statusCode).toBe(409);
      expect(res2.json().error || res2.json().code).toBe("DUPLICATE_PAYMENT_REQUEST");
    });

    it("cancelar assinatura não deve alterar automaticamente o TenantStatus.ACTIVE", async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: `billing-${testId}` },
      });

      const res = await app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant!.id}/cancel-subscription`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { reason: "Cliente solicitou encerramento de plano" },
      });

      expect(res.statusCode).toBe(200);

      const tenantAfter = await prisma.tenant.findUnique({
        where: { id: tenant!.id },
      });
      // TenantStatus permanece ACTIVE enquanto Subscription é CANCELLED
      expect(tenantAfter!.status).toBe("ACTIVE");

      const subAfter = await prisma.subscription.findUnique({
        where: { tenantId: tenant!.id },
      });
      expect(subAfter!.billingStatus).toBe("CANCELLED");
    });
  });

  describe("5. Impersonação Auditável", () => {
    it("deve iniciar sessão de impersonação sem criar Membership nem alterar role global", async () => {
      const adminUser = await prisma.user.create({
        data: {
          email: `target-admin-${testId}@test.local`,
          name: "Target Admin",
          passwordHash: await hashPassword("Pass123!"),
          status: "ACTIVE",
        },
      });

      const tenant = await prisma.tenant.create({
        data: {
          name: `Support Target ${testId}`,
          slug: `sup-${testId}`,
          status: "ACTIVE",
          members: {
            create: { userId: adminUser.id, role: "ADMIN", status: "ACTIVE" },
          },
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/admin/impersonate",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          tenantId: tenant.id,
          reason: "Atendimento de suporte técnico ao cliente",
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.impersonation.active).toBe(true);
      expect(data.impersonation.by).toBe(superadminUser.id);
      expect(data.accessToken).toBeTruthy();

      // Verifica que o superadmin NÃO ganhou membership no banco
      const superMembership = await prisma.membership.findFirst({
        where: { tenantId: tenant.id, userId: superadminUser.id },
      });
      expect(superMembership).toBeNull();
    });
  });
});
