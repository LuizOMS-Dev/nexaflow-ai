import {
  computeBillingSnapshot,
  formatDaysOverdueLabel,
  formatDueDayLabel,
  toCivilDateUtc,
  type FinancialStatusCode,
} from "../billing";

export const TENANT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão agendada",
};

export type SubscriptionRow = {
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
  plan?: {
    id: string;
    name: string;
    slug?: string | null;
    priceMonthly: unknown;
    priceOnRequest?: boolean;
  } | null;
};

export function catalogPriceOf(plan: {
  priceMonthly: unknown;
  priceOnRequest?: boolean | null;
  slug?: string | null;
}): number | null {
  if (plan.priceOnRequest || plan.slug === "enterprise") return null;
  if (plan.priceMonthly == null || plan.priceMonthly === "") return null;
  const n = Number(plan.priceMonthly);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type PriceKind = "FREE" | "FIXED" | "CUSTOM_ZERO" | "ON_REQUEST";

export function resolvePriceKind(params: {
  planSlug?: string | null;
  priceOnRequest?: boolean | null;
  contractedPrice: number | null;
}): PriceKind {
  const slug = (params.planSlug || "").toLowerCase();
  if (slug === "free") return "FREE";
  if (params.priceOnRequest || slug === "enterprise") {
    if (params.contractedPrice != null && params.contractedPrice > 0) return "FIXED";
    if (params.contractedPrice === 0) return "CUSTOM_ZERO";
    return "ON_REQUEST";
  }
  if (params.contractedPrice === 0) return "FREE";
  if (params.contractedPrice != null && params.contractedPrice > 0) return "FIXED";
  return "ON_REQUEST";
}

export function priceLabelOf(plan: {
  priceMonthly: unknown;
  priceOnRequest?: boolean | null;
  slug?: string | null;
}): string {
  if (plan.priceOnRequest || plan.slug === "enterprise") return "Sob consulta";
  if (plan.slug === "free") return "Gratuito";
  const n = catalogPriceOf(plan);
  if (n == null || n <= 0) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function enrichTenantBilling(
  tenant: {
    id: string;
    status: string;
    planId?: string | null;
    plan?: {
      id: string;
      name: string;
      slug?: string | null;
      priceMonthly: unknown;
      priceOnRequest?: boolean;
    } | null;
  },
  sub: SubscriptionRow | null | undefined
) {
  const slug = tenant.plan?.slug || sub?.plan?.slug || null;
  const priceOnRequest = Boolean(tenant.plan?.priceOnRequest || slug === "enterprise");
  const catalog = tenant.plan ? catalogPriceOf({ ...tenant.plan, slug }) : null;
  const contractedRaw =
    sub?.priceMonthly != null && Number.isFinite(Number(sub.priceMonthly))
      ? Number(sub.priceMonthly)
      : null;
  const contracted =
    contractedRaw != null
      ? contractedRaw
      : priceOnRequest
        ? null
        : catalog;
  const priceKind = resolvePriceKind({
    planSlug: slug,
    priceOnRequest,
    contractedPrice: contracted,
  });
  const hasCharge = priceKind === "FIXED" || priceKind === "CUSTOM_ZERO";

  const snap = computeBillingSnapshot({
    tenantStatus: tenant.status,
    billingStatus: sub?.billingStatus,
    billingDueDay: sub?.billingDueDay,
    currentPeriodEnd: sub?.currentPeriodEnd,
    trialEndsAt: sub?.trialEndsAt,
    hasCharge,
  });

  const nextDueAt = snap.nextDueAt;
  const nextDueDate = nextDueAt ? toCivilDateUtc(new Date(nextDueAt)) : null;

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
    priceKind,
    hasCharge,
    financialStatus: snap.financialStatus as FinancialStatusCode,
    financialStatusLabel: snap.financialStatusLabel,
    billingDueDay: snap.billingDueDay,
    billingDueDayLabel: formatDueDayLabel(snap.billingDueDay),
    nextDueAt,
    nextDueDate,
    daysOverdue: snap.daysOverdue,
    daysOverdueLabel: formatDaysOverdueLabel(snap.daysOverdue),
    daysUntilDue: snap.daysUntilDue,
    needsAttention: snap.needsAttention,
    statusLabel: TENANT_STATUS_LABEL[tenant.status] || tenant.status,
  };
}
