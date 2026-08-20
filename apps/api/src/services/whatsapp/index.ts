import { WahaConnector } from "./waha";
import type {
  ConnectionStatus,
  SendTextResult,
  WhatsAppChannelConfig,
  WhatsAppConnector,
  WhatsAppProvider,
} from "./types";
import { asConfig, normalizePhone } from "./types";
import { prisma } from "../../lib/prisma";
import { asInputJson } from "../../lib/json";
import { broadcastToTenant } from "../../ws/hub";

export * from "./types";
export { parseWahaWebhook } from "./webhook-parse";
export type { ParsedInboundMessage, ParsedWebhook } from "./webhook-parse";
export {
  getTenantWhatsAppStatus,
  resolveChannelConnection,
  countConnectedWhatsAppChannels,
  mapRuntimeToCanonical,
} from "./connection-status";
export type {
  WhatsAppCanonicalStatus,
  TenantWhatsAppStatus,
  ChannelConnectionView,
} from "./connection-status";
export { dispatchWhatsAppText, getDispatchMetrics } from "./message-dispatch";
export type { DispatchParams, DispatchPurpose, DispatchResult } from "./message-dispatch";
export { restoreBaileysSessionsOnBoot } from "./restore-sessions";
export { registerBaileysInboundIngest, handleBaileysInbound } from "./baileys-inbound";
export {
  createMultiFileAuthStore,
  listAuthNamespaces,
  sessionsRoot,
} from "./auth-store";
export type { BaileysAuthStateStore } from "./auth-store";
export { bindWhatsAppSessionMeta, emitWhatsAppAlert } from "./wa-alerts";

class SimulatedConnector implements WhatsAppConnector {
  async createInstance(config: WhatsAppChannelConfig) {
    return {
      ...config,
      provider: "simulated" as const,
      status: "open",
      phone: config.phone || "simulacao",
      qrcode: null,
      lastError: null,
    };
  }
  async getStatus(config: WhatsAppChannelConfig): Promise<ConnectionStatus> {
    return { state: "open", phone: config.phone || "simulacao" };
  }
  async getQr() {
    return { qrcode: null, state: "open" };
  }
  async logout() {}
  async sendText(_c: WhatsAppChannelConfig, _to: string, _text: string): Promise<SendTextResult> {
    return { ok: true, externalId: `sim-${Date.now()}` };
  }
}

export function getConnector(provider: string | WhatsAppProvider): WhatsAppConnector {
  if (provider === "waha") return new WahaConnector();
  if (provider === "baileys") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BaileysConnector } = require("./baileys") as typeof import("./baileys");
    return new BaileysConnector();
  }
  return new SimulatedConnector();
}

export async function sendWhatsAppText(channelId: string, to: string, text: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { ok: false, error: "Canal não encontrado" };

  const { env } = await import("../../lib/env");
  const config = asConfig(channel.config);

  // Provedor explícito do canal tem prioridade máxima
  const provider = config.provider || env.waGatewayProvider || "waha";
  config.provider = provider;

  if (config.provider === "waha" || config.mode === "platform") {
    config.baseUrl = config.baseUrl || env.waGatewayUrl || "http://waha:3000";
    if (!config.apiKey && env.waGatewayApiKey && !/^sha512:/i.test(env.waGatewayApiKey)) {
      config.apiKey = env.waGatewayApiKey;
    }
  }

  const sessionName = config.session || config.instanceName || channel.name || "default";
  config.session = sessionName;
  config.instanceName = sessionName;

  const connector = getConnector(provider);
  const result = await connector.sendText(config, to, text);

  if (!result.ok) {
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        config: {
          ...config,
          lastError: result.error || "Falha ao enviar",
        },
      },
    });
  }

  return result;
}

