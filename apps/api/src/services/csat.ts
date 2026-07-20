/**
 * CSAT — avaliação do atendimento pelo cliente (WhatsApp).
 * Enviada ao encerrar (humano ou IA). Nota salva e alimenta aprendizado.
 * Vale para todos os agentes.
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { broadcastToTenant } from "../ws/hub";

export type CsatConfig = {
  enabled: boolean;
  message: string;
  thankYouMessage: string;
};

export const DEFAULT_CSAT_MESSAGE =
  "Para melhorar nosso atendimento, de 1 a 5 (sendo 5 excelente), como você avalia o atendimento de hoje? Responda só com o número.";

export const DEFAULT_CSAT_THANKS =
  "Obrigado pela avaliação! Sua opinião nos ajuda a melhorar. Quando precisar, é só chamar.";

export function defaultCsatConfig(): CsatConfig {
  return {
    enabled: true,
    message: DEFAULT_CSAT_MESSAGE,
    thankYouMessage: DEFAULT_CSAT_THANKS,
  };
}

export function parseCsatConfig(raw: unknown): CsatConfig {
  const base = defaultCsatConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled !== false,
    message:
      typeof o.message === "string" && o.message.trim()
        ? o.message.trim().slice(0, 800)
        : base.message,
    thankYouMessage:
      typeof o.thankYouMessage === "string" && o.thankYouMessage.trim()
        ? o.thankYouMessage.trim().slice(0, 500)
        : base.thankYouMessage,
  };
}

export async function getCsatConfig(tenantId: string): Promise<CsatConfig> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const s = (t?.settings || {}) as { attendance?: { csat?: unknown } };
  return parseCsatConfig(s.attendance?.csat);
}

/** Extrai nota 1–5 de texto livre do cliente. */
export function parseCsatRating(raw: string): number | null {
  const t = (raw || "").trim();
  if (!t || t.length > 80) return null;

  // "5", "5/5", "nota 5", "5 estrelas"
  const m = t.match(/(?:nota\s*)?([1-5])(?:\s*\/\s*5)?(?:\s*estrelas?)?/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 5) return n;
  }

  // Só o número
  if (/^[1-5]$/.test(t)) return Number(t);

  // Emojis ⭐
  const stars = (t.match(/⭐|★|🌟/g) || []).length;
  if (stars >= 1 && stars <= 5) return stars;

  // Palavras
  const lower = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/^(pessimo|horrivel|muito\s+ruim)$/.test(lower)) return 1;
  if (/^(ruim|insatisfeit[oa])$/.test(lower)) return 2;
  if (/^(regular|medio|mais\s+ou\s+menos|ok)$/.test(lower)) return 3;
  if (/^(bom|satisfeit[oa]|legal|gostei)$/.test(lower)) return 4;
  if (/^(otimo|otima|excelente|perfeito|maravilha|top|show)$/.test(lower)) return 5;

  return null;
}

/**
 * Envia pedido de avaliação no WhatsApp após encerrar atendimento.
 */
export async function sendCsatSurvey(params: {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  agentName?: string | null;
  closedBy?: "human" | "ai" | "inactivity" | "system";
}): Promise<{ sent: boolean; reason?: string }> {
  const cfg = await getCsatConfig(params.tenantId);
  if (!cfg.enabled) return { sent: false, reason: "disabled" };

  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    include: {
      contact: { select: { phone: true, name: true } },
      channel: true,
    },
  });
  if (!conv?.contact?.phone) return { sent: false, reason: "no_phone" };
  if (conv.channel?.type !== "WHATSAPP") return { sent: false, reason: "not_whatsapp" };

  // Evita spam: já pediu CSAT nesta conversa nos últimos 7 dias
  const recent = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      metadata: { path: ["csatSurvey"], equals: true },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
    },
  });
  if (recent) return { sent: false, reason: "already_asked" };

  const text = cfg.message;
  try {
    const { dispatchWhatsAppText } = await import("./whatsapp/message-dispatch");
    const send = await dispatchWhatsAppText({
      channelId: conv.channelId!,
      to: conv.contact.phone,
      text,
      purpose: "notice",
      tenantId: params.tenantId,
      idempotencyKey: `csat-ask:${params.conversationId}`,
    });

    const out = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        type: "TEXT",
        content: text,
        externalId: send.ok ? send.externalId : undefined,
        isAiGenerated: false,
        metadata: asInputJson({
          csatSurvey: true,
          awaitingCsat: true,
          agentId: params.agentId || null,
          agentName: params.agentName || null,
          closedBy: params.closedBy || null,
          sendError: send.ok ? null : send.error || true,
        }),
      },
    });

    broadcastToTenant(params.tenantId, "message.created", {
      conversationId: params.conversationId,
      message: out,
    });

    return { sent: send.ok, reason: send.ok ? undefined : "send_failed" };
  } catch (err) {
    console.error(
      "[csat] send survey failed:",
      err instanceof Error ? err.message : err
    );
    return { sent: false, reason: "error" };
  }
}

