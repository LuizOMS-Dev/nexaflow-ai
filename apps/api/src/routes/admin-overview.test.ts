import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/security/password";

describe("Admin Overview API", () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  let superToken = "";
  let app: Awaited<ReturnType<typeof buildApp>>;
  let superAdminUser: { id: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await hashPassword("AdminSecret@123456");
    superAdminUser = await prisma.user.create({
      data: {
        email: `overview-super-${suffix}@test.local`,
        name: "Overview Superadmin",
        passwordHash,
        status: "ACTIVE",
        platformRole: "SUPERADMIN",
      },
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: "http://localhost:3000" },
      payload: { email: `overview-super-${suffix}@test.local`, password: "AdminSecret@123456" },
    });

    superToken = (loginRes.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: `overview-super-${suffix}@test.local` },
    }).catch(() => null);
    await app.close().catch(() => null);
  });

  it("retorna visão geral padrão de 30 dias", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/overview",
      headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      periodDays: number;
      stats: {
        tenants: number;
        users: number;
        activeTenants: number;
        paidSubscriptions: number;
        paidRatio: number;
        mrr: number;
        arr: number;
      };
      finance: {
        mrr: number;
        arr: number;
        revenueByPlan: Array<{ planName: string; sharePercentage: number; mrr: number }>;
      };
      usage: {
        periodDays: number;
        conversations: number;
        messages: number;
      };
      recentTenants: unknown[];
      recentActivity: Array<{ id: string; action: string; description: string }>;
      health: {
        overall: string;
        dependencies: Array<{ id: string; name: string; status: string }>;
      } | null;
    };

    expect(body.periodDays).toBe(30);
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.mrr).toBe("number");
    expect(typeof body.stats.arr).toBe("number");
    expect(body.stats.arr).toBe(body.stats.mrr * 12);
    expect(Array.isArray(body.finance.revenueByPlan)).toBe(true);
    expect(Array.isArray(body.recentActivity)).toBe(true);
    expect(body.health).toBeDefined();
    expect(Array.isArray(body.health?.dependencies)).toBe(true);
  });

  it("suporta filtros temporais customizados (7, 30 e 90 dias)", async () => {
    for (const days of [7, 30, 90]) {
      const res = await app.inject({
        method: "GET",
        url: `/admin/overview?days=${days}`,
        headers: { authorization: `Bearer ${superToken}`, origin: "http://localhost:3000" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { periodDays: number; usage: { periodDays: number } };
      expect(body.periodDays).toBe(days);
      expect(body.usage.periodDays).toBe(days);
    }
  });

  it("rejeita acesso de usuário não autenticado ou sem permissão", async () => {
    const anonRes = await app.inject({ method: "GET", url: "/admin/overview" });
    expect(anonRes.statusCode).toBe(401);
  });
});