/** Processa mensagem inbound e cria/atualiza conversa no tenant */
export async function ingestInboundMessage(params: {
  tenantId: string;
  channelId: string;
  phone: string;
  name?: string;
  content: string;
  externalId?: string;
  type?: string;
  chatId?: string;
  from?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  addressingMode?: string;
}) {
  if (params.externalId) {
    const duplicate = await prisma.message.findFirst({
      where: {
        externalId: params.externalId,
        conversation: { tenantId: params.tenantId },
      },
      include: { conversation: true },
    });
    if (duplicate) {
      return {
        conversation: duplicate.conversation,
        message: duplicate,
        duplicate: true,
      };
    }
  }

  const { resolveWhatsAppIdentity } = await import("./identity-resolver");
  const identity = await resolveWhatsAppIdentity({
    tenantId: params.tenantId,
    chatId: params.chatId,
    from: params.from,
    remoteJid: params.remoteJid,
    remoteJidAlt: params.remoteJidAlt,
    addressingMode: params.addressingMode,
    pushName: params.name,
    phone: params.phone,
  });

  const contact = await prisma.contact.findUnique({
    where: { id: identity.contactId },
  });
  if (!contact) throw new Error("Falha ao resolver contato WhatsApp");

  broadcastToTenant(
    params.tenantId,
    identity.contactWasCreated ? "contact.created" : "contact.updated",
    { id: contact.id }
  );

  // CSAT: se o cliente está respondendo a pesquisa (1–5), grava e NÃO dispara AUTO
  try {
    const { tryCaptureCsatReply } = await import("../csat");
    const csat = await tryCaptureCsatReply({
      tenantId: params.tenantId,
      contactId: contact.id,
      content: params.content,
    });
    if (csat.captured) {
      console.log(
        `[whatsapp] CSAT capturado contact=${contact.id} score=${csat.score}`
      );
      // Mensagem inbound ainda precisa existir na conversa da pesquisa
      const surveyConv = await prisma.message.findFirst({
        where: {
          conversation: { tenantId: params.tenantId, contactId: contact.id },
          metadata: { path: ["csatSurvey"], equals: true },
        },
        orderBy: { createdAt: "desc" },
        select: { conversationId: true },
      });
      const conversationId = surveyConv?.conversationId;
      if (conversationId) {
        const message = await prisma.message.create({
          data: {
            conversationId,
            direction: "INBOUND",
            content: params.content,
            externalId: params.externalId,
            type: "TEXT",
            metadata: asInputJson({ csatReply: true, csatScore: csat.score }),
          },
        });
        broadcastToTenant(params.tenantId, "message.created", {
          conversationId,
          message,
        });
        return { conversation: { id: conversationId }, message, duplicate: false, csat: true };
      }
      return { conversation: null, message: null, duplicate: false, csat: true };
    }
  } catch (err) {
    console.warn(
      "[whatsapp] CSAT capture:",
      err instanceof Error ? err.message : err
    );
  }

  // Política por empresa: reabrir dentro da janela ou criar novo
  const { resolveConversationForInbound } = await import("../conversation-close");
  const resolved = await resolveConversationForInbound({
    tenantId: params.tenantId,
    contactId: contact.id,
    channelId: params.channelId,
  });
  let conversation = await prisma.conversation.findFirst({
    where: { id: resolved.conversationId, tenantId: params.tenantId },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: params.tenantId,
        contactId: contact.id,
        channelId: params.channelId,
        status: "OPEN",
        isUnread: true,
      },
    });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      content: params.content,
      externalId: params.externalId,
      type: params.type === "image" ? "IMAGE" : "TEXT",
    },
  });

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: params.content.slice(0, 200),
      isUnread: true,
      status: "OPEN",
      channelId: params.channelId,
    },
    include: { contact: true, channel: true },
  });

  broadcastToTenant(params.tenantId, "message.created", {
    conversationId: conversation.id,
    message,
    conversation: updated,
  });

  // Webhooks outbound (não bloqueia)
  setImmediate(() => {
    void import("../webhooks/dispatch")
      .then(({ emitWebhookEvent }) => {
        emitWebhookEvent({
          tenantId: params.tenantId,
          type: "message.received",
          data: {
            conversationId: conversation.id,
            message: {
              id: message.id,
              content: (params.content || "").slice(0, 500),
              direction: "INBOUND",
            },
            contactId: contact.id,
          },
        });
        if (resolved.created) {
          emitWebhookEvent({
            tenantId: params.tenantId,
            type: "conversation.created",
            data: {
              conversation: {
                id: conversation.id,
                contactId: contact.id,
                status: "OPEN",
              },
            },
          });
        }
      })
      .catch(() => null);
  });

  // Automações ACTIVE (tarefas, tags, status) — não bloqueia o webhook
  setImmediate(() => {
    void import("../automations/engine")
      .then(({ dispatchAutomationEvent }) =>
        dispatchAutomationEvent({
          type: "message.received",
          tenantId: params.tenantId,
          conversationId: conversation.id,
          contactId: contact.id,
          messageId: message.id,
          payload: {
            content: params.content,
            phone: contact.phone || params.phone,
            channelId: params.channelId,
          },
        })
      )
      .catch((err) => {
        console.error(
          "[automations] dispatch failed:",
          err instanceof Error ? err.message : err
        );
      });
  });

  // Auto-resposta da IA (humano virtual) — não bloqueia o webhook
  setImmediate(() => {
    void maybeAutoReplyAi({
      tenantId: params.tenantId,
      conversationId: conversation.id,
      channelId: params.channelId,
      contactPhone: contact.phone || params.phone,
    }).catch((err) => {
      console.error("[whatsapp] auto-reply failed", err instanceof Error ? err.message : err);
    });
  });

  return { conversation: updated, message, duplicate: false };
}

