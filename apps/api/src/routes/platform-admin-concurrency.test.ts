import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { randomBytes } from "crypto";

describe("7. Concorrência Real & Proteções Transacionais", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let superadminToken: string;
  let superadminUser: any;

  const testId = randomBytes(4).toString("hex");

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const email = `concurrent-sa-${testId}@test.local`;
    const password = "PassConcurrent123!";
    superadminUser = await prisma.user.create({
      data: {
        email,
        name: `Concurrent Superadmin ${testId}`,
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
    superadminToken = (loginRes.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
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

  it("A) Duas requisições simultâneas tentando remover o único ADMIN do mesmo Tenant", async () => {
    const soleAdmin = await prisma.user.create({
      data: {
        email: `sole-admin-del-${testId}@test.local`,
        name: "Sole Admin Del",
        passwordHash: await hashPassword("Pass123!"),
        status: "ACTIVE",
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: `Sole Tenant Del ${testId}`,
        slug: `sole-del-${testId}`,
        status: "ACTIVE",
        members: {
          create: { userId: soleAdmin.id, role: "ADMIN", status: "ACTIVE", isActive: true },
        },
      },
      include: { members: true },
    });
    const member = tenant.members[0];

    // Dispara 2 DELETEs simultâneos
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "DELETE",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      }),
      app.inject({
        method: "DELETE",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      }),
    ]);

    // Ambas devem ser rejeitadas com 400 (pois era o único ADMIN)
    expect(res1.statusCode).toBe(400);
    expect(res2.statusCode).toBe(400);

    // Prova no banco: O ADMIN continua existindo e ativo
    const countAfter = await prisma.membership.count({
      where: { tenantId: tenant.id, role: "ADMIN", status: "ACTIVE" },
    });
    expect(countAfter).toBe(1);
  });

  it("B) Duas requisições simultâneas tentando rebaixar o único ADMIN para AGENT", async () => {
    const soleAdmin = await prisma.user.create({
      data: {
        email: `sole-admin-dem-${testId}@test.local`,
        name: "Sole Admin Dem",
        passwordHash: await hashPassword("Pass123!"),
        status: "ACTIVE",
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: `Sole Tenant Dem ${testId}`,
        slug: `sole-dem-${testId}`,
        status: "ACTIVE",
        members: {
          create: { userId: soleAdmin.id, role: "ADMIN", status: "ACTIVE", isActive: true },
        },
      },
      include: { members: true },
    });
    const member = tenant.members[0];

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { role: "AGENT" },
      }),
      app.inject({
        method: "PATCH",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { role: "AGENT" },
      }),
    ]);

    expect(res1.statusCode).toBe(400);
    expect(res2.statusCode).toBe(400);

    // Prova no banco: O role permanece ADMIN
    const memberAfter = await prisma.membership.findUnique({
      where: { id: member.id },
    });
    expect(memberAfter!.role).toBe("ADMIN");
  });

  it("C) Duas requisições simultâneas tentando suspender o único ADMIN", async () => {
    const soleAdmin = await prisma.user.create({
      data: {
        email: `sole-admin-susp-${testId}@test.local`,
        name: "Sole Admin Susp",
        passwordHash: await hashPassword("Pass123!"),
        status: "ACTIVE",
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: `Sole Tenant Susp ${testId}`,
        slug: `sole-susp-${testId}`,
        status: "ACTIVE",
        members: {
          create: { userId: soleAdmin.id, role: "ADMIN", status: "ACTIVE", isActive: true },
        },
      },
      include: { members: true },
    });
    const member = tenant.members[0];

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "SUSPENDED" },
      }),
      app.inject({
        method: "PATCH",
        url: `/admin/tenants/${tenant.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { status: "SUSPENDED" },
      }),
    ]);

    expect(res1.statusCode).toBe(400);
    expect(res2.statusCode).toBe(400);

    // Prova no banco: O status da membership permanece ACTIVE
    const memberAfter = await prisma.membership.findUnique({
      where: { id: member.id },
    });
    expect(memberAfter!.status).toBe("ACTIVE");
    expect(memberAfter!.isActive).toBe(true);
  });

  it("D) Duas requisições simultâneas tentando revogar o próprio Superadmin logado", async () => {
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: `/admin/users/${superadminUser.id}/platform-role`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { platformRole: null },
      }),
      app.inject({
        method: "PATCH",
        url: `/admin/users/${superadminUser.id}/platform-role`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { platformRole: null },
      }),
    ]);

    expect(res1.statusCode).toBe(400);
    expect(res2.statusCode).toBe(400);

    // Prova no banco: O platformRole continua SUPERADMIN
    const userAfter = await prisma.user.findUnique({
      where: { id: superadminUser.id },
    });
    expect(userAfter!.platformRole).toBe("SUPERADMIN");
  });

  it("E) Duas requisições simultâneas registrando pagamento com a mesma idempotencyKey", async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Billing Concurrency ${testId}`,
        slug: `billing-conc-${testId}`,
        status: "ACTIVE",
        subscription: {
          create: {
            billingStatus: "ACTIVE",
            priceMonthly: 250.0,
            billingDueDay: 15,
          },
        },
      },
    });

    const idempotencyKey = `conc-pay-${randomBytes(8).toString("hex")}`;

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/payments`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          amount: 250.0,
          method: "PIX",
          idempotencyKey,
        },
      }),
      app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/payments`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          amount: 250.0,
          method: "PIX",
          idempotencyKey,
        },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    // Exatamente uma passa (200) e a outra é rejeitada por conflito de idempotência (409)
    expect(statusCodes).toEqual([200, 409]);

    // Prova no banco: Apenas 1 pagamento foi registrado
    const paymentCount = await prisma.payment.count({
      where: { idempotencyKey },
    });
    expect(paymentCount).toBe(1);
  });

  it("F) Duas requisições simultâneas criando a mesma Membership (mesmo tenantId e userId)", async () => {
    const user = await prisma.user.create({
      data: {
        email: `member-conc-${testId}@test.local`,
        name: "Member Conc",
        passwordHash: await hashPassword("Pass123!"),
        status: "ACTIVE",
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        name: `Tenant Member Conc ${testId}`,
        slug: `t-mem-conc-${testId}`,
        status: "ACTIVE",
      },
    });

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/members`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          userId: user.id,
          role: "AGENT",
        },
      }),
      app.inject({
        method: "POST",
        url: `/admin/tenants/${tenant.id}/members`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          userId: user.id,
          role: "AGENT",
        },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    // Exatamente uma passa (200/201) e a outra é rejeitada por conflito de membro já existente (409)
    expect(statusCodes).toEqual([200, 409]);

    // Prova no banco: Apenas 1 membership existe para o par (tenantId, userId)
    const membershipCount = await prisma.membership.count({
      where: { tenantId: tenant.id, userId: user.id },
    });
    expect(membershipCount).toBe(1);
  });

  it("G) Duas requisições simultâneas criando empresa com o mesmo slug", async () => {
    const slug = `dup-slug-${testId}`;

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/admin/companies",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          name: `Empresa Slug 1 ${testId}`,
          slug,
          adminEmail: `admin1-${testId}@test.local`,
          adminName: "Admin 1",
          adminPassword: "Password123!",
        },
      }),
      app.inject({
        method: "POST",
        url: "/admin/companies",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          name: `Empresa Slug 2 ${testId}`,
          slug,
          adminEmail: `admin2-${testId}@test.local`,
          adminName: "Admin 2",
          adminPassword: "Password123!",
        },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    // Exatamente uma cria com sucesso e a outra falha com slug duplicado (400 ou 409)
    expect(statusCodes[0]).toBe(200);
    expect([400, 409]).toContain(statusCodes[1]);

    // Prova no banco: Apenas 1 tenant existe com esse slug
    const tenantCount = await prisma.tenant.count({
      where: { slug },
    });
    expect(tenantCount).toBe(1);
  });
});
