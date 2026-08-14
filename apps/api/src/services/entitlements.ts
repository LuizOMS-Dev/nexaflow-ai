import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

/** Fonte única de limites do plano (backend = verdade) */
export type PlanLimits = {
  maxUsers: number;
  maxChannels: number;
  maxContacts: number;
  maxConversations: number;
  /** Créditos de IA / mês (alias maxAiMessages no Plan) */
  maxAiMessages: number;
  monthlyAiCredits: number;
  maxAgents: number;
  maxActiveFlows: number;
  extraAiCredits: number;
  features: PlanFeatureFlags;
  planSlug?: string | null;
  planName?: string | null;
  priceMonthly?: number;
  priceOnRequest?: boolean;
};

export type PlanFeatureFlags = {
  campaignsEnabled: boolean;
  advancedAutomationEnabled: boolean;
  advancedReportsEnabled: boolean;
  teamReportsEnabled: boolean;
  aiReportsEnabled: boolean;
  advancedPermissionsEnabled: boolean;
  prioritySupportEnabled: boolean;
  crm: boolean;
  inbox: boolean;
  ai: boolean;
  automations: boolean;
  campaigns: boolean;
  api: boolean;
  reports: boolean;
  whiteLabel: boolean;
  raw: Record<string, unknown>;
};

export const UNLIMITED = 999_999;

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

export function parseFeatureFlags(features: unknown, defaults?: Partial<PlanFeatureFlags>): PlanFeatureFlags {
  const f = (features && typeof features === "object" ? features : {}) as Record<string, unknown>;
  return {
    campaignsEnabled: bool(f.campaignsEnabled ?? f.campaigns, defaults?.campaignsEnabled ?? false),
    advancedAutomationEnabled: bool(
      f.advancedAutomationEnabled ?? f.automations,
      defaults?.advancedAutomationEnabled ?? false
    ),
    advancedReportsEnabled: bool(f.advancedReportsEnabled ?? f.reports, defaults?.advancedReportsEnabled ?? false),
    teamReportsEnabled: bool(f.teamReportsEnabled, defaults?.teamReportsEnabled ?? false),
    aiReportsEnabled: bool(f.aiReportsEnabled, defaults?.aiReportsEnabled ?? false),
    advancedPermissionsEnabled: bool(
      f.advancedPermissionsEnabled,
      defaults?.advancedPermissionsEnabled ?? false
    ),
    prioritySupportEnabled: bool(f.prioritySupportEnabled, defaults?.prioritySupportEnabled ?? false),
    crm: bool(f.crm, true),
    inbox: bool(f.inbox, true),
    ai: bool(f.ai, true),
    automations: bool(f.automations, defaults?.automations ?? false),
    campaigns: bool(f.campaigns, defaults?.campaigns ?? false),
    api: bool(f.api, false),
    reports: bool(f.reports, defaults?.reports ?? false),
    whiteLabel: bool(f.whiteLabel, false),
    raw: f,
  };
}

export async function getTenantLimits(tenantId: string): Promise<PlanLimits> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const plan = tenant?.plan;
  const flags = parseFeatureFlags(plan?.features);
  const monthlyAi = num(flags.raw.monthlyAiCredits, plan?.maxAiMessages ?? 1000);
  const maxAgents = num(flags.raw.maxAgents, 1);
  const maxActiveFlows = num(flags.raw.maxActiveFlows ?? flags.raw.maxAutomations, 5);

  return {
    maxUsers: plan?.maxUsers ?? 2,
    maxChannels: plan?.maxChannels ?? 1,
    maxContacts: plan?.maxContacts ?? 2000,
    maxConversations: plan?.maxConversations ?? 10_000,
    maxAiMessages: monthlyAi,
    monthlyAiCredits: monthlyAi,
    maxAgents,
    maxActiveFlows,
    extraAiCredits: sub?.extraAiCredits ?? 0,
    features: flags,
    planSlug: plan?.slug,
    planName: plan?.name,
    priceMonthly: plan ? Number(plan.priceMonthly) : undefined,
    priceOnRequest: plan?.priceOnRequest ?? false,
  };
}

export async function assertCanAddUser(tenantId: string) {
  const limits = await getTenantLimits(tenantId);
  const count = await prisma.membership.count({
    where: { tenantId, isActive: true },
  });
  if (count >= limits.maxUsers) {
    throw new AppError(
      `Seu plano permite até ${limits.maxUsers} usuário${limits.maxUsers === 1 ? "" : "s"}.`,
      403,
      "PLAN_LIMIT_USERS"
    );
  }
}