/**
 * Avisos padrão do sistema no WhatsApp (todos os agentes / todos os clientes).
 * - human_takeover → humano assumiu
 * - attendance_closed → atendimento encerrado
 */
export type ChatSystemNoticeKind = "human_takeover" | "attendance_closed";

async function sendStandardChatNotice(params: {
  tenantId: string;
  conversationId: string;
  kind: ChatSystemNoticeKind;
  text: string;
  authorId?: string | null;
  meta?: Record<string, unknown>;
  /** evita reenviar o mesmo tipo (ex.: clicar Encerrar 2x) */
  dedupeKey?: string;
  dedupeValue?: string | boolean;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    include: { contact: true, channel: true },
  });
  if (!conversation) return { ok: false as const, reason: "not_found" as const };

  if (params.dedupeKey) {
    const already = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        metadata: { path: [params.dedupeKey], equals: params.dedupeValue ?? true },
      },
      orderBy: { createdAt: "desc" },
    });
    if (already) {
      // human_takeover: só pula se for o MESMO atendente
      if (params.kind === "human_takeover") {
        const meta = (already.metadata || {}) as { agentUserId?: string };
        if (meta.agentUserId && params.meta?.agentUserId === meta.agentUserId) {
          return { ok: true as const, skipped: true as const };
        }
      } else {
        return { ok: true as const, skipped: true as const };
      }
    }
  }

  let externalId: string | undefined;
  let sendError: string | undefined;

  if (conversation.channel?.type === "WHATSAPP" && conversation.contact.phone) {
    const { dispatchWhatsAppText } = await import("./message-dispatch");
    const sent = await dispatchWhatsAppText({
      channelId: conversation.channel.id,
      to: conversation.contact.phone,
      text: params.text,
      purpose: "notice",
      tenantId: params.tenantId,
      contactId: conversation.contactId,
      idempotencyKey: `notice:${params.kind}:${params.conversationId}:${params.dedupeValue ?? ""}`,
    });
    if (sent.ok) externalId = sent.externalId;
    else sendError = sent.error || `Falha ao enviar aviso (${params.kind})`;
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      authorId: params.authorId || undefined,
      direction: "OUTBOUND",
      type: "TEXT",
      content: params.text,
      externalId,
      isAiGenerated: false,
      metadata: {
        systemNotice: true,
        noticeKind: params.kind,
        ...(params.meta || {}),
        ...(sendError ? { sendError } : {}),
      },
    },
  });

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: params.text.slice(0, 200),
      isUnread: false,
    },
  });

  broadcastToTenant(params.tenantId, "message.created", {
    conversationId: params.conversationId,
    message: msg,
  });

  console.log(
    `[whatsapp] notice ${params.kind} conv=${params.conversationId}${sendError ? ` err=${sendError}` : ""}`
  );

  return { ok: true as const, message: msg, sendError };
}

/** Padrão: avisar no WhatsApp que um atendente humano assumiu (qualquer agente, qualquer cliente). */
export async function notifyHumanTakeover(params: {
  tenantId: string;
  conversationId: string;
  agentUserId: string;
  agentName?: string | null;
}) {
  const name =
    (params.agentName || "").trim().split(" ")[0] ||
    (
      await prisma.user.findUnique({
        where: { id: params.agentUserId },
        select: { name: true },
      })
    )?.name?.split(" ")[0] ||
    "nossa equipe";

  const text = `Oi! Um atendente humano da nossa equipe acabou de assumir seu atendimento 😊\n\nAgora você fala com *${name}*. Pode continuar por aqui que ele(a) te ajuda.`;

  return sendStandardChatNotice({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    kind: "human_takeover",
    text,
    authorId: params.agentUserId,
    dedupeKey: "humanHandoff",
    dedupeValue: true,
    meta: {
      humanHandoff: true,
      agentUserId: params.agentUserId,
      agentName: name,
    },
  });
}

