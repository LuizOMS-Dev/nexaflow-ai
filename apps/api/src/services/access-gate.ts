/**
 * ACCESS GATE — fonte única de decisão de acesso NexaFlow.
 *
 * Camadas (precedência):
 * 1) Usuário BLOCKED / SUSPENDED / DISABLED
 * 2) Empresa BLOCKED / PENDING_DELETION
 * 3) Empresa SUSPENDED / CANCELLED (restrito)
 * 4) Financeiro: SUSPENDED_FOR_NONPAYMENT → restrito
 * 5) Financeiro: GRACE / OVERDUE → acesso + aviso
 * 6) Regular → FULL
 *
 * Impersonation: Superadmin pode entrar em empresa restrita/bloqueada para suporte,
 * sem reativar operações externas (operationalPaused).
 */
import type { MemberRole, PlatformRole, TenantStatus, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  calendarDaysBetween,
  computeBillingSnapshot,
  type BillingSnapshot,
} from "./billing";

// ─── Tipos públicos ───────────────────────────────────────────

export type FinancialAccessCode =
  | "CURRENT"
  | "OVERDUE"
  | "GRACE_PERIOD"
  | "SUSPENDED_FOR_NONPAYMENT"
  | "CANCELED"
  | "TRIAL"
  | "UNKNOWN";

export type AccessCode =
  | "FULL_ACCESS"
  | "PAYMENT_GRACE"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_SUSPENDED"
  | "USER_BLOCKED"
  | "USER_SUSPENDED"
  | "USER_DISABLED"
  | "COMPANY_BLOCKED"
  | "COMPANY_SUSPENDED"
  | "COMPANY_CANCELLED"
  | "COMPANY_PENDING_DELETION"
  | "MEMBERSHIP_INACTIVE";

export type AccessLevel = "FULL" | "WARNING" | "RESTRICTED" | "BLOCKED";

export type AccessCapabilities = {
  /** Pode carregar painel e mutações normais */
  canUseApp: boolean;
  /** Pode mutar dados operacionais (CRM, envios, etc.) */
  canMutate: boolean;
  /** Ver/cobrança e plano (admin da empresa) */
  canAccessBilling: boolean;
  /** API pública / API keys */
  canUsePublicApi: boolean;
  /** Webhooks outbound */
  canDispatchWebhooks: boolean;
  /** Automações / fluxos */
  canRunAutomations: boolean;
  /** Campanhas */
  canRunCampaigns: boolean;
  /** IA automática / agents AUTO */
  canRunAiAuto: boolean;
  /** Envio WhatsApp operacional (humano pode continuar se canMutate) */
  canSendWhatsAppAuto: boolean;
};

export type AccessGateDecision = {
  level: AccessLevel;
  code: AccessCode;
  title: string;
  message: string;
  userStatus: UserStatus | string;
  companyStatus: TenantStatus | string | null;
  financialStatus: FinancialAccessCode;
  financialLabel: string;
  billing: BillingSnapshot | null;
  capabilities: AccessCapabilities;
  /** Operações automáticas pausadas (bloqueio/suspensão/inadimplência) */
  operationalPaused: boolean;
  impersonating: boolean;
  /** Banner de aviso (grace/overdue) sem bloquear */
  warningBanner: null | {
    kind: "payment_grace" | "payment_overdue";
    title: string;
    body: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  graceDays: number;
  daysOverdue: number | null;
  publicReason: string | null;
};

export type AccessPolicy = {
  graceDays: number;
  autoSuspendNonpayment: boolean;
  companySuspendMode: "LIMITED" | "TOTAL";
  companyBlockMode: "TOTAL";
};

const SETTINGS_KEY = "nexaflow.access.policy";

const DEFAULT_POLICY: AccessPolicy = {
  graceDays: 7,
  autoSuspendNonpayment: true,
  companySuspendMode: "LIMITED",
  companyBlockMode: "TOTAL",
};

/** Rotas permitidas em nível RESTRICTED (prefix match). */
export const RESTRICTED_ALLOW_PREFIXES = [
  "/auth/",
  "/usage",
  "/settings",
  "/notifications",
  "/assistant/",
  "/admin/stop-impersonation",
  "/health",
];

/** Mesmo com BLOCKED (usuário/empresa), estas rotas precisam funcionar para a tela de bloqueio. */
export const BLOCKED_ALLOW_PREFIXES = [
  "/auth/access-state",
  "/auth/me",
  "/auth/logout",
  "/auth/logout-all",
  "/auth/refresh",
  "/admin/stop-impersonation",
];

/** Mutações proibidas mesmo em RESTRICTED (exceto allowlist de auth). */
const RESTRICTED_MUTATION_ALLOW = [
  "/auth/logout",
  "/auth/logout-all",
  "/auth/refresh",
  "/auth/profile",
  "/admin/stop-impersonation",
  "/assistant/",
];

// ─── Policy ───────────────────────────────────────────────────

export async function getAccessPolicy(): Promise<AccessPolicy> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const v = (row?.value || {}) as Partial<AccessPolicy>;
  const grace = Number(v.graceDays);
  return {
    graceDays: Number.isFinite(grace) ? Math.min(90, Math.max(0, Math.floor(grace))) : DEFAULT_POLICY.graceDays,
    autoSuspendNonpayment:
      typeof v.autoSuspendNonpayment === "boolean"
        ? v.autoSuspendNonpayment
        : DEFAULT_POLICY.autoSuspendNonpayment,
    companySuspendMode: v.companySuspendMode === "TOTAL" ? "TOTAL" : "LIMITED",
    companyBlockMode: "TOTAL",
  };
}

