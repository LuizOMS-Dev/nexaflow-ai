/**
 * Billing helpers — cobrança manual Superadmin.
 * Não inventa inadimplência: só calcula atraso com currentPeriodEnd real.
 * Automações de bloqueio por atraso NÃO estão ativas (preparadas apenas).
 */

export type FinancialStatusCode =
  | "IN_GOOD_STANDING"
  | "DUE_TODAY"
  | "DUE_SOON"
  | "OVERDUE"
  | "PAYMENT_PENDING"
  | "TRIAL"
  | "CANCELLED"
  | "SUSPENDED"
  | "UNKNOWN";

export const FINANCIAL_STATUS_LABEL: Record<FinancialStatusCode, string> = {
  IN_GOOD_STANDING: "Pagamento em dia",
  DUE_TODAY: "Vence hoje",
  DUE_SOON: "Vence em breve",
  OVERDUE: "Pagamento atrasado",
  PAYMENT_PENDING: "Pagamento pendente",
  TRIAL: "Trial",
  CANCELLED: "Cancelada",
  SUSPENDED: "Suspensa",
  UNKNOWN: "Sem cobrança",
};

/** Dias até o vencimento para "vence em breve" */
export const DUE_SOON_DAYS = 7;

/** Regras futuras (não ativas): aviso / bloqueio / suspensão por atraso */
export const BILLING_AUTOMATION_RULES = {
  noticeDaysBefore: 3,
  noticeOnDueDay: true,
  alertDaysAfter: 5,
  blockDaysAfter: 10,
  suspendDaysAfter: 15,
  autoBlockEnabled: false,
  autoSuspendEnabled: false,
} as const;

export function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Dia do mês válido (trata fev/31 → último dia do mês) */
export function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(1, day), last);
}

/**
 * Próximo vencimento a partir de `billingDueDay` e data de referência.
 * Se o dia do mês ainda não passou (ou é hoje e includeToday), usa o mês atual; senão o próximo.
 */
