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
    expect(body.membership.tenantId).toBe(tenant.id);
    const email = `novo-${testId}@test.local`;
    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0].platformRole).toBeNull();
    const memberships = await prisma.membership.findMany({ where: { userId: users[0].id } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].tenantId).toBe(tenant.id);
    expect(memberships[0].role).toBe("AGENT");
    const createdLogs = await prisma.auditLog.findMany({
      where: { action: "user.created", entityId: users[0].id },
    });
    expect(createdLogs.length).toBeGreaterThanOrEqual(1);
    const memberLogs = await prisma.auditLog.findMany({
      where: { action: "membership.created", entityId: memberships[0].id },
    });
    expect(memberLogs).toHaveLength(1);
    const leaked = [...createdLogs, ...memberLogs].some((log) =>
      JSON.stringify(log.metadata || {}).toLowerCase().includes("password")
    );
    expect(leaked).toBe(false);
  });

  it("reutiliza User existente e só cria Membership", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const passwordHash = await hashPassword("UserPass123!");
    const existing = await prisma.user.create({
      data: {
        email: `exist-${testId}@test.local`,
        name: "Já Existe",
        passwordHash,
        status: "ACTIVE",
        platformRole: null,
        twoFactorEnabled: true,
        twoFactorSecret: "otpauth-secret-keep",
        twoFactorBackupCodes: "keep-code-1",
        memberships: {
          create: { tenantId: otherTenant.id, role: "ADMIN", status: "ACTIVE" },
        },
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
    expect(same?.passwordHash).toBe(passwordHash);
    expect(same?.twoFactorEnabled).toBe(true);
    expect(same?.twoFactorSecret).toBe("otpauth-secret-keep");
    expect(same?.twoFactorBackupCodes).toBe("keep-code-1");
    const users = await prisma.user.findMany({ where: { email: existing.email } });
    expect(users).toHaveLength(1);
    const memberships = await prisma.membership.findMany({
      where: { userId: existing.id },
      orderBy: { createdAt: "asc" },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.map((m) => m.tenantId).sort()).toEqual([otherTenant.id, tenant.id].sort());
    expect(memberships.find((m) => m.tenantId === otherTenant.id)?.role).toBe("ADMIN");
    expect(memberships.find((m) => m.tenantId === tenant.id)?.role).toBe("SALES");
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
    const users = await prisma.user.findMany({ where: { email: payload.email } });
    expect(users).toHaveLength(1);
    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id, userId: users[0].id },
    });
    expect(memberships).toHaveLength(1);
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
    const tenant = await createTenant();
    const regular = await prisma.user.create({
      data: {
        email: `common-${testId}@test.local`,
        name: "Common",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN", status: "ACTIVE" } },
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: regular.email, password: "UserPass123!" },
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { accessToken: string }).accessToken;
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "platform", name: "X", email: `x-${testId}@test.local` },
    });
    expect([401, 403]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(200);
    const created = await prisma.user.findUnique({ where: { email: `x-${testId}@test.local` } });
    expect(created).toBeNull();
    expect(superadminId).toBeTruthy();
  });

  it("concorrência: mesmo e-mail novo gera um único User", async () => {
    const tenant = await createTenant();
    const email = `race-${testId}@test.local`;
    const payload = {
      kind: "company",
      name: "Race",
      email,
      tenantId: tenant.id,
      role: "AGENT",
    };
    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload,
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id, userId: users[0].id },
    });
    expect(memberships).toHaveLength(1);
  });

  it("concorrência: promoção simultânea gera um único SUPERADMIN", async () => {
    const email = `race-sa-${testId}@test.local`;
    await prisma.user.create({
      data: {
        email,
        name: "Race SA",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
      },
    });
    const payload = { kind: "platform", name: "Race SA", email };
    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${superadminToken}` },
        payload,
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0].platformRole).toBe("SUPERADMIN");
    const memberships = await prisma.membership.count({ where: { userId: users[0].id } });
    expect(memberships).toBe(0);
  });

  it("primeiro acesso cria token oficial e falha de e-mail não desfaz User/Membership", async () => {
    const tenant = await createTenant();
    const email = `first-${testId}@test.local`;
    const res = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { kind: "company", name: "First Access", email, tenantId: tenant.id, role: "AGENT" },
    });
    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    const memberships = await prisma.membership.findMany({ where: { userId: user!.id } });
    expect(memberships).toHaveLength(1);
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user!.id } });
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0].usedAt).toBeNull();
    const logs = await prisma.auditLog.findMany({
      where: { OR: [{ entityId: user!.id }, { entityId: memberships[0].id }] },
    });
    const dumped = JSON.stringify(logs).toLowerCase();
    expect(dumped).not.toContain("password");
    expect(dumped).not.toContain(user!.passwordHash.toLowerCase());
    expect(process.env.MAIL_PROVIDER).toBe("none");
  });

  it("encerrar sessões invalida AuthSession e o refresh token anterior", async () => {
    const tenant = await createTenant();
    const email = `sess-${testId}@test.local`;
    const password = "UserPass123!";
    const target = await prisma.user.create({
      data: {
        email,
        name: "Sess User",
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "AGENT", status: "ACTIVE" } },
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const refresh = login.cookies.find((c) => c.name === "nexa_refresh");
    expect(refresh?.value).toBeTruthy();
    const before = await prisma.authSession.count({
      where: { userId: target.id, revokedAt: null },
    });
    expect(before).toBeGreaterThan(0);

    const revoked = await app.inject({
      method: "POST",
      url: `/admin/users/${target.id}/revoke-sessions`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().revokedSessions).toBeGreaterThan(0);

    const active = await prisma.authSession.count({
      where: { userId: target.id, revokedAt: null },
    });
    expect(active).toBe(0);
    const leftoverTokens = await prisma.refreshToken.count({ where: { userId: target.id } });
    expect(leftoverTokens).toBe(0);

    const refreshRes = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { nexa_refresh: refresh!.value },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it("resetar MFA invalida secret/recovery e não grava segredo no AuditLog", async () => {
    const email = `mfa-${testId}@test.local`;
    const target = await prisma.user.create({
      data: {
        email,
        name: "MFA User",
        passwordHash: await hashPassword("UserPass123!"),
        status: "ACTIVE",
        twoFactorEnabled: true,
        twoFactorSecret: "old-totp-secret",
        twoFactorBackupCodes: "old-recovery-code",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/admin/users/${target.id}/reset-mfa`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after?.twoFactorEnabled).toBe(false);
    expect(after?.twoFactorSecret).toBeNull();
    expect(after?.twoFactorBackupCodes).toBeNull();
    const logs = await prisma.auditLog.findMany({
      where: { action: "user.mfa_reset", entityId: target.id },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const dumped = JSON.stringify(logs).toLowerCase();
    expect(dumped).not.toContain("old-totp-secret");
    expect(dumped).not.toContain("old-recovery-code");
  });

  it("status global vs membership: login, tenant bloqueado e user preservado", async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const email = `status-${testId}@test.local`;
    const password = "UserPass123!";
    const user = await prisma.user.create({
      data: {
        email,
        name: "Status User",
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        memberships: {
          create: [
            { tenantId: tenantA.id, role: "AGENT", status: "ACTIVE", isActive: true },
            { tenantId: tenantB.id, role: "SALES", status: "ACTIVE", isActive: true },
          ],
        },
      },
    });
    const memA = await prisma.membership.findFirst({
      where: { userId: user.id, tenantId: tenantA.id },
    });
    const suspend = await app.inject({
      method: "PATCH",
      url: `/admin/tenants/${tenantA.id}/members/${memA!.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { status: "SUSPENDED" },
    });
    expect(suspend.statusCode).toBe(200);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { accessToken: string }).accessToken;

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      headers: { authorization: `Bearer ${token}` },
      payload: { tenantId: tenantA.id },
    });
    expect(blocked.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      headers: { authorization: `Bearer ${token}` },
      payload: { tenantId: tenantB.id },
    });
    expect(allowed.statusCode).toBe(200);

    const suspendUser = await app.inject({
      method: "PATCH",
      url: `/admin/users/${user.id}/status`,
      headers: { authorization: `Bearer ${superadminToken}` },
      payload: { status: "SUSPENDED" },
    });
    expect(suspendUser.statusCode).toBe(200);
    const loginBlocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect([401, 403]).toContain(loginBlocked.statusCode);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "ACTIVE", isActive: true },
    });
    const memB = await prisma.membership.findFirst({
      where: { userId: user.id, tenantId: tenantB.id },
    });
    const removed = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenantB.id}/members/${memB!.id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    });
    expect(removed.statusCode).toBe(200);
    const still = await prisma.user.findUnique({ where: { id: user.id } });
    expect(still).toBeTruthy();
    expect(still?.email).toBe(email);
  });
});
