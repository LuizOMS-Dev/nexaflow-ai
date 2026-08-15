import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";

describe("Account Profile & Preferences API", () => {
  async function setupUser(opts?: {
    email?: string;
    name?: string;
    platformRole?: "SUPERADMIN" | null;
    tenantRole?: "ADMIN" | "AGENT";
  }) {
    const app = await buildApp();
    await app.ready();
    const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const email = opts?.email || `user_${unique}@test.local`;
    const password = "Test@Pass12345";
    const passwordHash = await hashPassword(password);

    let tenant: { id: string } | null = null;
    let membership: { id: string } | null = null;

    if (!opts?.platformRole || opts?.tenantRole) {
      tenant = await prisma.tenant.create({
        data: { name: `Tenant ${unique}`, slug: `tenant-${unique}`, status: "ACTIVE" },
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: opts?.name || "Test User",
        passwordHash,
        status: "ACTIVE",
        isActive: true,
        twoFactorEnabled: false,
        platformRole: opts?.platformRole ?? null,
        memberships: tenant
          ? {
              create: {
                tenantId: tenant.id,
                role: opts?.tenantRole || "ADMIN",
              },
            }
          : undefined,
      },
      include: { memberships: true },
    });

    if (tenant) {
      membership = user.memberships[0];
    }

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: "http://localhost:3000" },
      payload: { email, password },
    });

    expect(loginRes.statusCode).toBe(200);
    const token = (loginRes.json() as { accessToken: string }).accessToken;

    return { app, user, token, tenant, membership };
  }

  it("atualiza displayName e timezone válidos no perfil", async () => {
    const { app, user, token } = await setupUser({ name: "Luiz Otávio Medeiros" });

    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { authorization: `Bearer ${token}`, origin: "http://localhost:3000" },
      payload: {
        displayName: "Luiz Otávio",
        timezone: "America/Sao_Paulo",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { displayName: string; timezone: string } };
    expect(body.user.displayName).toBe("Luiz Otávio");
    expect(body.user.timezone).toBe("America/Sao_Paulo");

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.displayName).toBe("Luiz Otávio");
    expect(updated?.timezone).toBe("America/Sao_Paulo");
  });

  it("rejeita fuso horário IANA inválido", async () => {
    const { app, token } = await setupUser();

    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { authorization: `Bearer ${token}`, origin: "http://localhost:3000" },
      payload: {
        timezone: "Planeta/Marte",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { code?: string; error?: string };
    expect(body.code || body.error).toMatch(/INVALID_TIMEZONE/);
  });

  it("rejeita displayName com menos de 2 caracteres se preenchido", async () => {
    const { app, token } = await setupUser();

    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { authorization: `Bearer ${token}`, origin: "http://localhost:3000" },
      payload: {
        displayName: "A",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("impede mass assignment de campos sensíveis (email, platformRole, passwordHash)", async () => {
    const { app, user, token } = await setupUser({ name: "Safe User" });

    const res = await app.inject({
      method: "PATCH",
      url: "/auth/profile",
      headers: { authorization: `Bearer ${token}`, origin: "http://localhost:3000" },
      payload: {
        name: "Updated Name",
        email: "hacked@test.local",
        platformRole: "SUPERADMIN",
        passwordHash: "hacked_hash",
      },
    });

    expect(res.statusCode).toBe(200);

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.email).toBe(user.email);
    expect(refreshed?.platformRole).toBeNull();
    expect(refreshed?.passwordHash).toBe(user.passwordHash);
    expect(refreshed?.name).toBe("Updated Name");
  });

  it("atualiza preferências globais (theme, reduceMotion, notificationSound, browserNotificationsEnabled)", async () => {
    const { app, token } = await setupUser();

    const res = await app.inject({
      method: "PATCH",
      url: "/auth/preferences",
      headers: { authorization: `Bearer ${token}`, origin: "http://localhost:3000" },
      payload: {
        theme: "light",
        reduceMotion: true,
        notificationSound: true,
        browserNotificationsEnabled: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { preferences: Record<string, unknown> } };
    const prefs = body.user.preferences;
    expect(prefs.theme).toBe("light");
    expect(prefs.reduceMotion).toBe(true);
    expect(prefs.notificationSound).toBe(true);
    expect(prefs.browserNotificationsEnabled).toBe(true);
  });

  it("Superadmin pode salvar adminLandingPage; usuário comum recebe 403", async () => {
    const { app: normalApp, token: normalToken } = await setupUser();
    const { app: superApp, token: superToken } = await setupUser({ platformRole: "SUPERADMIN" });

    // 1. Usuário comum tenta definir adminLandingPage -> 403 Forbidden
    const forbiddenRes = await normalApp.inject({
      method: "PATCH",
      url: "/auth/preferences",
      headers: { authorization: `Bearer ${normalToken}`, origin: "http://localhost:3000" },
      payload: {
        adminLandingPage: "USERS",
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // 2. Superadmin define adminLandingPage -> 200 OK
    const okRes = await superApp.inject({
      method: "PATCH",
      url: "/auth/preferences",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
      payload: {
        adminLandingPage: "USERS",
      },
    });
    expect(okRes.statusCode).toBe(200);
    const body = okRes.json() as { user: { preferences: Record<string, unknown> } };
    expect(body.user.preferences.adminLandingPage).toBe("USERS");
  });

  it("isola workspaceLandingPage por empresa (multi-tenant) e impede IDOR", async () => {
    const app = await buildApp();
    await app.ready();
    const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const password = "Test@Pass12345";
    const passwordHash = await hashPassword(password);
    const email = `multi_${unique}@test.local`;

    const tenantA = await prisma.tenant.create({
      data: { name: `Empresa A ${unique}`, slug: `tenant-a-${unique}`, status: "ACTIVE" },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `Empresa B ${unique}`, slug: `tenant-b-${unique}`, status: "ACTIVE" },
    });

    const user = await prisma.user.create({
      data: {
        email,
        name: "Multi Tenant User",
        passwordHash,
        status: "ACTIVE",
        isActive: true,
        twoFactorEnabled: false,
        memberships: {
          create: [
            { tenantId: tenantA.id, role: "ADMIN" },
            { tenantId: tenantB.id, role: "AGENT" },
          ],
        },
      },
      include: { memberships: true },
    });

    const membershipA = user.memberships.find((m) => m.tenantId === tenantA.id)!;
    const membershipB = user.memberships.find((m) => m.tenantId === tenantB.id)!;

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: "http://localhost:3000" },
      payload: { email, password },
    });
    const token = (loginRes.json() as { accessToken: string }).accessToken;

    // Atualiza workspaceLandingPage para INBOX no Tenant A
    const resA = await app.inject({
      method: "PATCH",
      url: "/auth/preferences",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantA.id,
        origin: "http://localhost:3000",
      },
      payload: {
        workspaceLandingPage: "INBOX",
      },
    });

    expect(resA.statusCode).toBe(200);

    const checkA = await prisma.membership.findUnique({ where: { id: membershipA.id } });
    const checkB = await prisma.membership.findUnique({ where: { id: membershipB.id } });

    expect((checkA?.settings as Record<string, unknown>)?.workspaceLandingPage).toBe("INBOX");
    // Tenant B continua intacto (isolamento perfeito)
    expect((checkB?.settings as Record<string, unknown>)?.workspaceLandingPage).toBeUndefined();
  });
});