export function computeNextDueDate(
  billingDueDay: number,
  from: Date = new Date(),
  opts?: { afterPayment?: boolean }
): Date {
  const day = Math.min(31, Math.max(1, Math.floor(billingDueDay)));
  const base = startOfUtcDay(from);
  let y = base.getUTCFullYear();
  let m = base.getUTCMonth();

  if (opts?.afterPayment) {
    // Após pagamento do período atual: avança para o mês seguinte
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  } else {
    const candidateDay = clampDayOfMonth(y, m, day);
    const candidate = new Date(Date.UTC(y, m, candidateDay));
    if (candidate < base) {
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  const d = clampDayOfMonth(y, m, day);
  return new Date(Date.UTC(y, m, d));
}

/** Diferença em dias civis (UTC). Positivo = atraso. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type BillingInput = {
  tenantStatus: string;
  billingStatus?: string | null;
  billingDueDay?: number | null;
  currentPeriodEnd?: Date | string | null;
  trialEndsAt?: Date | string | null;
  now?: Date;
};

export type BillingSnapshot = {
  financialStatus: FinancialStatusCode;
  financialStatusLabel: string;
  billingDueDay: number | null;
  nextDueAt: string | null;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  needsAttention: boolean;
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeBillingSnapshot(input: BillingInput): BillingSnapshot {
  const now = input.now || new Date();
  const tenantStatus = input.tenantStatus || "ACTIVE";
  const billingStatus = (input.billingStatus || "").toUpperCase();
  const billingDueDay =
    input.billingDueDay != null && Number.isFinite(Number(input.billingDueDay))
      ? Math.min(31, Math.max(1, Math.floor(Number(input.billingDueDay))))
      : null;

  let nextDue = toDate(input.currentPeriodEnd);
  if (!nextDue && billingDueDay) {
    nextDue = computeNextDueDate(billingDueDay, now);
  }

  const empty = (code: FinancialStatusCode, attention = false): BillingSnapshot => ({
    financialStatus: code,
    financialStatusLabel: FINANCIAL_STATUS_LABEL[code],
    billingDueDay,
    nextDueAt: nextDue ? nextDue.toISOString() : null,
    daysOverdue: null,
    daysUntilDue: null,
    needsAttention: attention,
  });

  if (
    tenantStatus === "CANCELLED" ||
    tenantStatus === "PENDING_DELETION" ||
    billingStatus === "CANCELLED"
  ) {
    return empty("CANCELLED", tenantStatus === "PENDING_DELETION");
  }

  if (tenantStatus === "SUSPENDED" || billingStatus === "SUSPENDED") {
    return empty("SUSPENDED", true);
  }

  if (tenantStatus === "TRIAL" || billingStatus === "TRIAL") {
    const trialEnd = toDate(input.trialEndsAt);
    const daysUntilDue =
      trialEnd != null ? calendarDaysBetween(now, trialEnd) : null;
    return {
      financialStatus: "TRIAL",
      financialStatusLabel: FINANCIAL_STATUS_LABEL.TRIAL,
      billingDueDay,
      nextDueAt: (trialEnd || nextDue)?.toISOString() ?? null,
      daysOverdue: null,
      daysUntilDue,
      needsAttention: daysUntilDue != null && daysUntilDue <= 3,
    };
  }

  if (!nextDue) {
    if (billingStatus === "PAST_DUE") {
      return empty("PAYMENT_PENDING", true);
    }
    return empty("UNKNOWN", false);
  }

  const daysUntilDue = calendarDaysBetween(now, nextDue);

  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return {
      financialStatus: "OVERDUE",
      financialStatusLabel: FINANCIAL_STATUS_LABEL.OVERDUE,
      billingDueDay,
      nextDueAt: nextDue.toISOString(),
      daysOverdue,
      daysUntilDue,
      needsAttention: true,
    };
  }

  if (daysUntilDue === 0) {
    return {
      financialStatus: "DUE_TODAY",
      financialStatusLabel: FINANCIAL_STATUS_LABEL.DUE_TODAY,
      billingDueDay,
      nextDueAt: nextDue.toISOString(),
      daysOverdue: null,
      daysUntilDue: 0,
      needsAttention: true,
    };
  }

  if (daysUntilDue <= DUE_SOON_DAYS) {
    return {
      financialStatus: "DUE_SOON",
      financialStatusLabel: FINANCIAL_STATUS_LABEL.DUE_SOON,
      billingDueDay,
      nextDueAt: nextDue.toISOString(),
      daysOverdue: null,
      daysUntilDue,
      needsAttention: true,
    };
  }

  if (billingStatus === "PAST_DUE") {
    return {
      financialStatus: "PAYMENT_PENDING",
      financialStatusLabel: FINANCIAL_STATUS_LABEL.PAYMENT_PENDING,
      billingDueDay,
      nextDueAt: nextDue.toISOString(),
      daysOverdue: null,
      daysUntilDue,
      needsAttention: true,
    };
  }

  return {
    financialStatus: "IN_GOOD_STANDING",
    financialStatusLabel: FINANCIAL_STATUS_LABEL.IN_GOOD_STANDING,
    billingDueDay,
    nextDueAt: nextDue.toISOString(),
    daysOverdue: null,
    daysUntilDue,
    needsAttention: false,
  };
}

export function formatDueDayLabel(day: number | null | undefined): string | null {
  if (day == null || !Number.isFinite(Number(day))) return null;
  const d = Math.floor(Number(day));
  return `Todo dia ${d}`;
}

export function formatDaysOverdueLabel(days: number | null | undefined): string | null {
  if (days == null || days <= 0) return null;
  return days === 1 ? "1 dia em atraso" : `${days} dias em atraso`;
}

/** Avança currentPeriodEnd após pagamento do período. */
export function advancePeriodAfterPayment(params: {
  billingDueDay?: number | null;
  currentPeriodEnd?: Date | string | null;
  paidAt?: Date;
}): Date {
  const paidAt = params.paidAt || new Date();
  const dueDay =
    params.billingDueDay != null
      ? Math.min(31, Math.max(1, Math.floor(Number(params.billingDueDay))))
      : null;

  if (dueDay) {
    // Se havia vencimento no passado/hoje, próximo ciclo a partir do dia pago
    return computeNextDueDate(dueDay, paidAt, { afterPayment: true });
  }

  const current = toDate(params.currentPeriodEnd);
  if (current) {
    const y = current.getUTCFullYear();
    const m = current.getUTCMonth() + 1;
    const d = current.getUTCDate();
    const ny = m > 11 ? y + 1 : y;
    const nm = m > 11 ? 0 : m;
    return new Date(Date.UTC(ny, nm, clampDayOfMonth(ny, nm, d)));
  }

  // Fallback: +30 dias
  const base = startOfUtcDay(paidAt);
  return new Date(base.getTime() + 30 * 86_400_000);
}