export async function assertCanAddContact(tenantId: string) {
  const limits = await getTenantLimits(tenantId);
  const count = await prisma.contact.count({ where: { tenantId } });
  if (count >= limits.maxContacts) {
    throw new AppError(
      `Seu plano permite até ${limits.maxContacts.toLocaleString("pt-BR")} contatos.`,
      403,
      "PLAN_LIMIT_CONTACTS"
    );
  }
}

/**
 * Conta slots de WhatsApp em uso.
 * - Só canais type=WHATSAPP (WEBCHAT etc. não contam)
 * - Só isActive=true (desconectado/inativo libera o slot para reconectar)
 */
export async function countActiveWhatsAppChannels(tenantId: string): Promise<number> {
  return prisma.channel.count({
    where: { tenantId, type: "WHATSAPP", isActive: true },
  });
}

export async function assertCanAddChannel(tenantId: string) {
  const limits = await getTenantLimits(tenantId);
  const count = await countActiveWhatsAppChannels(tenantId);
  if (count >= limits.maxChannels) {
    throw new AppError(
      `Seu plano permite até ${limits.maxChannels} conexão${limits.maxChannels === 1 ? "" : "ões"} WhatsApp ativas. Desconecte uma para liberar, ou faça upgrade.`,
      403,
      "PLAN_LIMIT_CHANNELS"
    );
  }
}

export async function assertCanAddAgent(tenantId: string) {
  const limits = await getTenantLimits(tenantId);
  const count = await prisma.aiAgent.count({ where: { tenantId } });
  if (count >= limits.maxAgents) {
    throw new AppError(
      `Seu plano permite até ${limits.maxAgents} agente${limits.maxAgents === 1 ? "" : "s"} de IA.`,
      403,
      "PLAN_LIMIT_AGENTS"
    );
  }
}

/** Impede ativar fluxo além do limite de fluxos ativos */
export async function assertCanActivateAutomation(tenantId: string, automationId?: string) {
  const limits = await getTenantLimits(tenantId);
  const active = await prisma.automation.count({
    where: {
      tenantId,
      status: "ACTIVE",
      ...(automationId ? { id: { not: automationId } } : {}),
    },
  });
  if (active >= limits.maxActiveFlows) {
    throw new AppError(
      `Seu plano permite até ${limits.maxActiveFlows} fluxo${limits.maxActiveFlows === 1 ? "" : "s"} ativo${limits.maxActiveFlows === 1 ? "" : "s"}.`,
      403,
      "PLAN_LIMIT_ACTIVE_FLOWS"
    );
  }
}

export async function assertFeatureEnabled(
  tenantId: string,
  feature: keyof PlanFeatureFlags,
  message: string
) {
  const limits = await getTenantLimits(tenantId);
  if (!limits.features[feature]) {
    throw new AppError(message, 403, "PLAN_FEATURE_DISABLED");
  }
}

function monthRange(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

export async function getAiCreditsUsedThisMonth(tenantId: string): Promise<number> {
  const { start, end } = monthRange();
  const agg = await prisma.aiUsageLog.aggregate({
    where: { tenantId, createdAt: { gte: start, lt: end } },
    _sum: { credits: true },
  });
  return agg._sum.credits ?? 0;
}

export async function assertAiCreditsAvailable(tenantId: string, need = 1) {
  const limits = await getTenantLimits(tenantId);
  const used = await getAiCreditsUsedThisMonth(tenantId);
  const cap = limits.monthlyAiCredits + limits.extraAiCredits;
  if (used + need > cap) {
    throw new AppError(
      `Créditos de IA do mês esgotados (${used.toLocaleString("pt-BR")} de ${cap.toLocaleString("pt-BR")}). O atendimento humano continua disponível.`,
      403,
      "PLAN_LIMIT_AI_CREDITS"
    );
  }
  return { used, cap, remaining: Math.max(0, cap - used) };
}

export async function recordAiUsage(params: {
  tenantId: string;
  agentId?: string | null;
  provider?: string | null;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  credits?: number;
  purpose?: string;
}) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        tenantId: params.tenantId,
        agentId: params.agentId || null,
        provider: params.provider || null,
        model: params.model || null,
        tokensIn: params.tokensIn ?? 0,
        tokensOut: params.tokensOut ?? 0,
        credits: params.credits ?? 1,
        purpose: params.purpose || null,
      },
    });
  } catch (err) {
    console.error("[ai-usage]", err instanceof Error ? err.message : err);
  }
}

