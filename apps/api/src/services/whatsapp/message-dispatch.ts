/**
 * Camada central de envio WhatsApp.
 * IA, campanhas, automação e inbox devem preferir dispatchWhatsAppText
 * em vez de chamar o socket diretamente.
 *
 * Controles: idempotência, rate limit, consentimento (proativo).
 * NÃO implementa anti-ban / spoofing.
 */
import { prisma } from "../../lib/prisma";

export type DispatchPurpose =
  | "reply"
  | "notice"
  | "ai"
  | "automation"
  | "campaign"
  | "api";

export type DispatchParams = {
  channelId: string;
  to: string;
  text: string;
  /** Chave estável para retries — evita envio duplo */
  idempotencyKey?: string;
  purpose?: DispatchPurpose;
  contactId?: string;
  tenantId?: string;
  /** Pular check de opt-in (só reply/notice iniciados pelo cliente) */
  skipConsentCheck?: boolean;
};

export type DispatchResult = {
  ok: boolean;
  externalId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
  attempt?: number;
};

const IDEMPOTENCY_TTL_MS = 15 * 60_000;
const idempotencyCache = new Map<string, { at: number; result: DispatchResult }>();

// Rate limits leves (proteção operacional — não “máximo até ban”)
const channelWindow = new Map<string, number[]>();
const recipientWindow = new Map<string, number[]>();

const MAX_PER_CHANNEL_PER_MIN = Number(process.env.WA_MAX_SEND_PER_CHANNEL_MIN || 60);
const MAX_PER_RECIPIENT_PER_MIN = Number(process.env.WA_MAX_SEND_PER_RECIPIENT_MIN || 8);

function prune(timestamps: number[], windowMs: number) {
  const cut = Date.now() - windowMs;
  return timestamps.filter((t) => t > cut);
}

function allowRate(key: string, map: Map<string, number[]>, max: number): boolean {
  const next = prune(map.get(key) || [], 60_000);
  if (next.length >= max) {
    map.set(key, next);
    return false;
  }
  next.push(Date.now());
  map.set(key, next);
  return true;
}

function cleanIdempotency() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (now - v.at > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  }
}

/**
 * Envia texto via camada controlada.
 */
export async function dispatchWhatsAppText(params: DispatchParams): Promise<DispatchResult> {
  const purpose = params.purpose || "reply";
  const text = (params.text || "").trim();
  if (!text) return { ok: false, error: "Mensagem vazia" };
  if (text.length > 4096) return { ok: false, error: "Mensagem excede limite" };

  if (params.idempotencyKey) {
    cleanIdempotency();
    const hit = idempotencyCache.get(params.idempotencyKey);
    if (hit) return { ...hit.result, skipped: true, reason: "idempotent" };
  }

  if (!allowRate(params.channelId, channelWindow, MAX_PER_CHANNEL_PER_MIN)) {
    return {
      ok: false,
      error: "Limite de envio do canal atingido. Aguarde e tente novamente.",
      reason: "rate_channel",
    };
  }
  const recipKey = `${params.channelId}:${params.to.replace(/\D/g, "")}`;
  if (!allowRate(recipKey, recipientWindow, MAX_PER_RECIPIENT_PER_MIN)) {
    return {
      ok: false,
      error: "Limite de mensagens para este destinatário. Evite spam.",
      reason: "rate_recipient",
    };
  }

  // Opt-in: campanhas e automações proativas exigem consentWhatsapp
  const proactive = purpose === "campaign" || purpose === "automation";
  if (proactive && !params.skipConsentCheck) {
    let contact = null as { consentWhatsapp: boolean; id: string } | null;
    if (params.contactId) {
      contact = await prisma.contact.findUnique({
        where: { id: params.contactId },
        select: { id: true, consentWhatsapp: true },
      });
    } else if (params.tenantId) {
      const digits = params.to.replace(/\D/g, "");
      contact = await prisma.contact.findFirst({
        where: {
          tenantId: params.tenantId,
          OR: [{ phone: params.to }, { phone: { contains: digits.slice(-11) } }],
        },
        select: { id: true, consentWhatsapp: true },
      });
    }
    if (contact && !contact.consentWhatsapp) {
      return {
        ok: false,
        skipped: true,
        error: "Contato sem consentimento WhatsApp (opt-in).",
        reason: "no_consent",
      };
    }
  }

  // import dinâmico evita ciclo com index.ts
  const { sendWhatsAppText } = await import("./index");
  const result = await sendWhatsAppText(params.channelId, params.to, text);
  const out: DispatchResult = {
    ok: result.ok,
    externalId: result.externalId,
    error: result.error,
    attempt: 1,
  };

  if (params.idempotencyKey && out.ok) {
    idempotencyCache.set(params.idempotencyKey, { at: Date.now(), result: out });
  }

  return out;
}

/** Métricas leves da fila/limites (observabilidade) */
export function getDispatchMetrics() {
  return {
    idempotencyCacheSize: idempotencyCache.size,
    channelWindows: channelWindow.size,
    recipientWindows: recipientWindow.size,
    limits: {
      maxPerChannelPerMin: MAX_PER_CHANNEL_PER_MIN,
      maxPerRecipientPerMin: MAX_PER_RECIPIENT_PER_MIN,
    },
  };
}
