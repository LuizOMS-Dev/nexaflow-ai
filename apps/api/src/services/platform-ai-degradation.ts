/**
 * Política padrão da plataforma (todos os agentes / empresas):
 * quando a IA do provedor ou os créditos do tenant estão no limite,
 * envia mensagem padrão de instabilidade, passa para humano e notifica o painel.
 * Não é configuração de menu — comportamento global.
 */
import { getAiCreditsUsedThisMonth, getTenantLimits } from "./entitlements";

/** Limiar: créditos restantes ≤ este valor → após responder (ou sem responder), handoff */
export const AI_CREDITS_HANDOFF_REMAINING = 2;
/** Ou quando uso ≥ 95% da cota mensal */
export const AI_CREDITS_HANDOFF_RATIO = 0.95;

export type AiDegradationReason =
  | "provider_rate_limit"
  | "tenant_credits_exhausted"
  | "tenant_credits_near_limit"
  | "provider_error";

export function isProviderRateLimitError(msg: string, code?: string | null): boolean {
  if (code === "PROVIDER_RATE_LIMIT") return true;
  const m = msg || "";
  return (
    /\b429\b/.test(m) ||
    /rate[_ ]?limit/i.test(m) ||
    /PROVIDER_RATE_LIMIT/i.test(m) ||
    /limite do provedor/i.test(m) ||
    /tokens per (day|minute)/i.test(m) ||
    /\bTPD\b|\bTPM\b/i.test(m) ||
    /quota/i.test(m) ||
    /too many requests/i.test(m) ||
    /request too large/i.test(m)
  );
}

/**
 * Mensagem ao cliente quando a IA falhou (rate limit / erro transitório).
 * NÃO promete humano e NÃO coloca na fila "Assumir" — fila só com pedido real.
 */
export function buildInstabilityClientMessage(params: {
  agentName: string;
  contactFirstName?: string | null;
  isFirst?: boolean;
  /** Se true, avisa que humano vai assumir (só use quando de fato entrou na fila) */
  promiseHuman?: boolean;
}): string {
  const agentName = (params.agentName || "Atendente").trim() || "Atendente";
  const first = (params.contactFirstName || "").trim();
  const hi = first ? `Oi, ${first}!` : "Oi!";
  if (params.promiseHuman) {
    if (params.isFirst) {
      return `${hi} Aqui é a ${agentName}. Estou com uma instabilidade temporária no atendimento automático. Já avisei a equipe — um atendente humano vai assumir o chat em breve.`;
    }
    return `${hi} Recebi sua mensagem. Estou com uma instabilidade temporária pra responder com detalhes agora. Já avisei a equipe — um atendente humano vai assumir o chat em breve.`;
  }
  // Soft: sem promessa de humano (rate limit / erro — IA tenta de novo em breve)
  if (params.isFirst) {
    return `${hi} Aqui é a ${agentName}. Tive um engasgo momentâneo aqui 😅 Me manda de novo em alguns segundos que eu te atendo.`;
  }
  return `${hi} Recebi sua mensagem, mas travei um instante aqui. Pode repetir em alguns segundos? Já volto com você.`;
}

export async function getTenantAiCreditPressure(tenantId: string): Promise<{
  used: number;
  cap: number;
  remaining: number;
  exhausted: boolean;
  nearLimit: boolean;
}> {
  const limits = await getTenantLimits(tenantId);
  const used = await getAiCreditsUsedThisMonth(tenantId);
  const cap = Math.max(0, limits.monthlyAiCredits + limits.extraAiCredits);
  const remaining = Math.max(0, cap - used);
  const exhausted = remaining < 1;
  const nearLimit =
    !exhausted &&
    (remaining <= AI_CREDITS_HANDOFF_REMAINING ||
      (cap > 0 && used / cap >= AI_CREDITS_HANDOFF_RATIO));
  return { used, cap, remaining, exhausted, nearLimit };
}

/**
 * Handoff por degradação de plataforma.
 * - Créditos esgotados → fila "Assumir" (operacional).
 * - Rate limit / erro transitório → NÃO entra na fila (só cooldown da IA).
 * Não envia WhatsApp — o caller envia a mensagem ao cliente antes/depois.
 */
export async function platformAiHandoffToHuman(params: {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  agentName?: string | null;
  reason: AiDegradationReason;
  contactName?: string | null;
}): Promise<void> {
  // Rate limit / erro do provedor: NÃO poluir a fila "Assumir chat"
  if (
    params.reason === "provider_rate_limit" ||
    params.reason === "provider_error"
  ) {
    console.warn(
      `[handoff] skip queue reason=${params.reason} conv=${params.conversationId} (só instabilidade, sem Assumir)`
    );
    return;
  }

  const reasonLabel =
    params.reason === "tenant_credits_exhausted"
      ? "Créditos de IA esgotados"
      : params.reason === "tenant_credits_near_limit"
        ? "Créditos de IA quase esgotados"
        : "Instabilidade da IA";

  const { handoffToHumanQueue } = await import("./human-handoff");
  await handoffToHumanQueue({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    agentId: params.agentId,
    agentName: params.agentName,
    contactName: params.contactName,
    reason: params.reason,
    reasonLabel,
    source: "platform_degradation",
    destination: "queue",
    dedupeMinutes: 10,
    /** créditos = precisa humano; demais degradações não exigem Assumir */
    requiresAssume: params.reason === "tenant_credits_exhausted",
  });
}
