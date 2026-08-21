import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";
import { platformAdminRoutes } from "./platform-admin";
import { hashPassword } from "../services/security/password";
import {
  createAuthSession,
  revokeSession,
  ACCESS_TOKEN_SECONDS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SEC,
} from "../services/security/session";
import { recordSecurityEvent } from "../services/security/security-event";
import { env } from "../lib/env";
import type { JwtUser } from "../plugins/auth";
import {
  requireRecentAuthentication,
  getSecurityFlags,
  requireSuperadminMfa,
} from "../services/security/step-up";
import {
  advancePeriodAfterPayment,
  computeBillingSnapshot,
  formatDaysOverdueLabel,
  formatDueDayLabel,
  computeNextDueDate,
} from "../services/billing";
import { getPlatformHealthDetailed } from "../services/platform-diagnostics";
import { computePlatformFinancialMetrics, computePlansCommercialStats } from "../services/financial-metrics";

function cookieSecure() {
  return env.nodeEnv === "production";
}

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE_SEC,
  });
}

function setAccessCookie(reply: FastifyReply, token: string) {
  reply.setCookie("nexa_access", token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_SECONDS,
  });
}

function normalizeNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tenantSettings(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

const TENANT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão agendada",
};

type SubRow = {
  id: string;
  tenantId: string;
  planId: string | null;
  billingStatus: string;
  billingCycle: string;
  priceMonthly: unknown;
  priceAnnual: unknown;
  billingDueDay: number | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAt: Date | null;
  plan?: { id: string; name: string; priceMonthly: unknown; priceOnRequest?: boolean } | null;
};

function enrichTenantBilling(
  tenant: {
    id: string;
    status: string;
    planId?: string | null;
    plan?: { id: string; name: string; priceMonthly: unknown; priceOnRequest?: boolean } | null;
  },
  sub: SubRow | null | undefined
) {
  const snap = computeBillingSnapshot({
    tenantStatus: tenant.status,
    billingStatus: sub?.billingStatus,
    billingDueDay: sub?.billingDueDay,
    currentPeriodEnd: sub?.currentPeriodEnd,
    trialEndsAt: sub?.trialEndsAt,
  });

  const catalog =
    tenant.plan?.priceMonthly != null ? Number(tenant.plan.priceMonthly) : null;
  const contracted =
    sub?.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
      ? Number(sub.priceMonthly)
      : catalog;

  return {
    subscription: sub
      ? {
          id: sub.id,
          billingStatus: sub.billingStatus,
          billingCycle: sub.billingCycle,
          priceMonthly: contracted,
          priceAnnual:
            sub.priceAnnual != null && Number.isFinite(Number(sub.priceAnnual))
              ? Number(sub.priceAnnual)
              : null,
          billingDueDay: sub.billingDueDay,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          cancelAt: sub.cancelAt,
          planId: sub.planId,
        }
      : null,
    contractedPrice: contracted,
    catalogPrice: catalog,
    financialStatus: snap.financialStatus,
    financialStatusLabel: snap.financialStatusLabel,
    billingDueDay: snap.billingDueDay,
    billingDueDayLabel: formatDueDayLabel(snap.billingDueDay),
    nextDueAt: snap.nextDueAt,
    daysOverdue: snap.daysOverdue,
    daysOverdueLabel: formatDaysOverdueLabel(snap.daysOverdue),
    daysUntilDue: snap.daysUntilDue,
    needsAttention: snap.needsAttention,
    statusLabel: TENANT_STATUS_LABEL[tenant.status] || tenant.status,
  };
}

