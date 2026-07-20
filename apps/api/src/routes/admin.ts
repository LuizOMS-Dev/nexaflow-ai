import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";
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

  app.get("/admin/overview", async () => {
    const [allTenantsRaw, users, conversations, messages, contacts, activeAgents, automationRuns, plans, errors] =
      await Promise.all([
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
        prisma.conversation.count(),
        prisma.message.count(),
        prisma.contact.count(),
        prisma.aiAgent.count({ where: { isActive: true } }),
        prisma.automationRun.count(),
        prisma.plan.findMany({
          orderBy: { priceMonthly: "asc" },
          include: {
            tenants: {
              select: { id: true, name: true, slug: true, status: true, settings: true },
            },
          },
        }),
        prisma.auditLog.findMany({
          where: { action: { contains: "error" } },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
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

    // MRR estimado: preço CONTRATADO da Subscription; senão catálogo.
    // Não conta: trial, free, canceladas, suspensas, bloqueadas, exclusão, enterprise sem valor.
    // PAST_DUE com valor contratado ainda entra no MRR (assinatura esperada).
    let mrr = 0;
    let paidSubscriptions = 0;
    const revenueByPlan: Array<{
      planId: string;
      planName: string;
      planSlug: string;
      priceMonthly: number | null;
      priceOnRequest: boolean;
      priceLabel: string;
      isActive: boolean;
      tenants: number;
      mrr: number;
    }> = [];

    const subscriptions = await prisma.subscription.findMany({
      where: { billingStatus: { in: ["ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    });
    const tenantById = new Map(realTenants.map((t) => [t.id, t]));

    const mrrByPlanId = new Map<
      string,
      { planName: string; catalogPrice: number | null; tenants: number; mrr: number }
    >();

    const catalogPriceOf = (plan: {
      priceMonthly: unknown;
      priceOnRequest?: boolean | null;
      slug?: string | null;
    }): number | null => {
      if (plan.priceOnRequest || plan.slug === "enterprise") return null;
      const n = Number(plan.priceMonthly || 0);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    };

    const priceLabelOf = (plan: {
      priceMonthly: unknown;
      priceOnRequest?: boolean | null;
      slug?: string | null;
      name?: string;
    }): string => {
      if (plan.priceOnRequest || plan.slug === "enterprise") return "Sob consulta";
      if (plan.slug === "free") return "Gratuito";
      const n = catalogPriceOf(plan);
      if (n == null || n <= 0) return "Sob consulta";
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
    };

    for (const sub of subscriptions) {
      const tenant = tenantById.get(sub.tenantId);
      // Somente empresas ACTIVE (não blocked/suspended/cancelled/trial operacional)
      if (!tenant || tenant.status !== "ACTIVE") continue;
      const plan = sub.plan || plans.find((p) => p.id === sub.planId || p.id === tenant.planId);
      if (!plan || plan.slug === "free") continue;

      const catalog = catalogPriceOf(plan);
      const contracted =
        sub.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
          ? Number(sub.priceMonthly)
          : catalog;
      // Enterprise sob consulta sem preço contratado: não inventa MRR
      if (contracted == null || contracted <= 0) continue;

      mrr += contracted;
      paidSubscriptions += 1;
      const cur = mrrByPlanId.get(plan.id) || {
        planName: plan.name,
        catalogPrice: catalog,
        tenants: 0,
        mrr: 0,
      };
      cur.tenants += 1;
      cur.mrr += contracted;
      mrrByPlanId.set(plan.id, cur);
    }

    // Fallback: tenants ACTIVE com plano pago e sem subscription
    for (const t of realTenants) {
      if (t.status !== "ACTIVE" || !t.planId) continue;
      if (subscriptions.some((s) => s.tenantId === t.id)) continue;
      const plan = plans.find((p) => p.id === t.planId);
      if (!plan || plan.slug === "free") continue;
      const catalog = catalogPriceOf(plan);
      if (catalog == null || catalog <= 0) continue;
      mrr += catalog;
      paidSubscriptions += 1;
      const cur = mrrByPlanId.get(plan.id) || {
        planName: plan.name,
        catalogPrice: catalog,
        tenants: 0,
        mrr: 0,
      };
      cur.tenants += 1;
      cur.mrr += catalog;
      mrrByPlanId.set(plan.id, cur);
    }

    // Receita por plano: catálogo real do banco (mesma fonte da página Planos)
    // Exclui Gratuito inativo sem empresas; inclui ativos e enterprise (sob consulta)
    for (const p of plans) {
      if (p.slug === "free" && !p.isActive) {
        const hasTenants = (p.tenants || []).filter((t) => !isTestFixtureTenant(t)).length > 0;
        if (!hasTenants) continue;
      }
      const agg = mrrByPlanId.get(p.id);
      const catalog = catalogPriceOf(p);
      revenueByPlan.push({
        planId: p.id,
        planName: p.name,
        planSlug: p.slug,
        priceMonthly: catalog,
        priceOnRequest: Boolean(p.priceOnRequest || p.slug === "enterprise"),
        priceLabel: priceLabelOf(p),
        isActive: p.isActive,
        tenants: agg?.tenants ?? 0,
        mrr: agg?.mrr ?? 0,
      });
    }

    // Ordenar como catálogo comercial
    revenueByPlan.sort((a, b) => {
      const pa = plans.find((p) => p.id === a.planId);
      const pb = plans.find((p) => p.id === b.planId);
      return (pa?.sortOrder ?? 0) - (pb?.sortOrder ?? 0);
    });

    const plansWithRealCount = plans.map((p) => {
      const realCount = p.tenants.filter((t) => !isTestFixtureTenant(t)).length;
      const { tenants: _t, ...rest } = p;
      return {
        ...rest,
        _count: { tenants: realCount },
      };
    });

    const avgTicket = paidSubscriptions > 0 ? mrr / paidSubscriptions : 0;
    const arr = mrr * 12;

    // Billing snapshots para alertas reais (sem inventar)
    const subByTenant = new Map(subscriptions.map((s) => [s.tenantId, s]));
    let overdueCount = 0;
    let dueSoonCount = 0;
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

    return {
      stats: {
        tenants: realTenants.length,
        users,
        conversations,
        messages,
        contacts,
        activeAgents,
        automationRuns,
        activeTenants: active,
        suspendedTenants: suspended,
        blockedTenants: blocked,
        trialTenants: trial,
        cancelledTenants: cancelled,
        overdueTenants: overdueCount,
        dueSoonTenants: dueSoonCount,
        paidSubscriptions,
        mrr,
        arr,
        avgTicket,
      },
      finance: {
        mrr,
        arr,
        avgTicket,
        paidSubscriptions,
        revenueByPlan,
        costsAvailable: false,
        profitAvailable: false,
        /** MRR = valor contratado (Subscription.priceMonthly) de empresas ACTIVE — não é caixa */
        note: "MRR estimado com base no valor contratado das assinaturas de empresas ativas. Não representa pagamentos já recebidos. Alterar preço de catálogo não altera contratos existentes.",
      },
      usage: {
        conversations,
        messages,
        contacts,
        activeAgents,
        automationRuns,
      },
      plans: plansWithRealCount,
      recentTenants: realTenants.slice(0, 5),
      totalTenants: realTenants.length,
      alerts,
      errors,
    };
  });

  app.get("/admin/tenants", async (request) => {
    const q = z
      .object({
        search: z.string().optional(),
        status: z
          .enum([
            "ACTIVE",
            "TRIAL",
            "BLOCKED",
            "SUSPENDED",
            "CANCELLED",
            "PENDING_DELETION",
            "ALL",
          ])
          .optional(),
        /** Filtros financeiros / atalho UX */
        financial: z
          .enum([
            "ALL",
            "IN_GOOD_STANDING",
            "DUE_TODAY",
            "DUE_SOON",
            "OVERDUE",
            "PAYMENT_PENDING",
            "TRIAL",
            "CANCELLED",
            "SUSPENDED",
            "NEEDS_ATTENTION",
          ])
          .optional(),
        planId: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {});

    const where: Record<string, unknown> = {};
    if (q.status && q.status !== "ALL") where.status = q.status;
    if (q.planId) where.planId = q.planId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: "insensitive" } },
        { slug: { contains: s.toLowerCase() } },
        {
          members: {
            some: {
              user: {
                OR: [
                  { email: { contains: s, mode: "insensitive" } },
                  { name: { contains: s, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ];
    }

    const all = await prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        _count: { select: { members: true, contacts: true, conversations: true } },
        members: {
          where: { role: "ADMIN", isActive: true },
          take: 1,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const real = all.filter((t) => !isTestFixtureTenant(t));
    const tenantIds = real.map((t) => t.id);
    const subs = tenantIds.length
      ? await prisma.subscription.findMany({
          where: { tenantId: { in: tenantIds } },
          include: { plan: { select: { id: true, name: true, priceMonthly: true, priceOnRequest: true } } },
        })
      : [];
    const subMap = new Map(subs.map((s) => [s.tenantId, s as SubRow]));

    let enriched = real.map((t) => {
      const billing = enrichTenantBilling(t, subMap.get(t.id));
      const primaryAdmin = t.members[0]?.user || null;
      const { members: _m, ...rest } = t;
      return {
        ...rest,
        ...billing,
        primaryAdmin,
      };
    });

    if (q.financial && q.financial !== "ALL") {
      if (q.financial === "NEEDS_ATTENTION") {
        enriched = enriched.filter((t) => t.needsAttention);
      } else {
        enriched = enriched.filter((t) => t.financialStatus === q.financial);
      }
    }

    // Resumo compacto (sobre o universo real filtrado só por status/plan/search, sem financial)
    const summaryBase = real.map((t) =>
      enrichTenantBilling(t, subMap.get(t.id))
    );
    const summary = {
      total: real.length,
      active: real.filter((t) => t.status === "ACTIVE").length,
      overdue: summaryBase.filter((b) => b.financialStatus === "OVERDUE").length,
      suspended: real.filter((t) => t.status === "SUSPENDED").length,
      blocked: real.filter((t) => t.status === "BLOCKED").length,
      trial: real.filter((t) => t.status === "TRIAL").length,
      dueIn7Days: summaryBase.filter(
        (b) =>
          b.financialStatus === "DUE_SOON" ||
          b.financialStatus === "DUE_TODAY"
      ).length,
      cancelled: real.filter(
        (t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION"
      ).length,
      needsAttention: summaryBase.filter((b) => b.needsAttention).length,
    };

    const total = enriched.length;
    const start = (q.page - 1) * q.limit;
    const items = enriched.slice(start, start + q.limit);

    return {
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      summary,
    };
  });

  /** Detalhe completo da empresa (superadmin) */
  app.get("/admin/tenants/:id", async (request) => {
    const { id } = request.params as { id: string };
    const tenant = assertFound(
      await prisma.tenant.findUnique({
        where: { id },
        include: {
          plan: true,
          _count: {
            select: {
              members: true,
              contacts: true,
              conversations: true,
              channels: true,
              opportunities: true,
              tasks: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true,
                  avatarType: true,
                  avatarPresetId: true,
                  avatarColor: true,
                  isActive: true,
                  lastLoginAt: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    );

    const [auditLogs, subscription, payments] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId: id },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.subscription.findUnique({
        where: { tenantId: id },
        include: {
          plan: {
            select: { id: true, name: true, priceMonthly: true, priceOnRequest: true },
          },
        },
      }),
      prisma.payment.findMany({
        where: { tenantId: id },
        orderBy: { paidAt: "desc" },
        take: 50,
      }),
    ]);

    const settings = tenantSettings(tenant.settings);
    const billing = enrichTenantBilling(tenant, subscription as SubRow | null);

    /** Cotas e consumo reais (usuários, agentes IA, créditos) — reutiliza entitlements */
    const { getUsageSnapshot } = await import("../services/entitlements");
    const usageSnapshot = await getUsageSnapshot(id);

    return {
      ...tenant,
      ...billing,
      profile: {
        segment: (settings.segment as string) || null,
        phone: (settings.phone as string) || null,
        website: (settings.website as string) || null,
        commercialEmail: (settings.commercialEmail as string) || null,
        city: (settings.city as string) || null,
        state: (settings.state as string) || null,
        timezone: (settings.timezone as string) || "America/Sao_Paulo",
        language: (settings.language as string) || "pt-BR",
        onboardingCompleted: Boolean(settings.onboardingCompleted),
      },
      lifecycle: {
        suspendedAt: (settings.suspendedAt as string) || null,
        suspendReason: (settings.suspendReason as string) || null,
        suspendedBy: (settings.suspendedBy as string) || null,
        blockedAt: (settings.blockedAt as string) || null,
        blockReason: (settings.blockReason as string) || null,
        blockedBy: (settings.blockedBy as string) || null,
        cancelledAt: (settings.cancelledAt as string) || null,
        cancelReason: (settings.cancelReason as string) || null,
        cancelledBy: (settings.cancelledBy as string) || null,
        deletionRequestedAt: (settings.deletionRequestedAt as string) || null,
        deletionRequestedBy: (settings.deletionRequestedBy as string) || null,
        archivedAt: (settings.archivedAt as string) || null,
        reactivatedAt: (settings.reactivatedAt as string) || null,
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paidAt: p.paidAt,
        referencePeriod: p.referencePeriod,
        method: p.method,
        notes: p.notes,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
      })),
      auditLogs,
      /** Limites do plano + consumo (aba Uso no superadmin) */
      limits: usageSnapshot.limits,
      usage: usageSnapshot.usage,
    };
  });

  app.post("/admin/tenants", async (request) => {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        slug: z.string().optional(),
        planId: z.string().optional(),
        adminEmail: z.string().email(),
        adminName: z.string().min(2),
        adminPassword: z.string().min(8).optional(),
        forceSimilarName: z.boolean().optional(),
      })
      .parse(request.body);

    const nameKey = normalizeNameKey(body.name);
    const allTenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    const similar = allTenants.filter((t) => normalizeNameKey(t.name) === nameKey);
    if (similar.length && !body.forceSimilarName) {
      throw new AppError(
        `Já existe uma empresa com nome semelhante: ${similar.map((s) => s.name).join(", ")}`,
        409,
        "SIMILAR_TENANT_NAME"
      );
    }

    const slug =
      body.slug ||
      body.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    if (await prisma.tenant.findUnique({ where: { slug } })) {
      throw new AppError("Slug já existe", 409, "SLUG_TAKEN");
    }

    // Plano padrão: Gratuito (free). Fallback: Inicial (starter).
    let planId = body.planId;
    if (!planId) {
      const free = await prisma.plan.findFirst({
        where: { slug: "free" },
      });
      if (free) {
        planId = free.id;
      } else {
        const starter = await prisma.plan.findFirst({
          where: { slug: { in: ["starter", "initial"] } },
        });
        planId = starter?.id;
      }
    }

    const email = body.adminEmail.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Preferencial: se não houver senha, gera temporária (convite futuro)
      const tempPassword =
        body.adminPassword || `${randomBytes(18).toString("base64url")}Aa1!`;
      user = await prisma.user.create({
        data: {
          email,
          name: body.adminName,
          passwordHash: await hashPassword(tempPassword),
          status: body.adminPassword ? "ACTIVE" : "INVITED",
        },
      });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: body.name.trim(),
        slug,
        planId,
        status: "ACTIVE",
        // Empresa criada no Superadmin: perfil já definido — não forçar wizard de onboarding
        settings: {
          onboardingCompleted: true,
          adminProvisioned: true,
          provisionedAt: new Date().toISOString(),
          timezone: "America/Sao_Paulo",
          language: "pt-BR",
        },
        members: { create: { userId: user.id, role: "ADMIN" } },
        pipelines: {
          create: {
            name: "Funil Comercial",
            isDefault: true,
            stages: {
              create: [
                { name: "Novos leads", position: 0, probability: 10, color: "#94a3b8" },
                { name: "Qualificado", position: 1, probability: 40, color: "#3b82f6" },
                { name: "Proposta", position: 2, probability: 70, color: "#f59e0b" },
                { name: "Ganho", position: 3, probability: 100, color: "#22c55e", isWon: true },
                { name: "Perdido", position: 4, probability: 0, color: "#ef4444", isLost: true },
              ],
            },
          },
        },
        channels: {
          // WEBCHAT não conta no limite de WhatsApp do plano
          create: { type: "WEBCHAT", name: "Chat do site" },
        },
        aiAgents: {
          create: {
            name: "Assistente",
            instructions: "Assistente comercial padrão. Responda em pt-BR. Não invente preços.",
          },
        },
      },
      include: { plan: true },
    });

    // Knowledge inicial da EMPRESA (Planos e preços em rascunho — sem Plan NexaFlow)
    try {
      const { provisionTenantKnowledge, ensureOptionalTrainingDocs } = await import(
        "../services/knowledge-starter"
      );
      await provisionTenantKnowledge(tenant.id);
      await ensureOptionalTrainingDocs(tenant.id);
    } catch {
      /* não bloqueia criação da empresa */
    }

    // Setup histórico: agente + funil padrão já criados (não o WhatsApp)
    void import("../services/tenant-setup-checklist")
      .then(async ({ markAgentCreated, markPipelineCreated }) => {
        await markAgentCreated(tenant.id);
        await markPipelineCreated(tenant.id);
      })
      .catch(() => null);

    if (tenant.planId) {
      const { ensureTenantSubscription } = await import("../services/entitlements");
      await ensureTenantSubscription({
        tenantId: tenant.id,
        planId: tenant.planId,
        billingStatus: "ACTIVE",
        updateContractedPrice: true,
      });
    }

    await audit({
      userId: request.user.sub,
      tenantId: tenant.id,
      action: "admin.tenant.create",
      entity: "tenant",
      entityId: tenant.id,
      metadata: { adminUserId: user.id },
      ip: request.ip,
    });

    return tenant;
  });

  app.patch("/admin/tenants/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().min(2).max(120).optional(),
        status: z
          .enum([
            "ACTIVE",
            "TRIAL",
            "BLOCKED",
            "SUSPENDED",
            "CANCELLED",
            "PENDING_DELETION",
          ])
          .optional(),
        planId: z.string().optional().nullable(),
        primaryColor: z.string().max(32).optional(),
        logoUrl: z.string().max(2_500_000).optional().nullable(),
        segment: z.string().max(80).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        website: z.string().max(200).optional().nullable(),
        commercialEmail: z.string().max(160).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        state: z.string().max(40).optional().nullable(),
        suspendReason: z.string().max(500).optional(),
        blockReason: z.string().max(500).optional(),
        cancelReason: z.string().max(500).optional(),
        /** Dia de vencimento 1–31 */
        billingDueDay: z.number().int().min(1).max(31).optional().nullable(),
        /** Preço contratado mensal (não substitui catálogo do Plan) */
        priceMonthly: z.number().min(0).optional().nullable(),
        /** Forçar next due explícito (ISO) */
        nextDueAt: z.string().datetime().optional().nullable(),
        /** Ação semântica (preferível a status cru em alguns fluxos) */
        action: z
          .enum([
            "block",
            "unblock",
            "suspend",
            "reactivate",
            "cancel_subscription",
            "request_deletion",
            "cancel_deletion",
          ])
          .optional(),
      })
      .parse(request.body);

    const current = assertFound(await prisma.tenant.findUnique({ where: { id } }));
    const prev = tenantSettings(current.settings);

    let logoUrl: string | null | undefined = undefined;
    if (body.logoUrl !== undefined) {
      const { sanitizeLogoInput } = await import("../services/security/logo-upload");
      logoUrl = await sanitizeLogoInput(body.logoUrl);
    }

    const profileKeys = ["segment", "phone", "website", "commercialEmail", "city", "state"] as const;
    const nextSettings: Record<string, unknown> = { ...prev };
    for (const k of profileKeys) {
      if (body[k] !== undefined) nextSettings[k] = body[k];
    }

    // Mapear ações semânticas → status + metadados (sem apagar dados)
    let nextStatus = body.status;
    let auditAction = "admin.tenant.update";
    if (body.action === "block") {
      nextStatus = "BLOCKED";
      nextSettings.blockedAt = new Date().toISOString();
      nextSettings.blockedBy = request.user.sub;
      nextSettings.blockReason = body.blockReason || body.suspendReason || null;
      auditAction = "company.blocked";
    } else if (body.action === "unblock") {
      nextStatus = "ACTIVE";
      nextSettings.unblockedAt = new Date().toISOString();
      delete nextSettings.blockReason;
      auditAction = "company.unblocked";
    } else if (body.action === "suspend") {
      nextStatus = "SUSPENDED";
      nextSettings.suspendReason = body.suspendReason || null;
      nextSettings.suspendedAt = new Date().toISOString();
      nextSettings.suspendedBy = request.user.sub;
      auditAction = "company.suspended";
    } else if (body.action === "reactivate") {
      nextStatus = "ACTIVE";
      nextSettings.reactivatedAt = new Date().toISOString();
      delete nextSettings.suspendReason;
      delete nextSettings.blockReason;
      auditAction = "company.reactivated";
    } else if (body.action === "cancel_subscription") {
      nextStatus = "CANCELLED";
      nextSettings.cancelledAt = new Date().toISOString();
      nextSettings.cancelledBy = request.user.sub;
      nextSettings.cancelReason = body.cancelReason || null;
      auditAction = "company.subscription_canceled";
    } else if (body.action === "request_deletion") {
      nextStatus = "PENDING_DELETION";
      nextSettings.deletionRequestedAt = new Date().toISOString();
      nextSettings.deletionRequestedBy = request.user.sub;
      nextSettings.deletionReason = body.cancelReason || body.suspendReason || null;
      auditAction = "company.deletion_requested";
    } else if (body.action === "cancel_deletion") {
      nextStatus = "ACTIVE";
      delete nextSettings.deletionRequestedAt;
      delete nextSettings.deletionRequestedBy;
      delete nextSettings.deletionReason;
      auditAction = "company.deletion_canceled";
    }

    if (nextStatus === "SUSPENDED" && !body.action) {
      if (body.suspendReason) nextSettings.suspendReason = body.suspendReason;
      nextSettings.suspendedAt = new Date().toISOString();
      nextSettings.suspendedBy = request.user.sub;
      auditAction = "company.suspended";
    }
    if (nextStatus === "BLOCKED" && !body.action) {
      nextSettings.blockedAt = new Date().toISOString();
      nextSettings.blockedBy = request.user.sub;
      if (body.blockReason) nextSettings.blockReason = body.blockReason;
      auditAction = "company.blocked";
    }
    if (
      nextStatus === "ACTIVE" &&
      !body.action &&
      (current.status === "SUSPENDED" || current.status === "BLOCKED")
    ) {
      nextSettings.reactivatedAt = new Date().toISOString();
      delete nextSettings.suspendReason;
      delete nextSettings.blockReason;
      auditAction = "company.reactivated";
    }
    if (nextStatus === "CANCELLED" && !body.action) {
      nextSettings.cancelledAt = new Date().toISOString();
      nextSettings.cancelledBy = request.user.sub;
      if (body.cancelReason) nextSettings.cancelReason = body.cancelReason;
      auditAction = "company.subscription_canceled";
    }

    const data: Record<string, unknown> = {
      settings: nextSettings,
    };
    if (body.name !== undefined) data.name = body.name.trim();
    if (nextStatus !== undefined) data.status = nextStatus;
    if (body.planId !== undefined) data.planId = body.planId;
    if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor;
    if (logoUrl !== undefined) data.logoUrl = logoUrl;

    // Downgrade com excesso de uso: bloquear troca de plano se ultrapassar limites
    if (body.planId && body.planId !== current.planId) {
      const newPlan = await prisma.plan.findUnique({ where: { id: body.planId } });
      if (newPlan) {
        const users = await prisma.membership.count({ where: { tenantId: id, isActive: true } });
        const contacts = await prisma.contact.count({ where: { tenantId: id } });
        const agents = await prisma.aiAgent.count({ where: { tenantId: id } });
        const channels = await prisma.channel.count({
          where: { tenantId: id, type: "WHATSAPP", isActive: true },
        });
        const feats = (newPlan.features || {}) as Record<string, unknown>;
        const maxAgents = Number(feats.maxAgents ?? 1) || 1;
        const issues: string[] = [];
        if (users > newPlan.maxUsers) {
          issues.push(`${users} usuários (limite ${newPlan.maxUsers})`);
        }
        if (contacts > newPlan.maxContacts) {
          issues.push(`${contacts} contatos (limite ${newPlan.maxContacts})`);
        }
        if (agents > maxAgents) {
          issues.push(`${agents} agentes (limite ${maxAgents})`);
        }
        if (channels > newPlan.maxChannels) {
          issues.push(`${channels} conexões WhatsApp ativas (limite ${newPlan.maxChannels})`);
        }
        if (issues.length) {
          throw new AppError(
            `Não é possível alterar para o plano ${newPlan.name}: a empresa possui ${issues.join("; ")}. Reduza o uso antes do downgrade.`,
            409,
            "PLAN_DOWNGRADE_BLOCKED"
          );
        }
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data,
      include: { plan: true },
    });

    // Assinatura: plano / status / vencimento / preço contratado
    const subPatch: Record<string, unknown> = {};
    if (body.billingDueDay !== undefined) {
      subPatch.billingDueDay = body.billingDueDay;
      if (body.billingDueDay != null && body.nextDueAt === undefined) {
        subPatch.currentPeriodEnd = computeNextDueDate(body.billingDueDay);
      }
      auditAction =
        auditAction === "admin.tenant.update" ? "company.due_date_changed" : auditAction;
    }
    if (body.nextDueAt !== undefined) {
      subPatch.currentPeriodEnd = body.nextDueAt ? new Date(body.nextDueAt) : null;
      if (auditAction === "admin.tenant.update") auditAction = "company.due_date_changed";
    }
    if (body.priceMonthly !== undefined) {
      subPatch.priceMonthly = body.priceMonthly;
    }

    /** Status da assinatura ≠ status operacional da empresa.
     * Bloqueio (BLOCKED) NÃO altera billingStatus financeiro. */
    const resolvedBillingStatus = (st: string | undefined): string | undefined => {
      if (!st) return undefined;
      if (st === "BLOCKED") return undefined;
      if (st === "SUSPENDED") return "SUSPENDED";
      if (st === "CANCELLED" || st === "PENDING_DELETION") return "CANCELLED";
      if (st === "TRIAL") return "TRIAL";
      if (st === "ACTIVE") return "ACTIVE";
      return undefined;
    };

    if (body.planId && tenant.planId) {
      const { ensureTenantSubscription } = await import("../services/entitlements");
      await ensureTenantSubscription({
        tenantId: id,
        planId: tenant.planId,
        billingStatus: resolvedBillingStatus(tenant.status) || "ACTIVE",
        // Só atualiza preço contratado se NÃO veio priceMonthly explícito
        updateContractedPrice: body.priceMonthly === undefined,
      });
      if (auditAction === "admin.tenant.update") auditAction = "company.plan_changed";
    }

    if (Object.keys(subPatch).length || nextStatus) {
      const existing = await prisma.subscription.findUnique({ where: { tenantId: id } });
      if (existing) {
        const billingStatus = resolvedBillingStatus(tenant.status);
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            ...subPatch,
            ...(billingStatus ? { billingStatus } : {}),
          },
        });
      } else if (tenant.planId && (body.billingDueDay !== undefined || body.priceMonthly !== undefined)) {
        const { ensureTenantSubscription } = await import("../services/entitlements");
        const created = await ensureTenantSubscription({
          tenantId: id,
          planId: tenant.planId,
          billingStatus: resolvedBillingStatus(tenant.status) || "ACTIVE",
          updateContractedPrice: true,
        });
        if (created && Object.keys(subPatch).length) {
          await prisma.subscription.update({
            where: { id: created.id },
            data: subPatch,
          });
        }
      }
    }

    // Se priceMonthly veio junto com plan change, reaplicar preço contratado
    if (body.priceMonthly !== undefined) {
      await prisma.subscription
        .updateMany({
          where: { tenantId: id },
          data: { priceMonthly: body.priceMonthly },
        })
        .catch(() => null);
    }

    await audit({
      userId: request.user.sub,
      tenantId: id,
      action: auditAction,
      entity: "tenant",
      entityId: id,
      metadata: {
        fields: Object.keys(body),
        action: body.action || null,
        previousStatus: current.status,
        nextStatus: tenant.status,
        previousPlanId: current.planId,
        nextPlanId: tenant.planId,
        billingDueDay: body.billingDueDay,
        priceMonthly: body.priceMonthly,
      },
      ip: request.ip,
    });

    const sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
    return {
      ...tenant,
      ...enrichTenantBilling(tenant, sub as SubRow | null),
    };
  });

  /** Registrar pagamento manual (Superadmin) — atualiza status financeiro e próximo vencimento */
  app.post("/admin/tenants/:id/payments", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        amount: z.number().positive(),
        paidAt: z.string().datetime().optional(),
        referencePeriod: z.string().max(40).optional().nullable(),
        method: z
          .enum(["PIX", "TRANSFER", "BOLETO", "CARD", "CASH", "OTHER"])
          .optional()
          .nullable(),
        notes: z.string().max(1000).optional().nullable(),
        /** Avança próximo vencimento (padrão true) */
        advanceDueDate: z.boolean().optional().default(true),
      })
      .parse(request.body);

    const tenant = assertFound(await prisma.tenant.findUnique({ where: { id }, include: { plan: true } }));
    let sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
    if (!sub && tenant.planId) {
      const { ensureTenantSubscription } = await import("../services/entitlements");
      sub = await ensureTenantSubscription({
        tenantId: id,
        planId: tenant.planId,
        billingStatus: "ACTIVE",
        updateContractedPrice: true,
      });
    }
    if (!sub) {
      throw new AppError(
        "Empresa sem assinatura. Atribua um plano antes de registrar pagamento.",
        400,
        "NO_SUBSCRIPTION"
      );
    }

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    const payment = await prisma.payment.create({
      data: {
        tenantId: id,
        subscriptionId: sub.id,
        amount: body.amount,
        paidAt,
        referencePeriod: body.referencePeriod || null,
        method: body.method || null,
        notes: body.notes || null,
        createdBy: request.user.sub,
      },
    });

    let nextDue = sub.currentPeriodEnd;
    if (body.advanceDueDate !== false) {
      nextDue = advancePeriodAfterPayment({
        billingDueDay: sub.billingDueDay,
        currentPeriodEnd: sub.currentPeriodEnd,
        paidAt,
      });
    }

    const updatedSub = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        billingStatus: "ACTIVE",
        currentPeriodEnd: nextDue,
        ...(sub.billingDueDay == null && nextDue
          ? { billingDueDay: nextDue.getUTCDate() }
          : {}),
      },
    });

    // Recalcula camada financeira (CURRENT / PAST_DUE / SUSPENDED).
    // Não reativa Tenant.status operacional (BLOCKED/SUSPENDED admin) sozinho.
    const { recomputeTenantFinancialAccess } = await import("../services/access-gate");
    const fin = await recomputeTenantFinancialAccess(id);

    await audit({
      userId: request.user.sub,
      tenantId: id,
      action: "company.payment_registered",
      entity: "payment",
      entityId: payment.id,
      metadata: {
        amount: body.amount,
        paidAt: paidAt.toISOString(),
        referencePeriod: body.referencePeriod || null,
        method: body.method || null,
        nextDueAt: updatedSub.currentPeriodEnd?.toISOString() || null,
        financialAccess: fin.financialAccess,
        billingStatus: fin.billingStatus,
      },
      ip: request.ip,
    });

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.paidAt,
        referencePeriod: payment.referencePeriod,
        method: payment.method,
        notes: payment.notes,
        createdAt: payment.createdAt,
      },
      subscription: {
        id: updatedSub.id,
        billingStatus: updatedSub.billingStatus,
        billingDueDay: updatedSub.billingDueDay,
        currentPeriodEnd: updatedSub.currentPeriodEnd,
        priceMonthly:
          updatedSub.priceMonthly != null ? Number(updatedSub.priceMonthly) : null,
      },
      billing: enrichTenantBilling(tenant, updatedSub as SubRow),
    };
  });

  app.get("/admin/tenants/:id/payments", async (request) => {
    const { id } = request.params as { id: string };
    assertFound(await prisma.tenant.findUnique({ where: { id } }));
    const payments = await prisma.payment.findMany({
      where: { tenantId: id },
      orderBy: { paidAt: "desc" },
      take: 100,
    });
    return {
      items: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paidAt: p.paidAt,
        referencePeriod: p.referencePeriod,
        method: p.method,
        notes: p.notes,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
      })),
    };
  });

  /**
   * Soft-delete controlado (preferido):
   * - Por padrão marca PENDING_DELETION + bloqueia acesso (dados intactos).
   * - NÃO executa cascata física nem remove sessões WhatsApp de outras empresas.
   * - Hard delete definitivo NÃO está exposto aqui (processo controlado futuro).
   */
  app.delete("/admin/tenants/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        confirmName: z.string().min(1),
        reason: z.string().max(500).optional(),
        /** soft (padrão) = PENDING_DELETION; archive = CANCELLED legado */
        mode: z.enum(["soft", "archive"]).optional().default("soft"),
      })
      .parse(request.body || {});

    const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
    if (body.confirmName.trim() !== tenant.name.trim()) {
      throw new AppError(
        "Digite o nome exato da empresa para confirmar a exclusão.",
        400,
        "CONFIRM_NAME_MISMATCH"
      );
    }

    const prev = tenantSettings(tenant.settings);
    const now = new Date().toISOString();
    const status = body.mode === "archive" ? "CANCELLED" : "PENDING_DELETION";

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        status,
        settings: {
          ...prev,
          deletionRequestedAt: now,
          deletionRequestedBy: request.user.sub,
          deletionReason: body.reason || null,
          archivedAt: body.mode === "archive" ? now : prev.archivedAt || null,
          archivedBy: body.mode === "archive" ? request.user.sub : prev.archivedBy || null,
          archiveReason: body.mode === "archive" ? body.reason || null : prev.archiveReason || null,
        },
      },
    });

    await prisma.subscription
      .updateMany({
        where: { tenantId: id },
        data: { billingStatus: "CANCELLED", cancelAt: new Date() },
      })
      .catch(() => null);

    await audit({
      userId: request.user.sub,
      tenantId: id,
      action:
        body.mode === "archive" ? "admin.tenant.archive" : "company.deletion_requested",
      entity: "tenant",
      entityId: id,
      metadata: {
        reason: body.reason || null,
        mode: body.mode,
        hardDelete: false,
        note: "Dados preservados. Exclusão física não executada automaticamente.",
      },
      ip: request.ip,
    });
    await recordSecurityEvent({
      type: "TENANT_ARCHIVED",
      userId: request.user.sub,
      tenantId: id,
      ip: request.ip,
      metadata: { name: tenant.name, mode: body.mode },
    });

    return {
      ok: true,
      tenant: updated,
      message:
        body.mode === "archive"
          ? "Empresa arquivada. Dados preservados."
          : "Exclusão solicitada. Acesso bloqueado e dados preservados até processo definitivo.",
    };
  });

  /** Alterar papel ou suspender membership (não exclui User global) */
  app.patch("/admin/tenants/:tenantId/members/:membershipId", async (request) => {
    const { tenantId, membershipId } = request.params as {
      tenantId: string;
      membershipId: string;
    };
    const body = z
      .object({
        role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(request.body);

    const membership = assertFound(
      await prisma.membership.findFirst({
        where: { id: membershipId, tenantId },
      })
    );

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await audit({
      userId: request.user.sub,
      tenantId,
      action: "admin.membership.update",
      entity: "membership",
      entityId: membershipId,
      metadata: body,
      ip: request.ip,
    });

    return updated;
  });

  /** Remove vínculo empresa↔usuário (não apaga a conta global) */
  app.delete("/admin/tenants/:tenantId/members/:membershipId", async (request) => {
    const { tenantId, membershipId } = request.params as {
      tenantId: string;
      membershipId: string;
    };

    const membership = assertFound(
      await prisma.membership.findFirst({
        where: { id: membershipId, tenantId },
      })
    );

    await prisma.membership.delete({ where: { id: membership.id } });

    await audit({
      userId: request.user.sub,
      tenantId,
      action: "admin.membership.remove",
      entity: "membership",
      entityId: membershipId,
      metadata: { userId: membership.userId },
      ip: request.ip,
    });

    return { ok: true };
  });

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
      })
      .parse(request.query || {});

    const activeOnly = q.activeOnly === "1" || q.activeOnly === "true";
    const commercial = q.commercial === "1" || q.commercial === "true";

    const junkSlugs = ["basic", "premium", "trial", "demo", "test", "initial"];

    let plans = await prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
      include: { _count: { select: { tenants: true } } },
    });

    if (commercial) {
      // free sempre (padrão de cadastro); demais ativos e sem lixo
      plans = plans.filter((p) => {
        if (junkSlugs.includes(p.slug)) return false;
        if (p.slug === "free") return true;
        if (activeOnly && !p.isActive) return false;
        return true;
      });
      // free primeiro
      plans.sort((a, b) => {
        if (a.slug === "free") return -1;
        if (b.slug === "free") return 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
    } else if (activeOnly) {
      plans = plans.filter((p) => p.isActive);
    }

    return plans;
  });

  app.post("/admin/plans", async (request) => {
    const body = z
      .object({
        name: z.string(),
        slug: z.string(),
        description: z.string().optional(),
        priceMonthly: z.number().default(0),
        priceAnnual: z.number().optional().nullable(),
        priceOnRequest: z.boolean().optional(),
        maxUsers: z.number().default(1),
        maxChannels: z.number().default(1),
        maxContacts: z.number().default(500),
        maxConversations: z.number().default(1000),
        maxAiMessages: z.number().default(100),
        badge: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
        features: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const { asInputJson } = await import("../lib/json");
    return prisma.plan.create({
      data: { ...body, features: asInputJson(body.features || {}) },
    });
  });

  app.patch("/admin/plans/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(500).optional().nullable(),
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
    const { asInputJson } = await import("../lib/json");
    const { features, ...rest } = body;

    // Enterprise sob consulta: se priceOnRequest, não força preço zero na UI como “grátis”
    if (rest.priceOnRequest === true && rest.priceMonthly === undefined) {
      rest.priceMonthly = 0;
    }

    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...rest,
        ...(features !== undefined ? { features: asInputJson(features) } : {}),
      },
      include: { _count: { select: { tenants: true } } },
    });

    // Alterar catálogo NÃO atualiza Subscription.priceMonthly das empresas existentes
    await audit({
      userId: request.user.sub,
      action: "plan.updated",
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

  /**
   * Lista global de usuários (SUPERADMIN only via requireSuperadmin).
   * Membership (tenant) e platformRole (global) são conceitos independentes.
   */
  app.get("/admin/users", async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        status: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            isActive: true,
            tenant: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  });

  /**
   * Status global do usuário (não membership).
   * ACTIVE | SUSPENDED | DISABLED (bloqueado) | INVITED | PENDING_VERIFICATION
   */
  app.patch("/admin/users/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum([
          "ACTIVE",
          "SUSPENDED",
          "DISABLED",
          "INVITED",
          "PENDING_VERIFICATION",
        ]),
        reason: z.string().max(500).optional(),
      })
      .parse(request.body);

    const target = assertFound(await prisma.user.findUnique({ where: { id } }));
    if (target.platformRole === "SUPERADMIN" && target.id === request.user.sub) {
      throw new AppError("Não é possível alterar o status da própria conta Superadmin.", 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: body.status,
        isActive: body.status === "ACTIVE" || body.status === "INVITED",
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        isActive: true,
        platformRole: true,
      },
    });

    await audit({
      userId: request.user.sub,
      action:
        body.status === "DISABLED"
          ? "user.blocked"
          : body.status === "SUSPENDED"
            ? "user.suspended"
            : body.status === "ACTIVE"
              ? "user.reactivated"
              : "user.status_updated",
      entity: "user",
      entityId: id,
      metadata: { status: body.status, reason: body.reason || null, prev: target.status },
      ip: request.ip,
    });

    return updated;
  });

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
      })
      .parse(request.query ?? {});

    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: q.take,
      ...(q.cursor
        ? {
            skip: 1,
            cursor: { id: q.cursor },
          }
        : {}),
    });
    const { redactMetadata } = await import("../services/platform-log-redaction");
    return {
      items: logs.map((l) => ({
        ...l,
        metadata: redactMetadata(l.metadata),
      })),
      nextCursor: logs.length === q.take ? logs[logs.length - 1]?.id ?? null : null,
    };
  });

  /**
   * Limpa logs de auditoria de UMA empresa (tenantId).
   * Confirmação "LIMPAR". Deixa 1 evento residual no tenant.
   */
  app.delete("/admin/tenants/:id/logs", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        confirm: z.string().min(1),
      })
      .parse(request.body ?? {});

    if (body.confirm.trim().toUpperCase() !== "LIMPAR") {
      throw new AppError(
        'Confirme digitando LIMPAR para limpar os logs desta empresa.',
        400,
        "CONFIRMATION_REQUIRED"
      );
    }

    assertFound(await prisma.tenant.findUnique({ where: { id } }));

    const before = await prisma.auditLog.count({ where: { tenantId: id } });
    const deleted = await prisma.auditLog.deleteMany({ where: { tenantId: id } });

    const { auditIp } = await import("../lib/client-ip");
    await audit({
      userId: request.user.sub,
      tenantId: id,
      action: "admin.tenant.logs.cleared",
      entity: "audit_log",
      entityId: id,
      metadata: {
        deletedCount: deleted.count,
        countBefore: before,
        scope: "tenant",
      },
      ip: auditIp(request),
    });

    return {
      ok: true,
      deleted: deleted.count,
      message:
        deleted.count === 0
          ? "Não havia logs desta empresa."
          : `${deleted.count} log${deleted.count === 1 ? "" : "s"} da empresa removido${deleted.count === 1 ? "" : "s"}.`,
    };
  });

  /**
   * Limpa logs de auditoria da plataforma.
   * Requer confirmação textual "LIMPAR".
   * Após apagar, grava um único evento `admin.logs.cleared` (trilha residual).
   */
  app.delete("/admin/logs", async (request) => {
    const body = z
      .object({
        confirm: z.string().min(1),
        /** Se true, remove todos. Se false (default), remove apenas os mais antigos que o evento de limpeza. */
        all: z.boolean().optional().default(true),
      })
      .parse(request.body ?? {});

    if (body.confirm.trim().toUpperCase() !== "LIMPAR") {
      throw new AppError(
        'Confirme digitando LIMPAR para limpar os logs de auditoria.',
        400,
        "CONFIRMATION_REQUIRED"
      );
    }

    const before = await prisma.auditLog.count();
    const deleted = await prisma.auditLog.deleteMany({});

    const { auditIp } = await import("../lib/client-ip");
    await audit({
      userId: request.user.sub,
      action: "admin.logs.cleared",
      entity: "audit_log",
      metadata: {
        deletedCount: deleted.count,
        countBefore: before,
        scope: body.all ? "all" : "all",
      },
      ip: auditIp(request),
    });

    return {
      ok: true,
      deleted: deleted.count,
      message:
        deleted.count === 0
          ? "Não havia logs para limpar."
          : `${deleted.count} registro${deleted.count === 1 ? "" : "s"} de auditoria removido${deleted.count === 1 ? "" : "s"}.`,
    };
  });

  /**
   * Impersonação de superadmin:
   * - Cria sessão marcada isImpersonation
   * - JWT com imp/impBy; RBAC usa role do membership (não bypass total)
   * - Superadmin rotas bloqueadas enquanto imp=true
   */
  app.post("/admin/impersonate", async (request, reply) => {
    const body = z
      .object({
        tenantId: z.string(),
        userId: z.string().optional(),
        reason: z.string().min(8).max(500),
      })
      .parse(request.body);
    const superadmin = request.user as JwtUser;

    // MFA superadmin + autenticação recente (step-up)
    await requireSuperadminMfa(superadmin);
    await requireRecentAuthentication(superadmin, { action: "impersonate" });

    const tenant = assertFound(
      await prisma.tenant.findUnique({ where: { id: body.tenantId }, include: { plan: true } })
    );

    // Impersonation permitida em qualquer status operacional (suporte).
    // Access Gate marca operationalPaused — não reativa automações/API/WA auto.

    let targetUserId = body.userId;
    if (!targetUserId) {
      const membership = await prisma.membership.findFirst({
        where: { tenantId: tenant.id, role: "ADMIN", isActive: true },
      });
      targetUserId = membership?.userId;
    }
    if (!targetUserId) {
      throw new AppError("Nenhum usuário alvo encontrado na empresa.", 404);
    }

    const user = assertFound(await prisma.user.findUnique({ where: { id: targetUserId } }));
    const membership = await prisma.membership.findFirst({
      where: { tenantId: tenant.id, userId: user.id, isActive: true },
    });
    if (!membership) {
      throw new AppError("Usuário não pertence a esta empresa.", 400);
    }

    if (superadmin.sid) {
      await revokeSession(superadmin.sid, "impersonation_start");
    }

    const { session, refreshToken } = await createAuthSession({
      userId: user.id,
      tenantId: tenant.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      isImpersonation: true,
      impersonatorId: superadmin.sub,
      impersonationReason: body.reason.trim(),
      impersonationMaxMs: 2 * 60 * 60 * 1000, // 2h hard cap
    });

    const accessToken = app.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: "SUPERADMIN",
      tenantId: tenant.id,
      role: membership.role,
      sid: session.id,
      jti: session.id,
      imp: true,
      impBy: superadmin.sub,
    });

    setRefreshCookie(reply, refreshToken);
    setAccessCookie(reply, accessToken);

    await audit({
      userId: superadmin.sub,
      tenantId: tenant.id,
      action: "admin.impersonate",
      entity: "tenant",
      entityId: tenant.id,
      metadata: {
        targetUserId: user.id,
        sessionId: session.id,
        reason: body.reason.trim(),
        actorReal: superadmin.sub,
        actorEffective: user.id,
        expiresAt: session.impersonationExpiresAt,
      },
      ip: request.ip,
    });
    await recordSecurityEvent({
      type: "IMPERSONATION_START",
      userId: superadmin.sub,
      tenantId: tenant.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      metadata: {
        targetUserId: user.id,
        reason: body.reason.trim(),
        expiresAt: session.impersonationExpiresAt,
      },
    });

    return {
      token: accessToken,
      accessToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      impersonation: {
        active: true,
        by: superadmin.sub,
        reason: body.reason.trim(),
        expiresAt: session.impersonationExpiresAt,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        primaryColor: tenant.primaryColor,
        logoUrl: tenant.logoUrl,
        role: membership.role,
        plan: tenant.plan,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        platformRole: "SUPERADMIN",
      },
    };
  });

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