/** Padrão: avisar no WhatsApp que o atendimento foi encerrado (qualquer agente, qualquer cliente). */
export async function notifyAttendanceClosed(params: {
  tenantId: string;
  conversationId: string;
  agentUserId?: string | null;
  agentName?: string | null;
  reason?: "CLOSED" | "ARCHIVED";
  /** Texto personalizado da empresa; se vazio/undefined, usa o padrão */
  customText?: string | null;
}) {
  const name =
    (params.agentName || "").trim().split(" ")[0] ||
    (params.agentUserId
      ? (
          await prisma.user.findUnique({
            where: { id: params.agentUserId },
            select: { name: true },
          })
        )?.name?.split(" ")[0]
      : null) ||
    null;

  const who = name ? ` *${name}*` : "";
  const defaultText = name
    ? `Atendimento encerrado ✅\n\nObrigado pelo contato! Seu atendimento com${who} foi finalizado.\n\nSe precisar de algo, é só mandar uma nova mensagem por aqui — a gente te atende de novo com prazer.`
    : `Atendimento encerrado ✅\n\nObrigado pelo contato! Seu atendimento foi finalizado.\n\nSe precisar de algo, é só mandar uma nova mensagem por aqui — a gente te atende de novo com prazer.`;

  const text =
    typeof params.customText === "string" && params.customText.trim()
      ? params.customText.trim().slice(0, 1000)
      : defaultText;

  // Sem dedupe permanente: se reabriu e encerrou de novo, avisa outra vez.
  // Quem chama só dispara na transição OPEN/PENDING → CLOSED/ARCHIVED.
  return sendStandardChatNotice({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    kind: "attendance_closed",
    text,
    authorId: params.agentUserId || undefined,
    meta: {
      attendanceClosed: true,
      closeReason: params.reason || "CLOSED",
      agentUserId: params.agentUserId || null,
      agentName: name,
    },
  });
}

/**
 * Config da empresa: após handoff, se o cliente voltar a escrever e ninguém
 * estiver assigned, a IA reassume. Default: true.
 */
async function getAiResumeOnCustomerReturn(tenantId: string): Promise<boolean> {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const s = (t?.settings || {}) as {
      attendance?: { aiHandoff?: { resumeOnCustomerReturn?: boolean } };
      aiHandoff?: { resumeOnCustomerReturn?: boolean };
    };
    const v =
      s.attendance?.aiHandoff?.resumeOnCustomerReturn ??
      s.aiHandoff?.resumeOnCustomerReturn;
    if (typeof v === "boolean") return v;
    return true;
  } catch {
    return true;
  }
}

async function resumeAiAfterCustomerReturn(params: {
  tenantId: string;
  conversationId: string;
}) {
  await prisma.conversation.updateMany({
    where: {
      id: params.conversationId,
      tenantId: params.tenantId,
      assignedToId: null,
    },
    data: { status: "OPEN", isUnread: true },
  });

  // Desativa flags de fila nos avisos antigos (evita skip eterno / banner preso)
  try {
    const old = await prisma.message.findMany({
      where: {
        conversationId: params.conversationId,
        OR: [
          { metadata: { path: ["waitingHuman"], equals: true } },
          { metadata: { path: ["requiresAssume"], equals: true } },
        ],
      },
      select: { id: true, metadata: true },
      take: 20,
    });
    const { asInputJson } = await import("../../lib/json");
    await Promise.all(
      old.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: {
            metadata: asInputJson({
              ...((m.metadata as Record<string, unknown>) || {}),
              waitingHuman: false,
              requiresAssume: false,
              resolvedByAiResume: true,
            }),
          },
        })
      )
    );
  } catch {
    /* best-effort */
  }

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      direction: "INTERNAL",
      type: "SYSTEM",
      content:
        "IA reassumiu o atendimento: o cliente voltou a pedir ajuda e nenhum humano estava no chat (configuração da empresa).",
      isAiGenerated: true,
      metadata: {
        systemNotice: true,
        noticeKind: "ai_resumed_customer_return",
        humanHandoff: false,
        waitingHuman: false,
        requiresAssume: false,
        aiResumed: true,
      },
    },
  });
  try {
    const { broadcastToTenant } = await import("../../ws/hub");
    broadcastToTenant(params.tenantId, "conversation.updated", {
      id: params.conversationId,
      conversationId: params.conversationId,
      status: "OPEN",
      aiResumed: true,
      waitingHuman: false,
    });
    // Atualiza banner "Assumir" (some da fila)
    broadcastToTenant(params.tenantId, "notification.created", {
      conversationId: params.conversationId,
      waitingHuman: false,
      aiResumed: true,
    });
  } catch {
    /* ignore */
  }
}