export async function getUsageSnapshot(tenantId: string) {
  const limits = await getTenantLimits(tenantId);
  const [
    users,
    contacts,
    channels,
    agents,
    conversations,
    automations,
    activeFlows,
    aiUsed,
    tenant,
    sub,
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId, isActive: true } }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.channel.count({ where: { tenantId, type: "WHATSAPP", isActive: true } }),
    prisma.aiAgent.count({ where: { tenantId } }),
    prisma.conversation.count({ where: { tenantId } }),
    prisma.automation.count({ where: { tenantId } }),
    prisma.automation.count({ where: { tenantId, status: "ACTIVE" } }),
    getAiCreditsUsedThisMonth(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    }),
    prisma.subscription.findUnique({ where: { tenantId } }),
  ]);

  const aiCap = limits.monthlyAiCredits + limits.extraAiCredits;
  const contracted =
    sub?.priceMonthly != null ? Number(sub.priceMonthly) : limits.priceMonthly;

  return {
    plan: tenant?.plan
      ? {
          id: tenant.plan.id,
          name: tenant.plan.name,
          slug: tenant.plan.slug,
          priceMonthly: Number(tenant.plan.priceMonthly),
          priceAnnual: tenant.plan.priceAnnual != null ? Number(tenant.plan.priceAnnual) : null,
          priceOnRequest: tenant.plan.priceOnRequest,
          badge: tenant.plan.badge,
        }
      : null,
    subscription: sub
      ? {
          billingStatus: sub.billingStatus,
          billingCycle: sub.billingCycle,
          priceMonthly: sub.priceMonthly != null ? Number(sub.priceMonthly) : contracted,
          priceAnnual: sub.priceAnnual != null ? Number(sub.priceAnnual) : null,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          extraAiCredits: sub.extraAiCredits,
        }
      : null,
    limits: {
      maxUsers: limits.maxUsers,
      maxChannels: limits.maxChannels,
      maxContacts: limits.maxContacts,
      maxConversations: limits.maxConversations,
      maxAgents: limits.maxAgents,
      maxActiveFlows: limits.maxActiveFlows,
      maxAutomations: limits.maxActiveFlows,
      maxAiMessages: limits.monthlyAiCredits,
      monthlyAiCredits: limits.monthlyAiCredits,
      extraAiCredits: limits.extraAiCredits,
      features: limits.features,
    },
    usage: {
      users,
      contacts,
      channels,
      agents,
      conversations,
      automations,
      activeFlows,
      aiCredits: aiUsed,
      aiCreditsUsed: aiUsed,
      aiCreditsCap: aiCap,
    },
  };
}

/**
 * Garante Subscription com preço contratado ao vincular plano ao tenant.
 * Não sobrescreve preço contratado existente (preserva fundador).
 */
export async function ensureTenantSubscription(params: {
  tenantId: string;
  planId: string;
  billingStatus?: string;
  billingCycle?: "MONTHLY" | "ANNUAL";
  /** se true, força atualizar priceMonthly do catálogo (upgrade explícito) */
  updateContractedPrice?: boolean;
}) {
  const plan = await prisma.plan.findUnique({ where: { id: params.planId } });
  if (!plan) return null;

  const existing = await prisma.subscription.findUnique({ where: { tenantId: params.tenantId } });
  const catalogMonthly = Number(plan.priceMonthly || 0);
  const catalogAnnual =
    plan.priceAnnual != null ? Number(plan.priceAnnual) : Math.round(catalogMonthly * 12 * 0.85 * 100) / 100;

  if (!existing) {
    // Default: dia 10 + próximo vencimento calculado (cobrança manual)
    const { computeNextDueDate } = await import("./billing");
    const billingDueDay = 10;
    return prisma.subscription.create({
      data: {
        tenantId: params.tenantId,
        planId: plan.id,
        billingStatus: params.billingStatus || "ACTIVE",
        billingCycle: params.billingCycle || "MONTHLY",
        priceMonthly: catalogMonthly,
        priceAnnual: catalogAnnual,
        billingDueDay,
        currentPeriodEnd: computeNextDueDate(billingDueDay),
      },
    });
  }

  return prisma.subscription.update({
    where: { tenantId: params.tenantId },
    data: {
      planId: plan.id,
      ...(params.billingStatus ? { billingStatus: params.billingStatus } : {}),
      ...(params.billingCycle ? { billingCycle: params.billingCycle } : {}),
      ...(params.updateContractedPrice || existing.priceMonthly == null
        ? { priceMonthly: catalogMonthly, priceAnnual: catalogAnnual }
        : {}),
    },
  });
}