/**
 * Encerrar impersonação — rota autenticada (não exige requireSuperadmin limpo,
 * pois a sessão está em modo imp).
 */
export async function impersonationStopRoutes(app: FastifyInstance) {
  app.post(
    "/admin/stop-impersonation",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const jwtUser = request.user as JwtUser;
      if (!jwtUser.imp || !jwtUser.impBy) {
        throw new AppError("Nenhuma impersonação ativa.", 400, "NO_IMPERSONATION");
      }

      const superadmin = assertFound(
        await prisma.user.findUnique({
          where: { id: jwtUser.impBy },
          include: {
            memberships: {
              where: { isActive: true },
              include: { tenant: { include: { plan: true } } },
            },
          },
        })
      );

      if (superadmin.platformRole !== "SUPERADMIN") {
        throw new AppError("Impersonação inválida.", 403, "FORBIDDEN");
      }

      if (jwtUser.sid) {
        await revokeSession(jwtUser.sid, "impersonation_stop");
      }

      const { session, refreshToken } = await createAuthSession({
        userId: superadmin.id,
        tenantId: null,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
        isImpersonation: false,
      });

      const accessToken = app.jwt.sign({
        sub: superadmin.id,
        email: superadmin.email,
        name: superadmin.name,
        platformRole: "SUPERADMIN",
        tenantId: null,
        role: null,
        sid: session.id,
        imp: false,
        impBy: null,
      });

      setRefreshCookie(reply, refreshToken);
      setAccessCookie(reply, accessToken);

      await audit({
        userId: superadmin.id,
        action: "admin.impersonate.stop",
        metadata: { previousUserId: jwtUser.sub, previousTenantId: jwtUser.tenantId },
        ip: request.ip,
      });
      await recordSecurityEvent({
        type: "IMPERSONATION_STOP",
        userId: superadmin.id,
        ip: request.ip,
        metadata: { previousUserId: jwtUser.sub },
      });

      return {
        accessToken,
        expiresIn: ACCESS_TOKEN_SECONDS,
        user: {
          id: superadmin.id,
          email: superadmin.email,
          name: superadmin.name,
          platformRole: superadmin.platformRole,
          avatarUrl: superadmin.avatarUrl,
          avatarType: superadmin.avatarType,
          avatarPresetId: superadmin.avatarPresetId,
          avatarColor: superadmin.avatarColor,
        },
        tenant: null,
        memberships: superadmin.memberships.map((m) => ({
          tenantId: m.tenantId,
          role: m.role,
          tenant: {
            id: m.tenant.id,
            name: m.tenant.name,
            slug: m.tenant.slug,
            primaryColor: m.tenant.primaryColor,
          },
        })),
        impersonation: { active: false },
        security: await getSecurityFlags(superadmin.id, superadmin.platformRole),
      };
    }
  );
}