/** Revalida imediatamente antes de persistir/enviar — humano pode ter assumido durante a geração. */
export async function autoReplyStillEligible(params: {
  tenantId: string;
  conversationId: string;
  agentId: string;
  inboundMessageId?: string;
}): Promise<boolean> {
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: { assignedToId: true, status: true },
  });
  if (!conv || conv.status === "CLOSED" || conv.status === "ARCHIVED" || conv.status === "PENDING") {
    return false;
  }
  if (conv.assignedToId) return false;

  const agent = await prisma.aiAgent.findFirst({
    where: {
      id: params.agentId,
      tenantId: params.tenantId,
      isActive: true,
      mode: "AUTO",
      publishStatus: "PUBLISHED",
    },
    select: { id: true },
  });
  if (!agent) return false;

  const tenant = await prisma.tenant.findFirst({
    where: { id: params.tenantId, status: { in: ["ACTIVE", "TRIAL"] } },
    select: { id: true },
  });
  if (!tenant) return false;

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: params.conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (lastInbound) {
    const targetInboundId = params.inboundMessageId || lastInbound.id;
    const already = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        isAiGenerated: true,
        metadata: { path: ["inboundMessageId"], equals: targetInboundId },
      },
      select: { id: true },
    });
    if (already) return false;
  }

  const recentHuman = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      direction: "OUTBOUND",
      isAiGenerated: false,
      authorId: { not: null },
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
    select: { id: true },
  });
  if (recentHuman) return false;

  return true;
}

/**
 * Agente em modo AUTO responde no WhatsApp como se fosse um humano da equipe.
 * NÃO responde se um atendente humano já assumiu (assignedToId).
 */