export async function setAccessPolicy(patch: Partial<AccessPolicy>): Promise<AccessPolicy> {
  const current = await getAccessPolicy();
  const next: AccessPolicy = {
    ...current,
    ...patch,
    graceDays:
      patch.graceDays != null
        ? Math.min(90, Math.max(0, Math.floor(Number(patch.graceDays))))
        : current.graceDays,
    companyBlockMode: "TOTAL",
  };
  await prisma.platformSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return next;
}

// ─── Financeiro (camada de acesso) ────────────────────────────

export function resolveFinancialAccess(params: {
  tenantStatus: string;
  billingStatus?: string | null;
  currentPeriodEnd?: Date | string | null;
  billingDueDay?: number | null;
  trialEndsAt?: Date | string | null;
  graceDays: number;
  autoSuspendNonpayment: boolean;
  now?: Date;
}): { code: FinancialAccessCode; label: string; snapshot: BillingSnapshot; daysOverdue: number | null } {
  const snapshot = computeBillingSnapshot({
    tenantStatus: params.tenantStatus,
    billingStatus: params.billingStatus,
    currentPeriodEnd: params.currentPeriodEnd,
    billingDueDay: params.billingDueDay,
    trialEndsAt: params.trialEndsAt,
    now: params.now,
  });

  const bs = (params.billingStatus || "").toUpperCase();
  const ts = params.tenantStatus;

  if (ts === "CANCELLED" || ts === "PENDING_DELETION" || bs === "CANCELLED" || bs === "EXPIRED") {
    return {
      code: "CANCELED",
      label: "Cancelada",
      snapshot,
      daysOverdue: snapshot.daysOverdue,
    };
  }

  // Suspensão financeira explícita (não confundir com SUSPENDED operacional da empresa —
  // se billingStatus=SUSPENDED e tenant ACTIVE, é inadimplência)
  if (bs === "SUSPENDED" && ts !== "SUSPENDED") {
    return {
      code: "SUSPENDED_FOR_NONPAYMENT",
      label: "Suspensa por inadimplência",
      snapshot,
      daysOverdue: snapshot.daysOverdue,
    };
  }

  if (snapshot.financialStatus === "TRIAL") {
    return { code: "TRIAL", label: "Trial", snapshot, daysOverdue: null };
  }

  const overdue = snapshot.daysOverdue;
  if (overdue != null && overdue > 0) {
    if (params.autoSuspendNonpayment && overdue > params.graceDays) {
      return {
        code: "SUSPENDED_FOR_NONPAYMENT",
        label: "Suspensa por inadimplência",
        snapshot,
        daysOverdue: overdue,
      };
    }
    if (overdue <= params.graceDays) {
      return {
        code: "GRACE_PERIOD",
        label: "Em período de tolerância",
        snapshot,
        daysOverdue: overdue,
      };
    }
    return {
      code: "OVERDUE",
      label: "Pagamento vencido",
      snapshot,
      daysOverdue: overdue,
    };
  }

  if (snapshot.financialStatus === "PAYMENT_PENDING" || bs === "PAST_DUE") {
    return {
      code: "OVERDUE",
      label: "Pagamento vencido",
      snapshot,
      daysOverdue: snapshot.daysOverdue,
    };
  }

  if (snapshot.financialStatus === "UNKNOWN") {
    return { code: "UNKNOWN", label: "Sem cobrança", snapshot, daysOverdue: null };
  }

  return {
    code: "CURRENT",
    label: "Em dia",
    snapshot,
    daysOverdue: null,
  };
}