/**
 * Se a última pesquisa ainda aguarda nota e o texto é uma avaliação, grava e agradece.
 * Retorna true se consumiu a mensagem (não deve rodar AUTO).
 */
export async function tryCaptureCsatReply(params: {
  tenantId: string;
  contactId: string;
  content: string;
}): Promise<{ captured: boolean; score?: number }> {
  const score = parseCsatRating(params.content);
  if (score == null) return { captured: false };

  // Conversa recente do contato com survey pendente
  const surveyMsg = await prisma.message.findFirst({
    where: {
      direction: "OUTBOUND",
      metadata: { path: ["awaitingCsat"], equals: true },
      conversation: {
        tenantId: params.tenantId,
        contactId: params.contactId,
      },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      conversationId: true,
      metadata: true,
      conversation: { select: { channelId: true, contact: { select: { phone: true } } } },
    },
  });
  if (!surveyMsg) return { captured: false };

  const meta = (surveyMsg.metadata || {}) as Record<string, unknown>;
  const agentId = typeof meta.agentId === "string" ? meta.agentId : null;

  // Salva feedback (1–5)
  try {
    const { recordAgentFeedback } = await import("./agent-learning");
    await recordAgentFeedback({
      tenantId: params.tenantId,
      agentId,
      conversationId: surveyMsg.conversationId,
      messageId: surveyMsg.id,
      rating: String(score),
      reason: "csat_customer",
      note: `CSAT cliente: ${score}/5`,
    });
  } catch (err) {
    console.warn("[csat] record feedback:", err instanceof Error ? err.message : err);
  }

  // Marca survey como respondida
  await prisma.message.update({
    where: { id: surveyMsg.id },
    data: {
      metadata: asInputJson({
        ...meta,
        awaitingCsat: false,
        csatScore: score,
        csatReceivedAt: new Date().toISOString(),
      }),
    },
  });

  // Evento na timeline
  await prisma.message.create({
    data: {
      conversationId: surveyMsg.conversationId,
      direction: "INTERNAL",
      type: "SYSTEM",
      content: `Cliente avaliou o atendimento: ${score}/5`,
      metadata: asInputJson({
        systemEvent: true,
        eventKind: "csat_received",
        csatScore: score,
        agentId,
      }),
    },
  });

  // Agradecimento no WhatsApp
  const cfg = await getCsatConfig(params.tenantId);
  const phone = surveyMsg.conversation.contact?.phone;
  const channelId = surveyMsg.conversation.channelId;
  if (phone && channelId) {
    try {
      const { dispatchWhatsAppText } = await import("./whatsapp/message-dispatch");
      const thanks = cfg.thankYouMessage;
      const send = await dispatchWhatsAppText({
        channelId,
        to: phone,
        text: thanks,
        purpose: "notice",
        tenantId: params.tenantId,
        idempotencyKey: `csat-thanks:${surveyMsg.conversationId}:${score}`,
      });
      await prisma.message.create({
        data: {
          conversationId: surveyMsg.conversationId,
          direction: "OUTBOUND",
          type: "TEXT",
          content: thanks,
          externalId: send.ok ? send.externalId : undefined,
          metadata: asInputJson({ csatThanks: true, csatScore: score }),
        },
      });
    } catch {
      /* ignore */
    }
  }

  broadcastToTenant(params.tenantId, "conversation.updated", {
    conversationId: surveyMsg.conversationId,
    csatScore: score,
  });

  return { captured: true, score };
}

/** Média recente de CSAT do agente (para o prompt da IA). */
export async function getRecentCsatHint(params: {
  tenantId: string;
  agentId?: string | null;
}): Promise<string | null> {
  const where: {
    tenantId: string;
    reason: string;
    agentId?: string;
    createdAt: { gte: Date };
  } = {
    tenantId: params.tenantId,
    reason: "csat_customer",
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
  };
  if (params.agentId) where.agentId = params.agentId;

  const rows = await prisma.agentFeedback.findMany({
    where,
    select: { rating: true },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  const scores = rows
    .map((r) => Number(r.rating))
    .filter((n) => n >= 1 && n <= 5);
  if (scores.length < 3) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const low = scores.filter((s) => s <= 2).length;
  if (avg >= 4.3 && low === 0) {
    return `Clientes costumam avaliar bem (${avg.toFixed(1)}/5). Mantenha clareza e objetividade.`;
  }
  if (avg < 3.5 || low >= 2) {
    return `Atenção: avaliações recentes em ${avg.toFixed(1)}/5. Seja mais claro, empático e confirme se resolveu a dúvida.`;
  }
  return `Média de satisfação recente: ${avg.toFixed(1)}/5 (${scores.length} avaliações).`;
}