async function maybeAutoReplyAi(params: {
  tenantId: string;
  conversationId: string;
  channelId: string;
  contactPhone: string;
}) {
  console.log(`[ai-trace] [AUTO_START] conversationId=${params.conversationId} phone=${params.contactPhone}`);

  // Humano no comando → IA fica em silêncio
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: { assignedToId: true, status: true },
  });
  if (!conv || conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    console.log(`[ai-trace] [AUTO_SKIP] conversationId=${params.conversationId} status=${conv?.status || "missing"}`);
    return;
  }
  if (conv.assignedToId) {
    console.log(`[ai-trace] [AUTO_SKIP] conversationId=${params.conversationId} humano assumiu (assignedToId=${conv.assignedToId})`);
    return;
  }

  // Fila humana / handoff: se conv.status === "PENDING", só responde se empresa permite reassumir
  const resumeOnReturn = await getAiResumeOnCustomerReturn(params.tenantId);
  const inHumanQueue = conv.status === "PENDING";
  if (inHumanQueue) {
    const lastInbound = await prisma.message.findFirst({
      where: { conversationId: params.conversationId, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, content: true },
    });

    const { isMeaningfulCustomerReturnMessage } = await import("./resume-guard");
    const meaningfulReturn = isMeaningfulCustomerReturnMessage(lastInbound?.content || "");

    if (resumeOnReturn && meaningfulReturn && !conv.assignedToId) {
      console.log(`[ai-trace] [AUTO_RESUME] cliente voltou a interagir — IA reassumindo`);
      try {
        await resumeAiAfterCustomerReturn({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
        });
      } catch (err) {
        console.warn("[whatsapp] resume AI failed:", err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`[ai-trace] [AUTO_SKIP] fila humana ativa (status=PENDING, meaningful=${meaningfulReturn})`);
      return;
    }
  }

  // Agente de produção: AUTO + PUBLISHED + ativo (não o “mais antigo” cegamente)
  const { resolveProductionAutoAgent } = await import("../resolve-production-agent");
  const agent = await resolveProductionAutoAgent(params.tenantId);

  if (!agent) {
    console.warn(
      `[ai-trace] [AUTO_SKIP] nenhum agente elegível para tenant=${params.tenantId} (precisa isActive + mode AUTO + publishStatus PUBLISHED)`
    );
    return;
  }

  // Access Gate: empresa bloqueada/suspensa/inadimplente → não auto-responder
  try {
    const { assertTenantCanRunAiAuto } = await import("../access-gate");
    await assertTenantCanRunAiAuto(params.tenantId);
  } catch (err) {
    console.warn(
      `[ai-trace] [AUTO_SKIP] access gate:`,
      err instanceof Error ? err.message : err
    );
    return;
  }

  const {
    getTenantAiCreditPressure,
    buildInstabilityClientMessage,
  } = await import("../platform-ai-degradation");

  const creditPressure = await getTenantAiCreditPressure(params.tenantId);
  const contact = await prisma.conversation.findFirst({
    where: { id: params.conversationId },
    select: { contact: { select: { name: true } } },
  });
  const { extractValidPersonFirstName } = await import("../../lib/contact-fields");
  const contactFirst = extractValidPersonFirstName(contact?.contact?.name);
  const contactFull = contact?.contact?.name || null;

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: params.conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, content: true },
  });
  const inboundMessageId = lastInbound?.id;

  // Créditos esgotados: promete humano + fila Assumir (operacional)
  if (creditPressure.exhausted) {
    console.warn(`[ai-trace] [AUTO_CREDITS_EXHAUSTED] tenantId=${params.tenantId}`);
    const reply = buildInstabilityClientMessage({
      agentName: agent.name,
      contactFirstName: contactFirst,
      isFirst: false,
      promiseHuman: true,
    });
    await sendAiOutboundAndHandoff({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      channelId: params.channelId,
      contactPhone: params.contactPhone,
      inboundMessageId,
      agentId: agent.id,
      agentName: agent.name,
      contactName: contactFull,
      reply,
      provider: "platform",
      model: "credits_exhausted",
      reason: "tenant_credits_exhausted",
      skipUsageCredit: true,
      forceHandoff: true,
    });
    return;
  }

  // Revalida assignee sem delay artificial (IA mais rápida)
  const again = await prisma.conversation.findFirst({
    where: { id: params.conversationId },
    select: { assignedToId: true },
  });
  if (again?.assignedToId) {
    console.log(`[ai-trace] [AUTO_SKIP] humano assumiu, skip`);
    return;
  }

  // se alguém (humano) já respondeu nos últimos 2s, não manda
  const recentOut = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      direction: "OUTBOUND",
      authorId: { not: null },
      createdAt: { gte: new Date(Date.now() - 2000) },
      isAiGenerated: false,
    },
  });
  if (recentOut) {
    console.log(`[ai-trace] [AUTO_SKIP] humano já respondeu nos últimos 2s, skip`);
    return;
  }

  if (lastInbound) {
    const alreadyReplied = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        isAiGenerated: true,
        metadata: { path: ["inboundMessageId"], equals: lastInbound.id },
      },
      select: { id: true },
    });
    if (alreadyReplied) {
      console.log(`[ai-trace] [ALREADY_REPLIED] conversationId=${params.conversationId} inboundId=${lastInbound.id}, skip`);
      return;
    }
  }

  // Garante knowledge operacional (FAQ/políticas) pronto para a IA usar
  try {
    const { ensureOperationalKnowledgeReady } = await import("../knowledge-starter");
    await ensureOperationalKnowledgeReady(params.tenantId);
  } catch {
    /* não bloqueia resposta */
  }

  console.log(`[ai-trace] [AI_GENERATING] conversationId=${params.conversationId} agent=${agent.name}`);
  const { generateHumanWhatsAppReply } = await import("../ai");
  const generated = await generateHumanWhatsAppReply({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    agentId: agent.id,
  });

  let reply = (generated.reply || "").trim();
  if (!reply) {
    console.warn(`[ai-trace] [AUTO_SKIP] resposta vazia`);
    return;
  }

  // Tools leves no AUTO: SOMENTE pedido explícito de humano dispara tool request_human
  try {
    const { detectToolRequiredIntent } = await import("../agent-action-grounding");
    const intent = detectToolRequiredIntent(lastInbound?.content || "");
    const wantsHumanExplicit =
      intent === "REQUEST_HUMAN" ||
      Boolean(generated.needsHumanHandoff) ||
      /\b(falar\s+com|passar\s+para|transferir\s+para|chamar|preciso\s+de|quero)\s+(um\s+|uma\s+)?(humano|atendente|pessoa\s+real|gerente|operador|especialista)\b/i.test(lastInbound?.content || "") ||
      /\b(suporte\s+humano|atendimento\s+humano|atendente\s+humano|humano\s+por\s+favor)\b/i.test(lastInbound?.content || "");

    if (wantsHumanExplicit) {
      const convRow = await prisma.conversation.findFirst({
        where: { id: params.conversationId, tenantId: params.tenantId },
        select: { contactId: true },
      });
      const { executeAgentToolCalls } = await import("../agent-tools");
      await executeAgentToolCalls(
        {
          tenantId: params.tenantId,
          agentId: agent.id,
          conversationId: params.conversationId,
          contactId: convRow?.contactId,
          source: "auto",
        },
        [{ tool: "request_human", args: { reason: "cliente_pediu_humano" } }]
      );
      console.log(`[ai-trace] [HUMAN_HANDOFF_TRIGGERED] conversationId=${params.conversationId}`);
    }
  } catch (err) {
    console.warn(
      "[whatsapp] auto-reply: tool loop falhou (segue resposta):",
      err instanceof Error ? err.message : err
    );
  }

  // Fila "Assumir" só: needsHumanHandoff real (regras/tool) OU créditos esgotados.
  const forceHandoff =
    Boolean(generated.needsHumanHandoff) || creditPressure.exhausted;

  const degradationReason = creditPressure.exhausted
    ? ("tenant_credits_exhausted" as const)
    : generated.needsHumanHandoff
      ? generated.degradationReason
      : undefined;

  const stillOk = await autoReplyStillEligible({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    agentId: agent.id,
    inboundMessageId,
  });
  if (!stillOk) {
    console.log(`[ai-trace] [AUTO_DISCARD] estado mudou após geração — descarta envio conversationId=${params.conversationId}`);
    return;
  }

  console.log(
    `[ai-trace] [AI_DISPATCH] enviando como ${generated.agentName || agent.name} (${reply.slice(0, 60)}…)`
  );

  await sendAiOutboundAndHandoff({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    channelId: params.channelId,
    contactPhone: params.contactPhone,
    inboundMessageId,
    agentId: agent.id,
    agentName: generated.agentName || agent.name,
    contactName: contactFull,
    reply,
    provider: generated.provider,
    model: generated.model,
    tokensIn: generated.tokensIn,
    tokensOut: generated.tokensOut,
    correlationId: generated.correlationId,
    sources: generated.sources,
    reason: forceHandoff
      ? degradationReason || "provider_error"
      : undefined,
    skipUsageCredit: Boolean(
      generated.model === "rate_limited" ||
        generated.model === "error_fallback" ||
        generated.provider === "rate_limited"
    ),
    forceHandoff,
    runLearning: !forceHandoff,
  });
}