// ─── Capabilities ─────────────────────────────────────────────

function fullCaps(): AccessCapabilities {
  return {
    canUseApp: true,
    canMutate: true,
    canAccessBilling: true,
    canUsePublicApi: true,
    canDispatchWebhooks: true,
    canRunAutomations: true,
    canRunCampaigns: true,
    canRunAiAuto: true,
    canSendWhatsAppAuto: true,
  };
}

function blockedCaps(): AccessCapabilities {
  return {
    canUseApp: false,
    canMutate: false,
    canAccessBilling: false,
    canUsePublicApi: false,
    canDispatchWebhooks: false,
    canRunAutomations: false,
    canRunCampaigns: false,
    canRunAiAuto: false,
    canSendWhatsAppAuto: false,
  };
}

function restrictedCaps(canBilling: boolean): AccessCapabilities {
  return {
    canUseApp: true, // shell restrito
    canMutate: false,
    canAccessBilling: canBilling,
    canUsePublicApi: false,
    canDispatchWebhooks: false,
    canRunAutomations: false,
    canRunCampaigns: false,
    canRunAiAuto: false,
    canSendWhatsAppAuto: false,
  };
}

// ─── Core evaluate ────────────────────────────────────────────

export type EvaluateAccessInput = {
  userId: string;
  tenantId?: string | null;
  role?: MemberRole | null;
  platformRole?: PlatformRole | string | null;
  impersonating?: boolean;
  /** Pré-carregado opcional */
  user?: { status: string; isActive: boolean } | null;
  tenant?: {
    status: string;
    settings?: unknown;
  } | null;
  subscription?: {
    billingStatus: string;
    currentPeriodEnd: Date | null;
    billingDueDay: number | null;
    trialEndsAt: Date | null;
  } | null;
  membershipActive?: boolean | null;
};

function publicCompanyReason(settings: unknown): string | null {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  // Motivos públicos opcionais — nunca notas internas longas
  const pub = s.publicBlockMessage || s.publicSuspendMessage;
  if (typeof pub === "string" && pub.trim().length > 0 && pub.trim().length <= 280) {
    return pub.trim();
  }
  return null;
}

