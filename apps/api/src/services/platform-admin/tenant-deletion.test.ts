import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../security/password";
import { cleanupTestTenant, testTenantSettings } from "../../test/fixtures";
import { evaluateAccessGate } from "../access-gate";
import { runScheduledTenantDeletions } from "./tenant-deletion";

describe("Exclusão real de empresa", () => {
  let app: FastifyInstance;
  let token = "";
  let actorId = "";
  const suffix = Date.now().toString(36);
  const password = "AdminPass123!";

  async function authHeader() {
    return { authorization: `Bearer ${token}` };
  }

  async function seedCompany(label: string, opts?: { dueInMs?: number | null; price?: number }) {
    const due =
      opts?.dueInMs === null
        ? null
        : new Date(Date.now() + (opts?.dueInMs ?? 7 * 86_400_000));
    const tenant = await prisma.tenant.create({
      data: {
        name: `Del ${label} ${suffix}`,
        slug: `del-${label}-${suffix}`.toLowerCase(),
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "tenant-deletion" }),
        subscription: {
          create: {
            billingStatus: "ACTIVE",
            priceMonthly: opts?.price ?? 199,
            billingDueDay: 10,
            currentPeriodEnd: due,
          },
        },
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `mem-${label}-${suffix}@test.nexaflow.local`,
        name: `Membro ${label}`,
        passwordHash: "x",
        status: "ACTIVE",
        memberships: { create: { tenantId: tenant.id, role: "ADMIN" } },
      },
    });
    const contact = await prisma.contact.create({
      data: { tenantId: tenant.id, name: "Cliente", phone: `55${suffix.slice(-8)}${label.slice(0, 2)}` },
    });
    const conv = await prisma.conversation.create({
      data: { tenantId: tenant.id, contactId: contact.id, status: "OPEN" },
    });
    await prisma.message.create({
      data: { conversationId: conv.id, direction: "INBOUND", content: "oi" },
    });
    const agent = await prisma.aiAgent.create({
      data: { tenantId: tenant.id, name: "Ana", mode: "SUGGEST", isActive: true },
    });
    await prisma.knowledgeDoc.create({
      data: {
        tenantId: tenant.id,
        title: "FAQ",
        content: "O plano Pro custa R$ 299.",
        status: "ready",
        sourceType: "manual",
      },
    });
    await prisma.channel.create({
      data: { tenantId: tenant.id, type: "WHATSAPP", name: "WA", config: { instanceName: `wa-${tenant.id.slice(-8)}` } },
    });
    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        amount: 199,
        paidAt: new Date(),
        method: "PIX",
      },
    });
    return { tenant, user, contact, conv, agent };
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const email = `sa-del-${suffix}@test.nexaflow.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Superadmin Del",
        passwordHash: await hashPassword(password),
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
      },
    });
    actorId = user.id;
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    token = (login.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.authSession.deleteMany({ where: { userId: actorId } }).catch(() => null);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => null);
    await app.close();
  });

  it("recusa exclusão imediata sem checkbox e com nome errado", async () => {
    const { tenant } = await seedCompany("ack");
    const noAck = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
      payload: { confirmName: tenant.name, acknowledged: false, mode: "now" },
    });
    expect(noAck.statusCode).toBe(400);
    const badName = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
      payload: { confirmName: "outro nome", acknowledged: true, mode: "now" },
    });
    expect(badName.statusCode).toBe(400);
    await cleanupTestTenant(tenant.id).catch(() => null);
  });

  it("exclui agora: dados do tenant saem, User global permanece", async () => {
    const { tenant, user, conv, agent } = await seedCompany("now");
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
      payload: { confirmName: tenant.name, acknowledged: true, mode: "now" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { deleted?: boolean }).deleted).toBe(true);

    expect(await prisma.tenant.findUnique({ where: { id: tenant.id } })).toBeNull();
    expect(await prisma.membership.count({ where: { tenantId: tenant.id } })).toBe(0);
    expect(await prisma.conversation.count({ where: { id: conv.id } })).toBe(0);
    expect(await prisma.aiAgent.count({ where: { id: agent.id } })).toBe(0);
    expect(await prisma.knowledgeDoc.count({ where: { tenantId: tenant.id } })).toBe(0);
    expect(await prisma.subscription.count({ where: { tenantId: tenant.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { tenantId: tenant.id } })).toBe(0);
    expect(await prisma.channel.count({ where: { tenantId: tenant.id } })).toBe(0);

    const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
    expect(userAfter).toBeTruthy();
    expect(userAfter!.email).toContain("@test.nexaflow.local");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "company.deleted", entityId: tenant.id },
    });
    expect(audit).toBeTruthy();
  });

  it("agenda para o vencimento, empresa opera, e cancelar restaura status", async () => {
    const { tenant, user } = await seedCompany("sch", { dueInMs: 10 * 86_400_000 });
    const overview = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
    });
    expect(overview.statusCode).toBe(200);
    const elig = (overview.json() as { scheduleEligibility?: { canSchedule?: boolean; civilDate?: string } })
      .scheduleEligibility;
    expect(elig?.canSchedule).toBe(true);

    const res = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
      payload: { confirmName: tenant.name, acknowledged: true, mode: "schedule" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { scheduled?: boolean };
    expect(body.scheduled).toBe(true);

    const after = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    expect(after?.status).toBe("PENDING_DELETION");
    expect(after?.scheduledDeletionAt).toBeTruthy();
    expect(await prisma.subscription.count({ where: { tenantId: tenant.id } })).toBe(1);

    const gate = await evaluateAccessGate({
      userId: user.id,
      tenantId: tenant.id,
      role: "ADMIN",
    });
    expect(gate.level).not.toBe("BLOCKED");
    expect(gate.capabilities.canUseApp).toBe(true);

    const cancel = await app.inject({
      method: "POST",
      url: `/admin/tenants/${tenant.id}/cancel-deletion`,
      headers: await authHeader(),
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);
    const restored = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    expect(restored?.status).toBe("ACTIVE");
    expect(restored?.scheduledDeletionAt).toBeNull();
    await cleanupTestTenant(tenant.id).catch(() => null);
  });

  it("desabilita agendar quando não há vencimento futuro", async () => {
    const { tenant } = await seedCompany("nodue", { dueInMs: null, price: 0 });
    const overview = await app.inject({
      method: "GET",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
    });
    const elig = (overview.json() as { scheduleEligibility?: { canSchedule?: boolean } }).scheduleEligibility;
    expect(elig?.canSchedule).toBe(false);

    const res = await app.inject({
      method: "DELETE",
      url: `/admin/tenants/${tenant.id}`,
      headers: await authHeader(),
      payload: { confirmName: tenant.name, acknowledged: true, mode: "schedule" },
    });
    expect(res.statusCode).toBe(400);
    await cleanupTestTenant(tenant.id).catch(() => null);
  });

  it("job executa exclusão agendada no vencimento e é idempotente", async () => {
    const { tenant, user } = await seedCompany("job", { dueInMs: 60_000 });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: "PENDING_DELETION",
        scheduledDeletionAt: new Date(Date.now() - 1000),
        deletionPreviousStatus: "ACTIVE",
      },
    });
    const first = await runScheduledTenantDeletions(new Date());
    expect(first.results.some((r) => r.id === tenant.id && r.ok)).toBe(true);
    expect(await prisma.tenant.findUnique({ where: { id: tenant.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeTruthy();

    const second = await runScheduledTenantDeletions(new Date());
    expect(second.results.some((r) => r.id === tenant.id)).toBe(false);
  });

  it("concorrência: dois DELETE now com a mesma empresa", async () => {
    const { tenant } = await seedCompany("par");
    const payload = { confirmName: tenant.name, acknowledged: true, mode: "now" };
    const headers = await authHeader();
    const [a, b] = await Promise.all([
      app.inject({
        method: "DELETE",
        url: `/admin/tenants/${tenant.id}`,
        headers,
        payload,
      }),
      app.inject({
        method: "DELETE",
        url: `/admin/tenants/${tenant.id}`,
        headers,
        payload,
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes[0]).toBe(200);
    expect([200, 404, 409]).toContain(codes[1]);
    expect(await prisma.tenant.findUnique({ where: { id: tenant.id } })).toBeNull();
  });
});