/** Envia outbound da IA e, se política da plataforma exigir, handoff + notificação. */
async function sendAiOutboundAndHandoff(params: {
  tenantId: string;
  conversationId: string;
  channelId: string;
  contactPhone: string;
  inboundMessageId?: string;
  agentId: string;
  agentName: string;
  contactName?: string | null;
  reply: string;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  reason?:
    | "provider_rate_limit"
    | "tenant_credits_exhausted"
    | "tenant_credits_near_limit"
    | "provider_error";
  skipUsageCredit?: boolean;
  forceHandoff?: boolean;
  runLearning?: boolean;
  correlationId?: string;
  sources?: Array<{ title: string; documentId: string; version: number; chunkIndex: number; score: number }>;
}) {
  const conv = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { contact: true },
  });
  const customData = (conv?.contact?.customData || {}) as Record<string, unknown>;
  const destinationTo =
    (customData.wahaChatId as string) ||
    (customData.wahaLid as string) ||
    params.contactPhone ||
    conv?.contact?.phone ||
    "";

  const { createHash } = await import("crypto");
  const { dispatchWhatsAppText } = await import("./message-dispatch");
  const replyHash = createHash("sha256").update(params.reply).digest("hex").slice(0, 16);
  const idempotencyKey = params.inboundMessageId
    ? `ai-auto:${params.conversationId}:${params.inboundMessageId}`
    : `ai-auto:${params.conversationId}:${replyHash}`;

  console.log(`[ai-trace] [OUTBOUND_QUEUED] conversationId=${params.conversationId} to=${destinationTo} key=${idempotencyKey}`);
  const send = await dispatchWhatsAppText({
    channelId: params.channelId,
    to: destinationTo,
    text: params.reply,
    purpose: "ai",
    tenantId: params.tenantId,
    idempotencyKey,
  });

  if (!send.ok) {
    console.error(`[ai-trace] [OUTBOUND_FAILED] error=${send.error}`);
    const failMsg = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        content: params.reply,
        type: "TEXT",
        isAiGenerated: true,
        metadata: {
          aiAuto: true,
          inboundMessageId: params.inboundMessageId,
          deliveryStatus: "FAILED",
          deliveryError: send.error || "Falha no envio WhatsApp",
          sendError: send.error || true,
          note: "Gerada pela IA mas o envio no WhatsApp falhou",
          platformDegradation: params.forceHandoff || false,
        },
      },
    });
    broadcastToTenant(params.tenantId, "message.created", {
      conversationId: params.conversationId,
      message: failMsg,
    });
    if (params.forceHandoff && params.reason) {
      const { platformAiHandoffToHuman } = await import("../platform-ai-degradation");
      await platformAiHandoffToHuman({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        agentId: params.agentId,
        agentName: params.agentName,
        reason: params.reason,
        contactName: params.contactName,
      });
    }
    return;
  }

  console.log(`[ai-trace] [OUTBOUND_SENT] conversationId=${params.conversationId} externalId=${send.externalId || "ok"}`);

  if (!params.skipUsageCredit) {
    try {
      const { recordAiUsage } = await import("../entitlements");
      await recordAiUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        provider: params.provider,
        model: params.model,
        tokensIn: params.tokensIn ?? 0,
        tokensOut: params.tokensOut ?? 0,
        credits: 1,
        purpose: "whatsapp_auto_reply",
      });
    } catch {
      /* ignore */
    }
  }

  const outMsg = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      direction: "OUTBOUND",
      content: params.reply,
      externalId: send.externalId,
      type: "TEXT",
      isAiGenerated: true,
      metadata: {
        aiAuto: true,
        inboundMessageId: params.inboundMessageId,
        deliveryStatus: "SENT",
        agentId: params.agentId,
        agentName: params.agentName,
        provider: params.provider,
        model: params.model,
        humanStyle: true,
        platformDegradation: params.forceHandoff || false,
        degradationReason: params.reason || null,
        correlationId: params.correlationId || null,
        sources: params.sources || [],
      },
    },
  });

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: params.reply.slice(0, 200),
    },
  });

  broadcastToTenant(params.tenantId, "message.created", {
    conversationId: params.conversationId,
    message: outMsg,
  });

  // Política plataforma: handoff humano + notificação no painel
  if (params.forceHandoff && params.reason) {
    try {
      const { platformAiHandoffToHuman } = await import("../platform-ai-degradation");
      await platformAiHandoffToHuman({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        agentId: params.agentId,
        agentName: params.agentName,
        reason: params.reason,
        contactName: params.contactName,
      });
    } catch (err) {
      console.warn(
        "[whatsapp] platform handoff failed:",
        err instanceof Error ? err.message : err
      );
    }
    return; // sem closure/learning após degradação
  }

  try {
    const { maybeHandleAiClosure } = await import("../conversation-close");
    await maybeHandleAiClosure({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      agentId: params.agentId,
      agentName: params.agentName,
    });
  } catch (err) {
    console.warn(
      "[whatsapp] ai-close check failed:",
      err instanceof Error ? err.message : err
    );
  }

  // Handoff por regras do agente / pedido do cliente / tom da resposta da IA
  // (forceHandoff de degradação já notificou acima)
  if (!params.forceHandoff) {
    try {
      const lastIn = await prisma.message.findFirst({
        where: { conversationId: params.conversationId, direction: "INBOUND" },
        orderBy: { createdAt: "desc" },
      });
      const agent = await prisma.aiAgent.findFirst({
        where: { id: params.agentId, tenantId: params.tenantId },
        select: { name: true, transferRules: true },
      });
      const rules = (agent?.transferRules || {}) as {
        triggers?: string[];
        destination?: string;
        handoffMessage?: string | null;
      };

      const { matchHandoffTriggers, handoffToHumanQueue } = await import(
        "../human-handoff"
      );
      const match = matchHandoffTriggers({
        customerMessage: lastIn?.content || "",
        aiReply: params.reply,
        triggers: rules.triggers,
      });

      if (match) {
        console.log(
          `[whatsapp] auto-reply: handoff regra="${match.trigger}" (${match.label})`
        );
        await handoffToHumanQueue({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
          agentId: params.agentId,
          agentName: params.agentName || agent?.name || null,
          contactName: params.contactName,
          reason: match.trigger,
          reasonLabel: match.label,
          source: match.trigger === "ai_reply_handoff" ? "ai_reply" : "ai_rule",
          destination: rules.destination || "queue",
        });
      }
    } catch (err) {
      console.warn(
        "[whatsapp] auto-reply handoff rules:",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (params.runLearning === false) return;

  try {
    const lastIn = await prisma.message.findFirst({
      where: { conversationId: params.conversationId, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
    });
    if (lastIn) {
      const { maybeGapFromReply } = await import("../agent-learning");
      await maybeGapFromReply({
        tenantId: params.tenantId,
        agentId: params.agentId,
        userMessage: lastIn.content,
        reply: params.reply,
      });
    }
  } catch (err) {
    console.warn(
      "[whatsapp] auto-reply post-learning:",
      err instanceof Error ? err.message : err
    );
  }
}
