import { prisma } from "../../lib/prisma";
import { computeBillingSnapshot } from "../billing";
import { catalogPriceOf, priceLabelOf } from "./billing-view";
import { isTestFixtureTenant, testUserEmailFilter } from "./fixtures";

export async function getPlatformOverview() {
  const [
    tenantsRaw,
    users,
    conversations,
    messages,
    contacts,
    activeAgents,
    automationRuns,
    plans,
    errorCount,
    subscriptions,
  ] = await Promise.all([
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        settings: true,
        createdAt: true,
        planId: true,
        plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where: { NOT: testUserEmailFilter() } }),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.contact.count(),
    prisma.aiAgent.count({ where: { isActive: true } }),
    prisma.automationRun.count(),
    prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        priceMonthly: true,
        priceOnRequest: true,
        isActive: true,
        sortOrder: true,
      },
    }),
    prisma.auditLog.count({ where: { action: { contains: "error" } } }),
    prisma.subscription.findMany({
      where: { billingStatus: { in: ["ACTIVE", "PAST_DUE"] } },
      include: { plan: true },
    }),
  ]);

  const realTenants = tenantsRaw.filter((t) => !isTestFixtureTenant(t));
  const tenantById = new Map(realTenants.map((t) => [t.id, t]));

  const active = realTenants.filter((t) => t.status === "ACTIVE").length;
  const suspended = realTenants.filter((t) => t.status === "SUSPENDED").length;
  const trial = realTenants.filter((t) => t.status === "TRIAL").length;
  const cancelled = realTenants.filter(
    (t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION"
  ).length;
  const blocked = realTenants.filter((t) => t.status === "BLOCKED").length;

  let mrr = 0;
  let paidSubscriptions = 0;
  const mrrByPlanId = new Map<
    string,
    { planName: string; catalogPrice: number | null; tenants: number; mrr: number }
  >();

  for (const sub of subscriptions) {
    const tenant = tenantById.get(sub.tenantId);
    if (!tenant || tenant.status !== "ACTIVE") continue;
    const plan = sub.plan || plans.find((p) => p.id === sub.planId || p.id === tenant.planId);
    if (!plan || plan.slug === "free") continue;
    const catalog = catalogPriceOf(plan);
    const contracted =
      sub.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
        ? Number(sub.priceMonthly)
        : catalog;
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

  const revenueByPlan = plans
    .filter((p) => !(p.slug === "free" && !p.isActive && !mrrByPlanId.has(p.id)))
    .map((p) => {
      const agg = mrrByPlanId.get(p.id);
      return {
        planId: p.id,
        planName: p.name,
        planSlug: p.slug,
        priceMonthly: catalogPriceOf(p),
        priceOnRequest: Boolean(p.priceOnRequest || p.slug === "enterprise"),
        priceLabel: priceLabelOf(p),
        isActive: p.isActive,
        tenants: agg?.tenants ?? 0,
        mrr: agg?.mrr ?? 0,
      };
    });

  const subByTenant = new Map(subscriptions.map((s) => [s.tenantId, s]));
  let overdueCount = 0;
  let dueSoonCount = 0;
  for (const t of realTenants) {
    if (t.status === "CANCELLED" || t.status === "PENDING_DELETION") continue;
    const sub = subByTenant.get(t.id);
    const snap = computeBillingSnapshot({
      tenantStatus: t.status,
      billingStatus: sub?.billingStatus,
      billingDueDay: sub?.billingDueDay,
      currentPeriodEnd: sub?.currentPeriodEnd,
      trialEndsAt: sub?.trialEndsAt,
    });
    if (snap.financialStatus === "OVERDUE") overdueCount += 1;
    if (
      (snap.financialStatus === "DUE_SOON" || snap.financialStatus === "DUE_TODAY") &&
      snap.daysUntilDue != null &&
      snap.daysUntilDue <= 3
    ) {
      dueSoonCount += 1;
    }
  }

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
  if (errorCount > 0) {
    alerts.push({
      id: "audit-errors",
      severity: "danger",
      title: `${errorCount} evento${errorCount === 1 ? "" : "s"} de erro na auditoria`,
      href: "/admin/audit",
    });
  }

  const avgTicket = paidSubscriptions > 0 ? mrr / paidSubscriptions : 0;

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
      arr: mrr * 12,
      avgTicket,
    },
    finance: {
      mrr,
      arr: mrr * 12,
      avgTicket,
      paidSubscriptions,
      revenueByPlan,
      costsAvailable: false,
      profitAvailable: false,
      note: "MRR estimado com o valor contratado das empresas ativas. Não é caixa recebido. Mudar o catálogo não altera contratos existentes.",
    },
    usage: {
      conversations,
      messages,
      contacts,
      activeAgents,
      automationRuns,
    },
    recentTenants: realTenants.slice(0, 8).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      plan: t.plan ? { name: t.plan.name } : null,
      _count: t._count,
    })),
    alerts,
  };
}
