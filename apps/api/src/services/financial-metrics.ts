import type { Plan, Subscription, Tenant } from "@prisma/client";

export type TenantMinimal = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planId: string | null;
  trialEndsAt?: Date | string | null;
  settings?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionWithPlan = Subscription & {
  plan?: Plan | null;
};

export type PlatformCostRow = {
  id: string;
  name: string;
  category: string;
  amount: unknown;
  recurrence: string;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
};

export type PlanMinimal = Plan;

export function isTestTenant(tenant: { slug?: string | null; name?: string | null; settings?: unknown }): boolean {
  if (tenant.slug?.startsWith("test-") || tenant.slug?.startsWith("e2e-") || tenant.slug?.startsWith("c3-") || tenant.slug?.startsWith("fin-")) {
    return true;
  }
  const s = tenant.settings;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const rec = s as Record<string, unknown>;
    if (rec.isE2EFixture === true || rec.isTestTenant === true) return true;
    if (rec.environment === "test" || rec.environment === "e2e") return true;
    if (typeof rec.testSuite === "string" && rec.testSuite.length > 0) return true;
  }
  return false;
}

export function getCatalogMonthlyPrice(plan: {
  priceMonthly: unknown;
  priceOnRequest?: boolean | null;
  slug?: string | null;
}): number | null {
  if (plan.priceOnRequest || plan.slug === "enterprise") return null;
  const n = Number(plan.priceMonthly || 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function getPlanPriceLabel(plan: {
  priceMonthly: unknown;
  priceOnRequest?: boolean | null;
  slug?: string | null;
  name?: string;
}): string {
  if (plan.priceOnRequest || plan.slug === "enterprise") return "Sob consulta";
  if (plan.slug === "free") return "Gratuito";
  const n = getCatalogMonthlyPrice(plan);
  if (n == null || n <= 0) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export type FinancialMetricsResult = {
  summary: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    totalRealTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    cancelledTenants: number;
  };
  performance: {
    mrr: number;
    monthlyCosts: number;
    estimatedProfit: number;
    estimatedMargin: number;
    costsConfigured: boolean;
  };
  revenueByPlan: Array<{
    planId: string;
    planName: string;
    planSlug: string;
    isActive: boolean;
    catalogPrice: number | null;
    priceLabel: string;
    tenants: number;
    averageContractedPrice: number;
    mrr: number;
    sharePercentage: number;
  }>;
  recentSubscriptions: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    planName: string;
    planSlug: string;
    contractedPrice: number;
    catalogPrice: number | null;
    billingStatus: string;
    billingDueDay: number | null;
    currentPeriodEnd: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  trials: {
    total: number;
    expiringIn7Days: number;
    expired: number;
  };
  attention: {
    overdueCount: number;
    overdueMrrRisk: number;
    inconsistentEnterpriseCount: number;
  };
};

export function computePlatformFinancialMetrics(params: {
  tenants: TenantMinimal[];
  plans: Plan[];
  subscriptions: SubscriptionWithPlan[];
  costs?: PlatformCostRow[];
  now?: Date;
}): FinancialMetricsResult {
  const now = params.now || new Date();
  const realTenants = params.tenants.filter((t) => !isTestTenant(t));
  const tenantById = new Map(realTenants.map((t) => [t.id, t]));

  let mrr = 0;
  let paidSubscriptionsCount = 0;
  let overdueMrrRisk = 0;
  let overdueCount = 0;
  let inconsistentEnterpriseCount = 0;

  const planStatsMap = new Map<
    string,
    {
      planName: string;
      planSlug: string;
      isActive: boolean;
      catalogPrice: number | null;
      priceLabel: string;
      tenants: number;
      mrr: number;
    }
  >();

  // Inicializa todos os planos conhecidos
  for (const plan of params.plans) {
    if (plan.slug === "free") continue;
    const cat = getCatalogMonthlyPrice(plan);
    planStatsMap.set(plan.id, {
      planName: plan.name,
      planSlug: plan.slug,
      isActive: plan.isActive,
      catalogPrice: cat,
      priceLabel: getPlanPriceLabel(plan),
      tenants: 0,
      mrr: 0,
    });
  }

  // 1. Processa assinaturas existentes
  for (const sub of params.subscriptions) {
    const tenant = tenantById.get(sub.tenantId);
    if (!tenant) continue;

    const plan = sub.plan || params.plans.find((p) => p.id === sub.planId || p.id === tenant.planId);
    if (!plan || plan.slug === "free") continue;

    const isEnterprise = plan.slug === "enterprise" || plan.priceOnRequest;
    const catalog = getCatalogMonthlyPrice(plan);

    // Prioridade total ao valor negociado/contratado
    const contracted =
      sub.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
        ? Number(sub.priceMonthly)
        : catalog;

    if (isEnterprise && (contracted == null || contracted <= 0)) {
      inconsistentEnterpriseCount += 1;
    }

    // Apenas empresas ACTIVE com assinatura ativa/past_due entram no MRR contratado
    const isPayingStatus = sub.billingStatus === "ACTIVE" || sub.billingStatus === "PAST_DUE";
    if (tenant.status === "ACTIVE" && isPayingStatus && contracted != null && contracted > 0) {
      mrr += contracted;
      paidSubscriptionsCount += 1;

      if (sub.billingStatus === "PAST_DUE") {
        overdueCount += 1;
        overdueMrrRisk += contracted;
      }

      const cur = planStatsMap.get(plan.id) || {
        planName: plan.name,
        planSlug: plan.slug,
        isActive: plan.isActive,
        catalogPrice: catalog,
        priceLabel: getPlanPriceLabel(plan),
        tenants: 0,
        mrr: 0,
      };
      cur.tenants += 1;
      cur.mrr += contracted;
      planStatsMap.set(plan.id, cur);
    }
  }

  // 2. Fallback para empresas ACTIVE com plano pago e sem registro em Subscription
  for (const t of realTenants) {
    if (t.status !== "ACTIVE" || !t.planId) continue;
    if (params.subscriptions.some((s) => s.tenantId === t.id)) continue;
    const plan = params.plans.find((p) => p.id === t.planId);
    if (!plan || plan.slug === "free") continue;

    const catalog = getCatalogMonthlyPrice(plan);
    if (catalog == null || catalog <= 0) continue;

    mrr += catalog;
    paidSubscriptionsCount += 1;

    const cur = planStatsMap.get(plan.id) || {
      planName: plan.name,
      planSlug: plan.slug,
      isActive: plan.isActive,
      catalogPrice: catalog,
      priceLabel: getPlanPriceLabel(plan),
      tenants: 0,
      mrr: 0,
    };
    cur.tenants += 1;
    cur.mrr += catalog;
    planStatsMap.set(plan.id, cur);
  }

  const arr = mrr * 12;
  const avgTicket = paidSubscriptionsCount > 0 ? mrr / paidSubscriptionsCount : 0;

  // 3. Custos Operacionais da Plataforma
  const costs = params.costs || [];
  const activeCosts = costs.filter((c) => c.isActive);
  let monthlyCosts = 0;
  for (const c of activeCosts) {
    const amt = Number(c.amount || 0);
    if (c.recurrence === "MONTHLY") {
      monthlyCosts += amt;
    } else if (c.recurrence === "ANNUAL") {
      monthlyCosts += amt / 12;
    }
  }

  const costsConfigured = costs.length > 0;
  const estimatedProfit = mrr - monthlyCosts;
  const estimatedMargin = mrr > 0 ? (estimatedProfit / mrr) * 100 : 0;

  // 4. Receita por Plano detalhada
  const revenueByPlan = Array.from(planStatsMap.entries()).map(([planId, data]) => ({
    planId,
    planName: data.planName,
    planSlug: data.planSlug,
    isActive: data.isActive,
    catalogPrice: data.catalogPrice,
    priceLabel: data.priceLabel,
    tenants: data.tenants,
    averageContractedPrice: data.tenants > 0 ? data.mrr / data.tenants : data.catalogPrice || 0,
    mrr: data.mrr,
    sharePercentage: mrr > 0 ? Math.round((data.mrr / mrr) * 100) : 0,
  }));
  revenueByPlan.sort((a, b) => b.mrr - a.mrr);

  // 5. Assinaturas Recentes
  const sortedSubs = [...params.subscriptions]
    .filter((s) => tenantById.has(s.tenantId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const recentSubscriptions = sortedSubs.map((sub) => {
    const tenant = tenantById.get(sub.tenantId)!;
    const plan = sub.plan || params.plans.find((p) => p.id === sub.planId || p.id === tenant.planId);
    const catalog = plan ? getCatalogMonthlyPrice(plan) : null;
    const contracted =
      sub.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
        ? Number(sub.priceMonthly)
        : catalog || 0;

    return {
      id: sub.id,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      planName: plan?.name || "Sem plano",
      planSlug: plan?.slug || "none",
      contractedPrice: contracted,
      catalogPrice: catalog,
      billingStatus: sub.billingStatus,
      billingDueDay: sub.billingDueDay,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
      createdAt: new Date(sub.createdAt).toISOString(),
      updatedAt: new Date(sub.updatedAt).toISOString(),
    };
  });

  // 6. Trials
  const trialTenantsList = realTenants.filter((t) => t.status === "TRIAL");
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let expiringTrialsCount = 0;
  let expiredTrialsCount = 0;

  for (const t of trialTenantsList) {
    if (!t.trialEndsAt) continue;
    const end = new Date(t.trialEndsAt);
    if (end < now) {
      expiredTrialsCount += 1;
    } else if (end <= sevenDaysFromNow) {
      expiringTrialsCount += 1;
    }
  }

  return {
    summary: {
      mrr,
      arr,
      avgTicket,
      paidSubscriptions: paidSubscriptionsCount,
      totalRealTenants: realTenants.length,
      activeTenants: realTenants.filter((t) => t.status === "ACTIVE").length,
      trialTenants: trialTenantsList.length,
      suspendedTenants: realTenants.filter((t) => t.status === "SUSPENDED").length,
      cancelledTenants: realTenants.filter((t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION").length,
    },
    performance: {
      mrr,
      monthlyCosts,
      estimatedProfit,
      estimatedMargin,
      costsConfigured,
    },
    revenueByPlan,
    recentSubscriptions,
    trials: {
      total: trialTenantsList.length,
      expiringIn7Days: expiringTrialsCount,
      expired: expiredTrialsCount,
    },
    attention: {
      overdueCount,
      overdueMrrRisk,
      inconsistentEnterpriseCount,
    },
  };
}

export type PlanWithCommercialStats = Plan & {
  activeCustomerCount: number;
  isMostPopular: boolean;
  _count: {
    tenants: number;
  };
};

export function computePlansCommercialStats(params: {
  plans: Plan[];
  tenants: TenantMinimal[];
  subscriptions: SubscriptionWithPlan[];
}): {
  plans: PlanWithCommercialStats[];
  summary: {
    availablePlansCount: number;
    archivedPlansCount: number;
    payingCompaniesCount: number;
    mostPopularPlanId: string | null;
    mostPopularPlanName: string | null;
    mostPopularStatus: "leader" | "tie" | "empty";
  };
} {
  const finMetrics = computePlatformFinancialMetrics({
    tenants: params.tenants,
    plans: params.plans,
    subscriptions: params.subscriptions,
  });

  const realTenants = params.tenants.filter((t) => !isTestTenant(t));

  // Mapa de clientes ativos por plano usando a métrica unificada de finanças
  const activeCountByPlan = new Map<string, number>();

  // Inicializa com as contagens calculadas pelo financeiro para planos pagos
  for (const rev of finMetrics.revenueByPlan) {
    activeCountByPlan.set(rev.planId, rev.tenants);
  }

  // Para o plano free: conta tenants reais ativos não cancelados/deletados
  const freePlan = params.plans.find((p) => p.slug === "free");
  if (freePlan) {
    const freeTenantsCount = realTenants.filter(
      (t) =>
        t.planId === freePlan.id &&
        t.status !== "CANCELLED" &&
        t.status !== "PENDING_DELETION"
    ).length;
    activeCountByPlan.set(freePlan.id, freeTenantsCount);
  }

  // Determina o "Mais Popular" entre os planos comerciais pagos (excluindo Free)
  const paidCommercialPlans = params.plans.filter(
    (p) =>
      p.slug !== "free" &&
      (Number(p.priceMonthly) > 0 || p.priceOnRequest || p.slug === "enterprise")
  );

  let maxCount = 0;
  for (const p of paidCommercialPlans) {
    const count = activeCountByPlan.get(p.id) || 0;
    if (count > maxCount) {
      maxCount = count;
    }
  }

  let mostPopularPlanId: string | null = null;
  let mostPopularStatus: "leader" | "tie" | "empty" = "empty";

  if (maxCount > 0) {
    const leaders = paidCommercialPlans.filter(
      (p) => (activeCountByPlan.get(p.id) || 0) === maxCount
    );
    if (leaders.length === 1) {
      mostPopularPlanId = leaders[0].id;
      mostPopularStatus = "leader";
    } else {
      mostPopularStatus = "tie";
    }
  }

  const mostPopularPlanName = mostPopularPlanId
    ? params.plans.find((p) => p.id === mostPopularPlanId)?.name || null
    : null;

  const availablePlansCount = params.plans.filter((p) => p.isActive).length;
  const archivedPlansCount = params.plans.filter((p) => !p.isActive).length;
  const payingCompaniesCount = finMetrics.summary.paidSubscriptions;

  const enrichedPlans: PlanWithCommercialStats[] = params.plans.map((p) => {
    const count = activeCountByPlan.get(p.id) || 0;
    const isMostPopular = Boolean(mostPopularPlanId && p.id === mostPopularPlanId);
    return {
      ...p,
      activeCustomerCount: count,
      isMostPopular,
      _count: {
        tenants: count,
      },
    };
  });

  return {
    plans: enrichedPlans,
    summary: {
      availablePlansCount,
      archivedPlansCount,
      payingCompaniesCount,
      mostPopularPlanId,
      mostPopularPlanName,
      mostPopularStatus,
    },
  };
}

