import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";
import { isSuperadminMfaExempt, requireSuperadminMfa, getSecurityFlags } from "../services/security/step-up";

describe("Isenção Específica de MFA para Superadmin Luiz Otávio", () => {
  let app: FastifyInstance;
  let luizUserId: string;
  let otherSuperUserId: string;
  let luizToken: string;
  let otherSuperToken: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("TestPass123!Secure");

    // 1. Cria conta Superadmin de teste Luiz Otávio
    const luizUser = await prisma.user.create({
      data: {
        email: `luiz.otavio.${suffix}@test.local`,
        name: "Luiz Otávio Medeiros",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
        twoFactorEnabled: false,
      },
    });
    luizUserId = luizUser.id;

    // 2. Cria outra conta Superadmin (que deve seguir a regra padrão)
    const otherUser = await prisma.user.create({
      data: {
        email: `super.standard.${suffix}@test.local`,
        name: "Standard Superadmin",
        passwordHash,
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
        twoFactorEnabled: false,
      },
    });
    otherSuperUserId = otherUser.id;

    // Login Luiz Otávio
    const login1 = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `luiz.otavio.${suffix}@test.local`, password: "TestPass123!Secure" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(login1.statusCode).toBe(200);
    luizToken = (login1.json() as { accessToken: string }).accessToken;

    // Login Other Superadmin
    const login2 = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `super.standard.${suffix}@test.local`, password: "TestPass123!Secure" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(login2.statusCode).toBe(200);
    otherSuperToken = (login2.json() as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [luizUserId, otherSuperUserId] } },
    }).catch(() => null);
    await app.close().catch(() => null);
  });

  it("1. isSuperadminMfaExempt identifica corretamente variações de nome e email de Luiz Otávio", () => {
    expect(isSuperadminMfaExempt({ name: "Luiz Otávio Medeiros", email: "admin@empresa.com" })).toBe(true);
    expect(isSuperadminMfaExempt({ name: "Luiz Otavio", email: "teste@empresa.com" })).toBe(true);
    expect(isSuperadminMfaExempt({ name: "Outro Nome", email: "luiz.dev@gmail.com" })).toBe(true);
    expect(isSuperadminMfaExempt({ name: "Carlos Admin", email: "carlos@empresa.com" })).toBe(false);
    expect(isSuperadminMfaExempt({ name: "Super Admin", email: "admin@nexaflow.com" })).toBe(false);
  });

  it("2. requireSuperadminMfa não lança erro para Luiz Otávio mesmo sem 2FA", async () => {
    await expect(
      requireSuperadminMfa({
        sub: luizUserId,
        name: "Luiz Otávio Medeiros",
        email: `luiz.otavio.${suffix}@test.local`,
        platformRole: "SUPERADMIN",
      })
    ).resolves.toBeUndefined();
  });

  it("3. getSecurityFlags retorna mfaExempt = true e mfaRequiredForAdmin = false para Luiz Otávio", async () => {
    const flags = await getSecurityFlags(luizUserId, "SUPERADMIN");
    expect(flags.mfaExempt).toBe(true);
    expect(flags.mfaRequiredForAdmin).toBe(false);
  });

  it("4. Endpoint /auth/mfa/status retorna exempt = true para Luiz Otávio", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/mfa/status",
      headers: { authorization: `Bearer ${luizToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exempt).toBe(true);
    expect(body.requiredForAdmin).toBe(false);
  });

  it("5. Superadmin Luiz Otávio acessa endpoints administrativos sem bloqueio de MFA", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/logs?take=1",
      headers: { authorization: `Bearer ${luizToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