/** Exclui fixtures de testes automatizados da UI admin (dev) */
function isTestFixtureTenant(t: {
  name: string;
  slug: string;
  settings?: unknown;
}): boolean {
  const s = tenantSettings(t.settings);
  if (s.fixture === true || s.createdByTest === true || s.environment === "test") {
    return true;
  }
  const slug = t.slug || "";
  if (
    /^(tenant-a-|tenant-b-|nega-|negb-|inv-)/i.test(slug)
  ) {
    return true;
  }
  if (
    /^(Tenant A |Tenant B |NegA |NegB |Invite Co )/i.test(t.name || "")
  ) {
    return true;
  }
  return false;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);
  await platformAdminRoutes(app);

  app.get("/admin/overview", async (request) => {
    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
      })
      .parse(request.query || {});

    const days = q.days || 30;
    const now = Date.now();
    const since = new Date(now - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(now - 2 * days * 24 * 60 * 60 * 1000);

    const [
      allTenantsRaw,
      users,
      newUsersPeriod,
      prevUsersPeriod,
      conversations,
      conversationsPeriod,
      prevConversationsPeriod,
      messages,
      messagesPeriod,
      prevMessagesPeriod,
      contacts,
      activeAgents,
      automationRuns,
      automationRunsPeriod,
      prevAutomationRunsPeriod,
      plans,
      subscriptions,
      recentAuditLogs,
      errors,
      healthReport,
      platformCosts,
    ] = await Promise.all([
      prisma.tenant.findMany({
        include: {
          plan: true,
          _count: { select: { members: true, contacts: true, conversations: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({
        where: {
          NOT: {
            OR: [
              { email: { endsWith: "@test.local" } },
              { email: { endsWith: "@test.nexaflow.local" } },
            ],
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: since },
          NOT: {
            OR: [
              { email: { endsWith: "@test.local" } },
              { email: { endsWith: "@test.nexaflow.local" } },
            ],
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: prevSince, lt: since },
          NOT: {
            OR: [
              { email: { endsWith: "@test.local" } },
              { email: { endsWith: "@test.nexaflow.local" } },
            ],
          },
        },
      }),
      prisma.conversation.count(),
      prisma.conversation.count({ where: { createdAt: { gte: since } } }),
      prisma.conversation.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: since } } }),
      prisma.message.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.contact.count(),
      prisma.aiAgent.count({ where: { isActive: true } }),
      prisma.automationRun.count(),
      prisma.automationRun.count({ where: { createdAt: { gte: since } } }),
      prisma.automationRun.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      prisma.plan.findMany({
        orderBy: { priceMonthly: "asc" },
        include: {
          tenants: {
            select: { id: true, name: true, slug: true, status: true, settings: true },
          },
        },
      }),
      prisma.subscription.findMany({
        where: { billingStatus: { in: ["ACTIVE", "PAST_DUE"] } },
        include: { plan: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: { action: { contains: "error" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      getPlatformHealthDetailed().catch(() => null),
      prisma.platformOperationalCost.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    // Filtra fixtures de teste da listagem e contadores de empresas
    const realTenants = allTenantsRaw.filter((t) => !isTestFixtureTenant(t));
    const active = realTenants.filter((t) => t.status === "ACTIVE").length;
    const suspended = realTenants.filter((t) => t.status === "SUSPENDED").length;
    const trial = realTenants.filter((t) => t.status === "TRIAL").length;
    const cancelled = realTenants.filter(
      (t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION"
    ).length;
    const blocked = realTenants.filter((t) => t.status === "BLOCKED").length;

    const newTenantsPeriod = realTenants.filter((t) => new Date(t.createdAt) >= since).length;
    const prevTenantsPeriod = realTenants.filter(
      (t) => new Date(t.createdAt) >= prevSince && new Date(t.createdAt) < since
    ).length;

    // Centralização de métricas financeiras (MRR, ARR, Ticket Médio, Receita por Plano)
    const finMetrics = computePlatformFinancialMetrics({
      tenants: allTenantsRaw,
      plans,
      subscriptions,
      costs: platformCosts,
      now: new Date(now),
    });

    const mrr = finMetrics.summary.mrr;
    const arr = finMetrics.summary.arr;
    const avgTicket = finMetrics.summary.avgTicket;
    const paidSubscriptions = finMetrics.summary.paidSubscriptions;

    const revenueByPlan = finMetrics.revenueByPlan.map((r) => ({
      planId: r.planId,
      planName: r.planName,
      planSlug: r.planSlug,
      priceMonthly: r.catalogPrice,
      priceOnRequest: r.catalogPrice == null,
      priceLabel: r.priceLabel,
      isActive: r.isActive,
      tenants: r.tenants,
      mrr: r.mrr,
      sharePercentage: r.sharePercentage,
    }));

    const plansWithRealCount = plans.map((p) => {
      const realCount = p.tenants.filter((t) => !isTestFixtureTenant(t)).length;
      const { tenants: _t, ...rest } = p;
      return {
        ...rest,
        _count: { tenants: realCount },
      };
    });

    const paidRatio = active > 0 ? Math.round((paidSubscriptions / active) * 100) : 0;

    // Billing snapshots para alertas reais (sem inventar)
    const subByTenant = new Map(subscriptions.map((s) => [s.tenantId, s]));
    let overdueCount = 0;
    let dueSoonCount = 0;
    let trialsExpiringSoonCount = 0;

    for (const t of realTenants) {
      if (t.status === "CANCELLED" || t.status === "PENDING_DELETION") continue;
      const sub = subByTenant.get(t.id);
      const snap = computeBillingSnapshot({
        tenantStatus: t.status,
        billingStatus: sub?.billingStatus,
        billingDueDay: (sub as { billingDueDay?: number | null } | undefined)?.billingDueDay,
        currentPeriodEnd: sub?.currentPeriodEnd,
        trialEndsAt: sub?.trialEndsAt,
      });
      if (snap.financialStatus === "OVERDUE") overdueCount += 1;
      if (
        snap.financialStatus === "DUE_SOON" ||
        snap.financialStatus === "DUE_TODAY"
      ) {
        if (snap.daysUntilDue != null && snap.daysUntilDue <= 3) dueSoonCount += 1;
      }
      if (t.status === "TRIAL" && sub?.trialEndsAt) {
        const diffDays = Math.ceil((new Date(sub.trialEndsAt).getTime() - now) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          trialsExpiringSoonCount += 1;
        }
      }
    }

    // Alertas reais (sem inventar)
    const alerts: Array<{
      id: string;
      severity: "warning" | "danger" | "info";
      title: string;
      href?: string;
    }> = [];
    if (overdueCount > 0) {
      alerts.push({
        id: "overdue",
        severity: "danger",
        title: `${overdueCount} empresa${overdueCount === 1 ? "" : "s"} com pagamento atrasado`,
        href: "/admin/companies?financial=OVERDUE",
      });
    }
    if (dueSoonCount > 0) {
      alerts.push({
        id: "due-soon",
        severity: "warning",
        title: `${dueSoonCount} empresa${dueSoonCount === 1 ? "" : "s"} vence${dueSoonCount === 1 ? "" : "m"} nos próximos 3 dias`,
        href: "/admin/companies?financial=DUE_SOON",
      });
    }
    if (suspended > 0) {
      alerts.push({
        id: "suspended",
        severity: "warning",
        title: `${suspended} empresa${suspended === 1 ? "" : "s"} suspensa${suspended === 1 ? "" : "s"}`,
        href: "/admin/companies?status=SUSPENDED",
      });
    }
    if (blocked > 0) {
      alerts.push({
        id: "blocked",
        severity: "danger",
        title: `${blocked} empresa${blocked === 1 ? "" : "s"} bloqueada${blocked === 1 ? "" : "s"}`,
        href: "/admin/companies?status=BLOCKED",
      });
    }
    if (trial > 0) {
      alerts.push({
        id: "trials",
        severity: "info",
        title: `${trial} trial${trial === 1 ? "" : "s"} ativo${trial === 1 ? "" : "s"}`,
        href: "/admin/companies?status=TRIAL",
      });
    }
    if (errors.length > 0) {
      alerts.push({
        id: "audit-errors",
        severity: "danger",
        title: `${errors.length} evento${errors.length === 1 ? "" : "s"} de erro recente${errors.length === 1 ? "" : "s"} na auditoria`,
        href: "/admin/audit",
      });
    }

    // Formata atividades administrativas recentes de forma legível
    const recentActivity = recentAuditLogs.map((log) => {
      let description = log.action;
      if (log.action === "tenant.create" || log.action === "tenant.created" || log.action === "admin.tenant.create") {
        description = `Empresa ${log.tenant?.name || log.entityId || ""} criada`;
      } else if (log.action === "auth.logout") {
        description = "Logout administrativo realizado";
      } else if (log.action === "admin.impersonate") {
        description = "Acesso como empresa iniciado";
      } else if (log.action === "admin.impersonate.stop") {
        description = "Acesso como empresa encerrado";
      } else if (log.action === "tenant.onboarding.completed") {
        description = "Configuração da empresa concluída";
      } else if (log.action.includes("2fa") || log.action.includes("mfa")) {
        description = "Autenticação em duas etapas ativada";
      } else if (log.action.includes("status")) {
        description = `Status de ${log.tenant?.name || "empresa"} atualizado`;
      } else if (log.action.includes("plan")) {
        description = `Plano de ${log.tenant?.name || "empresa"} alterado`;
      } else if (log.action.includes("login")) {
        description = `Login administrativo realizado`;
      }
      return {
        id: log.id,
        action: log.action,
        description,
        entity: log.entity,
        entityId: log.entityId,
        userName: log.user?.name || log.user?.email || "Sistema",
        tenantName: log.tenant?.name || null,
        createdAt: log.createdAt,
      };
    });

    return {
      periodDays: days,
      stats: {
        tenants: realTenants.length,
        users,
        newUsersPeriod,
        prevUsersPeriod,
        conversations,
        conversationsPeriod,
        prevConversationsPeriod,
        messages,
        messagesPeriod,
        prevMessagesPeriod,
        contacts,
        activeAgents,
        automationRuns,
        automationRunsPeriod,
        prevAutomationRunsPeriod,
        activeTenants: active,
        suspendedTenants: suspended,
        blockedTenants: blocked,
        trialTenants: trial,
        cancelledTenants: cancelled,
        overdueTenants: overdueCount,
        dueSoonTenants: dueSoonCount,
        trialsExpiringSoon: trialsExpiringSoonCount,
        paidSubscriptions,
        paidRatio,
        newTenantsPeriod,
        prevTenantsPeriod,
        mrr,
        arr,
        avgTicket,
      },
      finance: {
        mrr,
        arr,
        avgTicket,
        paidSubscriptions,
        paidRatio,
        revenueByPlan,
        costsAvailable: finMetrics.performance.costsConfigured,
        profitAvailable: finMetrics.performance.costsConfigured,
        monthlyCosts: finMetrics.performance.monthlyCosts,
        estimatedProfit: finMetrics.performance.estimatedProfit,
        estimatedMargin: finMetrics.performance.estimatedMargin,
        /** MRR = valor contratado (Subscription.priceMonthly) de empresas ACTIVE — não é caixa */
        note: "MRR estimado com base no valor contratado das assinaturas de empresas ativas. Não representa pagamentos já recebidos. Alterar preço de catálogo não altera contratos existentes.",
      },
      usage: {
        periodDays: days,
        conversations,
        conversationsPeriod,
        prevConversationsPeriod,
        messages,
        messagesPeriod,
        prevMessagesPeriod,
        contacts,
        activeAgents,
        automationRuns,
        automationRunsPeriod,
        prevAutomationRunsPeriod,
      },
      plans: plansWithRealCount,
      recentTenants: realTenants.slice(0, 5),
      recentActivity,
      health: healthReport,
      totalTenants: realTenants.length,
      alerts,
      errors,
    };
  });

  /**
   * Central Financeira do Superadmin (/admin/finance)
   */
  app.get("/admin/finance", async (request) => {
    const q = z
      .object({
        days: z.coerce.number().int().min(1).max(365).optional().default(30),
      })
      .parse(request.query || {});

    const days = q.days || 30;
    const now = new Date();

    const [
      allTenantsRaw,
      plans,
      subscriptions,
      costs,
      recentPayments,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.plan.findMany({
        orderBy: { priceMonthly: "asc" },
      }),
      prisma.subscription.findMany({
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.platformOperationalCost.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        orderBy: { paidAt: "desc" },
        take: 50,
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: "Subscription" },
            { entity: "Plan" },
            { entity: "PlatformOperationalCost" },
            { action: { startsWith: "admin.subscription" } },
            { action: { startsWith: "admin.plan" } },
            { action: { startsWith: "admin.cost" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      }),
    ]);

    const metrics = computePlatformFinancialMetrics({
      tenants: allTenantsRaw,
      plans,
      subscriptions,
      costs,
      now,
    });

    const monthlyHistoryMap = new Map<string, number>();
    for (const p of recentPayments) {
      const d = new Date(p.paidAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyHistoryMap.set(k, (monthlyHistoryMap.get(k) || 0) + Number(p.amount || 0));
    }
    const historyEntries = Array.from(monthlyHistoryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, value]) => ({ month, value }));

    const recentFinancialActivity = recentAuditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      userName: log.user?.name || log.user?.email || "Superadmin",
      tenantName: log.tenant?.name || null,
      createdAt: log.createdAt,
    }));

    return {
      periodDays: days,
      ...metrics,
      history: {
        hasEnoughHistory: historyEntries.length >= 2,
        entries: historyEntries,
      },
      recentFinancialActivity,
      costsCount: costs.length,
      note: "MRR e ARR estimados a partir de contratos ativos (Subscription.priceMonthly). Não representam caixa recebido.",
    };
  });

  /**
   * Custos Operacionais da Plataforma (Superadmin)
   */
  app.get("/admin/finance/costs", async () => {
    const costs = await prisma.platformOperationalCost.findMany({
      orderBy: { createdAt: "desc" },
    });
    return costs.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      amount: Number(c.amount),
      recurrence: c.recurrence,
      isActive: c.isActive,
      notes: c.notes,
      createdAt: c.createdAt,
    }));
  });

  app.post("/admin/finance/costs", async (request) => {
    const body = z
      .object({
        name: z.string().min(2, "Nome é obrigatório"),
        category: z.enum(["INFRASTRUCTURE", "WHATSAPP", "AI", "EMAIL", "DATABASE", "TOOLS", "SUPPORT", "OTHER"]).default("INFRASTRUCTURE"),
        amount: z.number().positive("O valor deve ser maior que zero"),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]).default("MONTHLY"),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    const cost = await prisma.platformOperationalCost.create({
      data: {
        name: body.name,
        category: body.category,
        amount: body.amount,
        recurrence: body.recurrence,
        isActive: true,
        notes: body.notes || null,
        createdById: request.user.sub,
      },
    });

    await audit({
      userId: request.user.sub,
      action: "admin.cost.create",
      entity: "PlatformOperationalCost",
      entityId: cost.id,
      metadata: { name: cost.name, amount: body.amount },
    });

    return {
      ...cost,
      amount: Number(cost.amount),
    };
  });

  app.patch("/admin/finance/costs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().min(2).optional(),
        category: z.enum(["INFRASTRUCTURE", "WHATSAPP", "AI", "EMAIL", "DATABASE", "TOOLS", "SUPPORT", "OTHER"]).optional(),
        amount: z.number().positive().optional(),
        recurrence: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      })
      .parse(request.body);

    const existing = assertFound(
      await prisma.platformOperationalCost.findUnique({
        where: { id },
      })
    );

    const updated = await prisma.platformOperationalCost.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        category: body.category ?? existing.category,
        amount: body.amount !== undefined ? body.amount : existing.amount,
        recurrence: body.recurrence ?? existing.recurrence,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
    });

    await audit({
      userId: request.user.sub,
      action: "admin.cost.update",
      entity: "PlatformOperationalCost",
      entityId: updated.id,
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  });

  app.delete("/admin/finance/costs/:id", async (request) => {
    const { id } = request.params as { id: string };

    const existing = assertFound(
      await prisma.platformOperationalCost.findUnique({
        where: { id },
      })
    );

    await prisma.platformOperationalCost.delete({
      where: { id },
    });

    await audit({
      userId: request.user.sub,
      action: "admin.cost.delete",
      entity: "PlatformOperationalCost",
      entityId: existing.id,
    });

    return { ok: true };
  });

  // As rotas de /admin/tenants, /admin/companies, /admin/memberships, /admin/billing e /admin/users
  // foram modularizadas sob ./platform-admin e registradas via platformAdminRoutes(app) acima.

  /**
   * Catálogo de planos.
   * ?activeOnly=1 — só isActive (exceto free, se commercial=1)
   * ?commercial=1 — planos para atribuir a empresa: free (padrão) + pagos ativos
   */
  app.get("/admin/plans", async (request) => {
    const q = z
      .object({
        activeOnly: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional(),
        commercial: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional(),
        archived: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional(),
      })
      .parse(request.query || {});

    const activeOnly = q.activeOnly === "1" || q.activeOnly === "true";
    const commercial = q.commercial === "1" || q.commercial === "true";
    const showArchived = q.archived === "1" || q.archived === "true";

    const junkSlugs = ["basic", "premium", "trial", "demo", "test", "initial"];

    const [allPlansRaw, allTenantsRaw, subscriptionsRaw] = await Promise.all([
      prisma.plan.findMany({
        orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }, { createdAt: "asc" }],
      }),
      prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          planId: true,
          trialEndsAt: true,
          settings: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.subscription.findMany({
        include: { plan: true },
      }),
    ]);

    const { plans: enrichedPlans } = computePlansCommercialStats({
      plans: allPlansRaw,
      tenants: allTenantsRaw,
      subscriptions: subscriptionsRaw,
    });

    let plans = enrichedPlans;

    if (commercial) {
      plans = plans.filter((p) => {
        if (junkSlugs.includes(p.slug)) return false;
        if (p.slug === "free") return true;
        if (activeOnly && !p.isActive) return false;
        return true;
      });
      plans.sort((a, b) => {
        if (a.slug === "free") return -1;
        if (b.slug === "free") return 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    } else if (showArchived) {
      plans = plans.filter((p) => !p.isActive);
    } else if (activeOnly) {
      plans = plans.filter((p) => p.isActive);
    }

    return plans;
  });

  app.post("/admin/plans", async (request) => {
    const body = z
      .object({
        name: z.string().trim().min(2, "O nome do plano deve ter pelo menos 2 caracteres").max(80),
        slug: z
          .string()
          .trim()
          .min(2, "Identificador obrigatório")
          .max(50)
          .regex(/^[a-z0-9-]+$/, "O identificador deve conter apenas letras minúsculas, números e hífens"),
        description: z.string().trim().max(500).optional().nullable(),
        priceMonthly: z.number().min(0).default(0),
        priceAnnual: z.number().min(0).optional().nullable(),
        priceOnRequest: z.boolean().default(false),
        maxUsers: z.number().int().min(1).default(1),
        maxChannels: z.number().int().min(1).default(1),
        maxContacts: z.number().int().min(0).default(500),
        maxConversations: z.number().int().min(0).default(1000),
        maxAiMessages: z.number().int().min(0).default(100),
        badge: z.string().max(40).optional().nullable(),
        sortOrder: z.number().int().default(100),
        isActive: z.boolean().default(true),
        features: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const existingSlug = await prisma.plan.findUnique({ where: { slug: body.slug } });
    if (existingSlug) {
      throw new AppError("Este identificador já está sendo usado por outro plano.", 400, "VALIDATION_ERROR");
    }

    const { asInputJson } = await import("../lib/json");

    let finalAnnual = body.priceAnnual;
    if (finalAnnual === undefined || finalAnnual === null || finalAnnual <= 0) {
      if (body.priceMonthly > 0 && !body.priceOnRequest) {
        finalAnnual = Math.round(body.priceMonthly * 12 * 100) / 100;
      } else {
        finalAnnual = null;
      }
    }

    const plan = await prisma.plan.create({
      data: {
        ...body,
        priceAnnual: finalAnnual,
        description: body.description || null,
        badge: body.badge || null,
        features: asInputJson(body.features || {}),
      },
      include: { _count: { select: { tenants: true } } },
    });

    await audit({
      userId: request.user.sub,
      action: "plan.created",
      entity: "plan",
      entityId: plan.id,
      metadata: { name: plan.name, slug: plan.slug, priceMonthly: Number(plan.priceMonthly), priceAnnual: finalAnnual },
      ip: request.ip,
    });

    return plan;
  });

  app.patch("/admin/plans/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        description: z.string().trim().max(500).optional().nullable(),
        priceMonthly: z.number().min(0).optional(),
        priceAnnual: z.number().min(0).optional().nullable(),
        priceOnRequest: z.boolean().optional(),
        maxUsers: z.number().int().min(1).optional(),
        maxChannels: z.number().int().min(1).optional(),
        maxContacts: z.number().int().min(0).optional(),
        maxConversations: z.number().int().min(0).optional(),
        maxAiMessages: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        badge: z.string().max(40).optional().nullable(),
        sortOrder: z.number().int().optional(),
        features: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const current = assertFound(await prisma.plan.findUnique({ where: { id } }));

    // Protege plano free obrigatório do sistema
    if (current.slug === "free") {
      if (body.isActive === false) {
        throw new AppError("O plano gratuito básico do sistema não pode ser desativado.", 400, "VALIDATION_ERROR");
      }
      if (body.priceMonthly !== undefined && body.priceMonthly > 0) {
        throw new AppError("O plano gratuito não pode ter preço mensal maior que zero.", 400, "VALIDATION_ERROR");
      }
    }

    const { asInputJson } = await import("../lib/json");
    const { features, ...rest } = body;

    if (rest.priceOnRequest === true && rest.priceMonthly === undefined) {
      rest.priceMonthly = 0;
      rest.priceAnnual = null;
    }

    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...rest,
        ...(features !== undefined ? { features: asInputJson(features) } : {}),
      },
      include: { _count: { select: { tenants: true } } },
    });

    const isArchiveToggle = body.isActive !== undefined && body.isActive !== current.isActive;
    const actionName = isArchiveToggle ? (body.isActive ? "plan.restored" : "plan.archived") : "plan.updated";

    await audit({
      userId: request.user.sub,
      action: actionName,
      entity: "plan",
      entityId: id,
      metadata: {
        slug: current.slug,
        fields: Object.keys(body),
        previousPriceMonthly: Number(current.priceMonthly),
        nextPriceMonthly:
          body.priceMonthly !== undefined ? body.priceMonthly : Number(current.priceMonthly),
        note: "Preços contratados de assinaturas existentes preservados",
      },
      ip: request.ip,
    });

    return updated;
  });

  app.post("/admin/plans/:id/duplicate", async (request) => {
    const { id } = request.params as { id: string };
    const current = assertFound(await prisma.plan.findUnique({ where: { id } }));

    // Gera slug único com sufixo copia
    let baseSlug = `${current.slug}-copia`.slice(0, 40);
    let candidateSlug = baseSlug;
    let counter = 2;
    while (await prisma.plan.findUnique({ where: { slug: candidateSlug } })) {
      candidateSlug = `${baseSlug}-${counter}`.slice(0, 50);
      counter++;
    }

    const { asInputJson } = await import("../lib/json");
    const duplicated = await prisma.plan.create({
      data: {
        name: `${current.name} (cópia)`.slice(0, 80),
        slug: candidateSlug,
        description: current.description,
        priceMonthly: current.priceMonthly,
        priceAnnual: current.priceAnnual,
        priceOnRequest: current.priceOnRequest,
        maxUsers: current.maxUsers,
        maxChannels: current.maxChannels,
        maxContacts: current.maxContacts,
        maxConversations: current.maxConversations,
        maxAiMessages: current.maxAiMessages,
        features: current.features ? asInputJson(current.features) : undefined,
        badge: null, // Duplicado nunca herda badge de destaque
        sortOrder: (current.sortOrder ?? 100) + 5,
        isActive: false, // Duplicado nasce sempre indisponível por segurança
      },
      include: { _count: { select: { tenants: true } } },
    });

    await audit({
      userId: request.user.sub,
      action: "plan.duplicated",
      entity: "plan",
      entityId: duplicated.id,
      metadata: { sourceSlug: current.slug, duplicatedSlug: duplicated.slug },
      ip: request.ip,
    });

    return duplicated;
  });

  app.delete("/admin/plans/:id", async (request) => {
    const { id } = request.params as { id: string };
    const current = assertFound(
      await prisma.plan.findUnique({
        where: { id },
        include: { _count: { select: { tenants: true, subscriptions: true } } },
      })
    );

    if (current.slug === "free") {
      throw new AppError("O plano gratuito essencial não pode ser excluído.", 400, "FORBIDDEN");
    }

    if ((current._count?.tenants ?? 0) > 0 || (current._count?.subscriptions ?? 0) > 0) {
      throw new AppError(
        "Não é possível excluir um plano que possui empresas vinculadas. Arquive o plano para retirá-lo de novas contratações.",
        400,
        "CONFLICT"
      );
    }

    await prisma.plan.delete({ where: { id } });

    await audit({
      userId: request.user.sub,
      action: "plan.deleted",
      entity: "plan",
      entityId: id,
      metadata: { slug: current.slug },
      ip: request.ip,
    });

    return { ok: true };
  });

  // As rotas de usuários foram modularizadas sob ./platform-admin/users.ts

  /** Política global Access Gate / tolerância financeira */
  app.get("/admin/access-policy", async () => {
    const { getAccessPolicy } = await import("../services/access-gate");
    return getAccessPolicy();
  });

  app.put("/admin/access-policy", async (request) => {
    const body = z
      .object({
        graceDays: z.number().int().min(0).max(90).optional(),
        autoSuspendNonpayment: z.boolean().optional(),
        companySuspendMode: z.enum(["LIMITED", "TOTAL"]).optional(),
      })
      .parse(request.body);
    const { setAccessPolicy } = await import("../services/access-gate");
    const next = await setAccessPolicy(body);
    await audit({
      userId: request.user.sub,
      action: "platform.access_policy_updated",
      entity: "platform_setting",
      entityId: "nexaflow.access.policy",
      metadata: next as unknown as Record<string, unknown>,
      ip: request.ip,
    });
    return next;
  });

  app.get("/admin/logs", async (request) => {
    const q = z
      .object({
        take: z.coerce.number().int().min(1).max(200).optional().default(50),
        cursor: z.string().optional(),
        search: z.string().optional(),
        category: z.string().optional(),
        severity: z.string().optional(),
        tenantId: z.string().optional(),
      })
      .parse(request.query ?? {});

    const { AuditService } = await import("../services/audit");
    return AuditService.list(q);
  });

  app.get("/admin/logs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { AuditService } = await import("../services/audit");
    return AuditService.getDetail(id);
  });

  /**
   * Limpa logs de auditoria de UMA empresa (tenantId).
   */
  app.delete("/admin/tenants/:id/logs", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        confirm: z.string().min(1),
      })
      .parse(request.body ?? {});

    const { AuditService } = await import("../services/audit");
    const { auditIp } = await import("../lib/client-ip");

    return AuditService.clearTenantLogs({
      tenantId: id,
      confirm: body.confirm,
      userId: request.user.sub,
      ip: auditIp(request),
    });
  });

  /**
   * Limpa logs de auditoria da plataforma preservando evidências de segurança imutáveis.
   * Requer confirmação textual "LIMPAR AUDITORIA" ou "LIMPAR".
   */
  app.delete("/admin/logs", async (request) => {
    const body = z
      .object({
        confirm: z.string().min(1),
      })
      .parse(request.body ?? {});

    const { AuditService } = await import("../services/audit");
    const { auditIp } = await import("../lib/client-ip");

    return AuditService.clearPlatformLogs({
      confirm: body.confirm,
      userId: request.user.sub,
      ip: auditIp(request),
    });
  });

  // A rota /admin/impersonate foi modularizada sob ./platform-admin/impersonation.ts

  app.get("/admin/settings", async () => {
    return prisma.platformSetting.findMany();
  });

  app.put("/admin/settings/:key", async (request) => {
    const { key } = request.params as { key: string };
    const body = z.object({ value: z.unknown() }).parse(request.body);
    return prisma.platformSetting.upsert({
      where: { key },
      update: { value: body.value as object },
      create: { key, value: body.value as object },
    });
  });
}
