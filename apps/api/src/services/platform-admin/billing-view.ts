import {
  computeBillingSnapshot,
  formatDaysOverdueLabel,
  formatDueDayLabel,
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
  const n = Number(plan.priceMonthly || 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
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
      priceMonthly: unknown;
      priceOnRequest?: boolean;
    } | null;
  },
  sub: SubscriptionRow | null | undefined
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
    financialStatus: snap.financialStatus as FinancialStatusCode,
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