export async function evaluateAccessGate(
  input: EvaluateAccessInput
): Promise<AccessGateDecision> {
  const policy = await getAccessPolicy();
  const impersonating = Boolean(input.impersonating);

  const user =
    input.user ||
    (await prisma.user.findUnique({
      where: { id: input.userId },
      select: { status: true, isActive: true },
    }));

  if (!user || !user.isActive) {
    return makeDecision({
      level: "BLOCKED",
      code: "USER_DISABLED",
      title: "Acesso indisponível",
      message: "Sua conta não está ativa. Entre em contato com o administrador da sua empresa.",
      userStatus: user?.status || "DISABLED",
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  // Mapear DISABLED → bloqueio; SUSPENDED → suspensão usuário
  if (user.status === "DISABLED") {
    return makeDecision({
      level: "BLOCKED",
      code: "USER_BLOCKED",
      title: "Acesso bloqueado",
      message:
        "Seu acesso à NexaFlow está bloqueado. Entre em contato com o administrador da sua empresa para mais informações.",
      userStatus: user.status,
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  if (user.status === "SUSPENDED") {
    return makeDecision({
      level: "BLOCKED",
      code: "USER_SUSPENDED",
      title: "Acesso suspenso",
      message:
        "Seu acesso à NexaFlow está temporariamente suspenso. Entre em contato com o administrador da sua empresa.",
      userStatus: user.status,
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  // Sem tenant (superadmin global) — liberado
  if (!input.tenantId) {
    return makeDecision({
      level: "FULL",
      code: "FULL_ACCESS",
      title: "Acesso liberado",
      message: "",
      userStatus: user.status,
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: fullCaps(),
      operationalPaused: false,
      impersonating,
      policy,
    });
  }

  // Membership
  let membershipActive = input.membershipActive;
  if (membershipActive == null && !impersonating) {
    const m = await prisma.membership.findFirst({
      where: { userId: input.userId, tenantId: input.tenantId },
      select: { isActive: true },
    });
    membershipActive = m?.isActive ?? false;
  }
  if (membershipActive === false && !impersonating) {
    return makeDecision({
      level: "BLOCKED",
      code: "MEMBERSHIP_INACTIVE",
      title: "Acesso removido",
      message: "Você não possui mais acesso a esta empresa.",
      userStatus: user.status,
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  const tenant =
    input.tenant ||
    (await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { status: true, settings: true },
    }));

  if (!tenant) {
    return makeDecision({
      level: "BLOCKED",
      code: "COMPANY_BLOCKED",
      title: "Empresa não encontrada",
      message: "Não foi possível carregar a empresa.",
      userStatus: user.status,
      companyStatus: null,
      financial: { code: "UNKNOWN", label: "—", snapshot: null, daysOverdue: null },
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  const sub =
    input.subscription !== undefined
      ? input.subscription
      : await prisma.subscription.findUnique({
          where: { tenantId: input.tenantId },
          select: {
            billingStatus: true,
            currentPeriodEnd: true,
            billingDueDay: true,
            trialEndsAt: true,
          },
        });

  const financial = resolveFinancialAccess({
    tenantStatus: tenant.status,
    billingStatus: sub?.billingStatus,
    currentPeriodEnd: sub?.currentPeriodEnd,
    billingDueDay: sub?.billingDueDay,
    trialEndsAt: sub?.trialEndsAt,
    graceDays: policy.graceDays,
    autoSuspendNonpayment: policy.autoSuspendNonpayment,
  });

  const isAdmin =
    input.role === "ADMIN" ||
    (input.platformRole === "SUPERADMIN" && impersonating);

  const pubReason = publicCompanyReason(tenant.settings);

  // ── Empresa BLOCKED ──
  if (tenant.status === "BLOCKED") {
    if (impersonating) {
      return makeDecision({
        level: "RESTRICTED",
        code: "COMPANY_BLOCKED",
        title: "Empresa bloqueada (modo suporte)",
        message:
          "Você está em impersonação. A empresa está bloqueada — operações automáticas permanecem pausadas.",
        userStatus: user.status,
        companyStatus: tenant.status,
        financial,
        capabilities: restrictedCaps(true),
        operationalPaused: true,
        impersonating,
        policy,
        publicReason: pubReason,
      });
    }
    return makeDecision({
      level: "BLOCKED",
      code: "COMPANY_BLOCKED",
      title: "Acesso bloqueado",
      message:
        "Esta conta está temporariamente indisponível. Entre em contato com o suporte NexaFlow.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
      publicReason: pubReason,
    });
  }

  // ── PENDING_DELETION ──
  if (tenant.status === "PENDING_DELETION") {
    if (impersonating) {
      return makeDecision({
        level: "RESTRICTED",
        code: "COMPANY_PENDING_DELETION",
        title: "Exclusão pendente (modo suporte)",
        message: "Empresa com exclusão pendente. Operações automáticas pausadas.",
        userStatus: user.status,
        companyStatus: tenant.status,
        financial,
        capabilities: restrictedCaps(true),
        operationalPaused: true,
        impersonating,
        policy,
      });
    }
    return makeDecision({
      level: "BLOCKED",
      code: "COMPANY_PENDING_DELETION",
      title: "Conta indisponível",
      message:
        "O acesso desta empresa está indisponível. Entre em contato com o responsável pela conta.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  // ── SUSPENDED operacional ──
  if (tenant.status === "SUSPENDED") {
    if (impersonating || (policy.companySuspendMode === "LIMITED" && isAdmin)) {
      return makeDecision({
        level: "RESTRICTED",
        code: "COMPANY_SUSPENDED",
        title: "Conta da empresa suspensa",
        message:
          "O acesso desta empresa à NexaFlow está temporariamente suspenso. Administradores podem regularizar cobrança e contatar suporte.",
        userStatus: user.status,
        companyStatus: tenant.status,
        financial,
        capabilities: restrictedCaps(true),
        operationalPaused: true,
        impersonating,
        policy,
        publicReason: pubReason,
      });
    }
    return makeDecision({
      level: "BLOCKED",
      code: "COMPANY_SUSPENDED",
      title: "Conta da empresa suspensa",
      message: "O acesso desta empresa à NexaFlow está temporariamente suspenso.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
      publicReason: pubReason,
    });
  }

  // ── CANCELLED ──
  if (tenant.status === "CANCELLED") {
    if (impersonating || isAdmin) {
      return makeDecision({
        level: "RESTRICTED",
        code: "COMPANY_CANCELLED",
        title: "Assinatura cancelada",
        message: "A assinatura desta empresa não está ativa.",
        userStatus: user.status,
        companyStatus: tenant.status,
        financial,
        capabilities: restrictedCaps(true),
        operationalPaused: true,
        impersonating,
        policy,
      });
    }
    return makeDecision({
      level: "BLOCKED",
      code: "COMPANY_CANCELLED",
      title: "Assinatura cancelada",
      message: "A assinatura desta empresa não está ativa.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  // ── Financeiro: inadimplência após tolerância ──
  if (financial.code === "SUSPENDED_FOR_NONPAYMENT") {
    if (impersonating || isAdmin) {
      return makeDecision({
        level: "RESTRICTED",
        code: "PAYMENT_SUSPENDED",
        title: "Assinatura suspensa",
        message:
          "O acesso está temporariamente suspenso devido a uma pendência de pagamento.",
        userStatus: user.status,
        companyStatus: tenant.status,
        financial,
        capabilities: restrictedCaps(true),
        operationalPaused: true,
        impersonating,
        policy,
      });
    }
    return makeDecision({
      level: "BLOCKED",
      code: "PAYMENT_SUSPENDED",
      title: "Assinatura suspensa",
      message:
        "O acesso está temporariamente suspenso devido a uma pendência de pagamento. Peça a um administrador para regularizar.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: blockedCaps(),
      operationalPaused: true,
      impersonating,
      policy,
    });
  }

  // ── Grace / overdue com acesso ──
  if (financial.code === "GRACE_PERIOD") {
    return makeDecision({
      level: "WARNING",
      code: "PAYMENT_GRACE",
      title: "Pagamento pendente",
      message:
        "Identificamos uma pendência no pagamento da sua assinatura. Regularize para evitar a suspensão do acesso.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: fullCaps(),
      operationalPaused: false,
      impersonating,
      policy,
      warningBanner: {
        kind: "payment_grace",
        title: "Pagamento pendente",
        body: "Identificamos uma pendência no pagamento da sua assinatura. Regularize para evitar a suspensão do acesso.",
        ctaLabel: isAdmin ? "Ver cobrança" : undefined,
        ctaHref: isAdmin ? "/app/settings" : undefined,
      },
    });
  }

  if (financial.code === "OVERDUE") {
    return makeDecision({
      level: "WARNING",
      code: "PAYMENT_OVERDUE",
      title: "Pagamento vencido",
      message: "Há uma pendência de pagamento na assinatura.",
      userStatus: user.status,
      companyStatus: tenant.status,
      financial,
      capabilities: fullCaps(),
      operationalPaused: false,
      impersonating,
      policy,
      warningBanner: {
        kind: "payment_overdue",
        title: "Pagamento vencido",
        body: "Há uma pendência de pagamento. Regularize quando possível.",
        ctaLabel: isAdmin ? "Ver cobrança" : undefined,
        ctaHref: isAdmin ? "/app/settings" : undefined,
      },
    });
  }

  return makeDecision({
    level: "FULL",
    code: "FULL_ACCESS",
    title: "Acesso liberado",
    message: "",
    userStatus: user.status,
    companyStatus: tenant.status,
    financial,
    capabilities: fullCaps(),
    operationalPaused: false,
    impersonating,
    policy,
  });
}

function makeDecision(p: {
  level: AccessLevel;
  code: AccessCode;
  title: string;
  message: string;
  userStatus: string;
  companyStatus: string | null;
  financial: {
    code: FinancialAccessCode;
    label: string;
    snapshot: BillingSnapshot | null;
    daysOverdue: number | null;
  };
  capabilities: AccessCapabilities;
  operationalPaused: boolean;
  impersonating: boolean;
  policy: AccessPolicy;
  warningBanner?: AccessGateDecision["warningBanner"];
  publicReason?: string | null;
}): AccessGateDecision {
  return {
    level: p.level,
    code: p.code,
    title: p.title,
    message: p.message,
    userStatus: p.userStatus,
    companyStatus: p.companyStatus,
    financialStatus: p.financial.code,
    financialLabel: p.financial.label,
    billing: p.financial.snapshot,
    capabilities: p.capabilities,
    operationalPaused: p.operationalPaused,
    impersonating: p.impersonating,
    warningBanner: p.warningBanner ?? null,
    graceDays: p.policy.graceDays,
    daysOverdue: p.financial.daysOverdue,
    publicReason: p.publicReason ?? null,
  };
}

// ─── Enforce helpers ──────────────────────────────────────────

export function isPathAllowedWhenRestricted(path: string, method: string): boolean {
  const p = path.split("?")[0] || path;
  const m = method.toUpperCase();
  const allowed = RESTRICTED_ALLOW_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix)
  );
  if (!allowed) return false;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  return RESTRICTED_MUTATION_ALLOW.some(
    (prefix) => p === prefix || p.startsWith(prefix)
  );
}

export function isPathAllowedWhenBlocked(path: string): boolean {
  const p = path.split("?")[0] || path;
  return BLOCKED_ALLOW_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

export function assertAccessAllowsRequest(
  decision: AccessGateDecision,
  opts: { path: string; method: string }
): void {
  if (decision.level === "FULL" || decision.level === "WARNING") return;

  if (decision.level === "BLOCKED") {
    if (isPathAllowedWhenBlocked(opts.path)) return;
    throw new AppError(decision.message || "Acesso negado", 403, decision.code);
  }

  // RESTRICTED
  if (!isPathAllowedWhenRestricted(opts.path, opts.method)) {
    throw new AppError(
      decision.message || "Acesso restrito. Regularize a situação da conta.",
      403,
      decision.code
    );
  }
}

/** Gate operacional para jobs/API keys/webhooks (sem usuário). */
export async function evaluateTenantOperationalGate(tenantId: string): Promise<{
  allowed: boolean;
  code: AccessCode | "FULL_ACCESS";
  operationalPaused: boolean;
  decision: AccessGateDecision;
}> {
  const policy = await getAccessPolicy();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, settings: true },
  });
  if (!tenant) {
    return {
      allowed: false,
      code: "COMPANY_BLOCKED",
      operationalPaused: true,
      decision: await evaluateAccessGate({
        userId: "system",
        tenantId,
        user: { status: "ACTIVE", isActive: true },
        tenant: { status: "BLOCKED" },
        membershipActive: true,
      }),
    };
  }

  // Usuário sintético ACTIVE para avaliar só tenant+finance
  const decision = await evaluateAccessGate({
    userId: "system-ops",
    tenantId,
    role: "ADMIN",
    user: { status: "ACTIVE", isActive: true },
    tenant,
    membershipActive: true,
    impersonating: false,
  });

  const allowed =
    decision.capabilities.canRunAutomations ||
    decision.capabilities.canUsePublicApi ||
    !decision.operationalPaused;

  // Mais preciso: ops automáticas só se não paused
  return {
    allowed: !decision.operationalPaused && decision.level !== "BLOCKED",
    code: decision.code,
    operationalPaused: decision.operationalPaused,
    decision,
  };
}

export async function assertTenantCanRunAutomation(tenantId: string) {
  const g = await evaluateTenantOperationalGate(tenantId);
  if (g.operationalPaused || !g.decision.capabilities.canRunAutomations) {
    throw new AppError(
      "Automações pausadas para esta empresa (acesso restrito ou bloqueado).",
      403,
      g.code
    );
  }
}

export async function assertTenantCanUsePublicApi(tenantId: string) {
  const g = await evaluateTenantOperationalGate(tenantId);
  if (!g.decision.capabilities.canUsePublicApi || g.operationalPaused) {
    throw new AppError(
      "API pública indisponível para esta empresa no momento.",
      403,
      g.code
    );
  }
}

export async function assertTenantCanDispatchWebhooks(tenantId: string) {
  const g = await evaluateTenantOperationalGate(tenantId);
  if (!g.decision.capabilities.canDispatchWebhooks || g.operationalPaused) {
    return false;
  }
  return true;
}

export async function assertTenantCanRunAiAuto(tenantId: string) {
  const g = await evaluateTenantOperationalGate(tenantId);
  if (!g.decision.capabilities.canRunAiAuto || g.operationalPaused) {
    throw new AppError(
      "IA automática pausada para esta empresa.",
      403,
      g.code
    );
  }
}

/**
 * Após pagamento ou mudança de status: alinha billingStatus com atraso/grace
 * e opcionalmente marca PAST_DUE / SUSPENDED financeiro (sem alterar Tenant.status operacional).
 */
export async function recomputeTenantFinancialAccess(tenantId: string): Promise<{
  billingStatus: string | null;
  financialAccess: FinancialAccessCode;
  updated: boolean;
}> {
  const policy = await getAccessPolicy();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!tenant || !sub) {
    return { billingStatus: null, financialAccess: "UNKNOWN", updated: false };
  }

  // Não sobrescrever cancelamentos
  if (["CANCELLED", "EXPIRED"].includes((sub.billingStatus || "").toUpperCase())) {
    return {
      billingStatus: sub.billingStatus,
      financialAccess: "CANCELED",
      updated: false,
    };
  }

  const fin = resolveFinancialAccess({
    tenantStatus: tenant.status,
    billingStatus: sub.billingStatus,
    currentPeriodEnd: sub.currentPeriodEnd,
    billingDueDay: sub.billingDueDay,
    trialEndsAt: sub.trialEndsAt,
    graceDays: policy.graceDays,
    autoSuspendNonpayment: policy.autoSuspendNonpayment,
  });

  let nextBilling = sub.billingStatus;
  let updated = false;

  if (fin.code === "SUSPENDED_FOR_NONPAYMENT" && tenant.status === "ACTIVE") {
    if (sub.billingStatus !== "SUSPENDED") {
      nextBilling = "SUSPENDED";
      updated = true;
    }
  } else if (fin.code === "GRACE_PERIOD" || fin.code === "OVERDUE") {
    if (!["PAST_DUE", "SUSPENDED"].includes(sub.billingStatus)) {
      nextBilling = "PAST_DUE";
      updated = true;
    }
  } else if (fin.code === "CURRENT" || fin.code === "TRIAL") {
    if (sub.billingStatus === "PAST_DUE" || sub.billingStatus === "SUSPENDED") {
      // Só reativa financeiro se não houver atraso real
      if (fin.code === "CURRENT" || fin.code === "TRIAL") {
        nextBilling = fin.code === "TRIAL" ? "TRIAL" : "ACTIVE";
        updated = true;
      }
    }
  }

  if (updated) {
    await prisma.subscription.update({
      where: { tenantId },
      data: { billingStatus: nextBilling },
    });
  }

  return { billingStatus: nextBilling, financialAccess: fin.code, updated };
}

/** Serialização segura para o frontend (sem notes internas). */
export function toPublicAccessState(d: AccessGateDecision) {
  return {
    level: d.level,
    code: d.code,
    title: d.title,
    message: d.message,
    userStatus: d.userStatus,
    companyStatus: d.companyStatus,
    financialStatus: d.financialStatus,
    financialLabel: d.financialLabel,
    capabilities: d.capabilities,
    operationalPaused: d.operationalPaused,
    impersonating: d.impersonating,
    warningBanner: d.warningBanner,
    graceDays: d.graceDays,
    daysOverdue: d.daysOverdue,
    publicReason: d.publicReason,
    nextDueAt: d.billing?.nextDueAt ?? null,
  };
}

// re-export for tests
export { calendarDaysBetween };
