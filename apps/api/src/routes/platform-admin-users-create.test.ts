import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";

describe("Platform admin user provisioning", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let superadminToken: string;
  let superadminId: string;
  const testId = randomBytes(4).toString("hex");

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const email = `sa-create-${testId}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "SA Create",
        passwordHash: await hashPassword("AdminPass123!"),
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    superadminId = user.id;
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "AdminPass123!" },
    });
    expect(login.statusCode).toBe(200);
    superadminToken = (login.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    const tenants = await prisma.tenant.findMany({
      where: { slug: { contains: testId } },
      select: { id: true },
    });
    const tids = tenants.map((t) => t.id);
    await prisma.membership.deleteMany({ where: { tenantId: { in: tids } } }).catch(() => null);
    await prisma.companyProfile.deleteMany({ where: { tenantId: { in: tids } } }).catch(() => null);
    await prisma.subscription.deleteMany({ where: { tenantId: { in: tids } } }).catch(() => null);
    await prisma.tenant.deleteMany({ where: { id: { in: tids } } }).catch(() => null);
    await prisma.user.deleteMany({ where: { email: { contains: testId } } }).catch(() => null);
    await app.close();
  });

  async function createTenant() {
    return prisma.tenant.create({
      data: { name: `Co ${testId}`, slug: `co-${testId}-${randomBytes(2).toString("hex")}`, status: "ACTIVE" },
    });
  }

  it("cria User + Membership para e-mail novo", async () => {
    const tenant = await createTenant();
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        kind: "company",
        name: "Novo Membro",
        email: `novo-${testId}@test.local`,
        tenantId: tenant.id,
        role: "AGENT",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.createdUser).toBe(true);
    expect(body.membership.role).toBe("AGENT");
    const user = await prisma.user.findUnique({ where: { email: `novo-${testId}@test.local` } });
    expect(user?.platformRole).toBeNull();
  });

  it("reutiliza User existente e só cria Membership", async () => {
    const tenant = await createTenant();
    const existing = await prisma.user.create({
      data: {
        email: `exist-${testId}@test.local`,
        name: "Já Existe",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        kind: "company",
        name: "Nome Ignorado",
        email: `Exist-${testId}@test.local`,
        tenantId: tenant.id,
        role: "SALES",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reusedUser).toBe(true);
    expect(body.user.id).toBe(existing.id);
    const same = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(same?.name).toBe("Já Existe");
    expect(same?.platformRole).toBeNull();
  });

  it("bloqueia membership duplicada", async () => {
    const tenant = await createTenant();
    const payload = {
      kind: "company",
      name: "Dup",
      email: `dup-${testId}@test.local`,
      tenantId: tenant.id,
      role: "ADMIN",
    };
    const first = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("MEMBERSHIP_ALREADY_EXISTS");
  });

  it("cria superadmin sem membership e promove existente", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { kind: "platform", name: "Novo SA", email: `nsa-${testId}@test.local` },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().createdUser).toBe(true);
    const memberships = await prisma.membership.count({
      where: { user: { email: `nsa-${testId}@test.local` } },
    });
    expect(memberships).toBe(0);

    const regular = await prisma.user.create({
      data: {
        email: `promo-${testId}@test.local`,
        name: "Promo",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
      },
    });
    const promo = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { kind: "platform", name: "Promo", email: regular.email },
    });
    expect(promo.statusCode).toBe(200);
    expect(promo.json().promoted).toBe(true);

    const again = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { kind: "platform", name: "Promo", email: regular.email },
    });
    expect(again.statusCode).toBe(409);
  });

  it("rejeita mass assignment de platformRole em usuário de empresa", async () => {
    const tenant = await createTenant();
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: {
        kind: "company",
        name: "Hack",
        email: `hack-${testId}@test.local`,
        tenantId: tenant.id,
        role: "AGENT",
        platformRole: "SUPERADMIN",
      },
    });
    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: `hack-${testId}@test.local` } });
    expect(user?.platformRole).toBeNull();
  });

  it("usuário comum não cria superadmin", async () => {
    const regular = await prisma.user.create({
      data: {
        email: `common-${testId}@test.local`,
        name: "Common",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: regular.email, password: "UserPass123!" },
    });
    const token = (login.json() as { accessToken: string }).accessToken;
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "platform", name: "X", email: `x-${testId}@test.local` },
    });
    expect(res.statusCode).toBe(403);
    expect(superadminId).toBeTruthy();
  });
});
