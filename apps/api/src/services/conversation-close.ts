/**
 * Encerramento de atendimentos — manual, inatividade e IA.
 * Isolado por tenantId. Não apaga histórico.
 *
 * Config em tenant.settings.attendance (default seguro: auto desligado).
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { audit } from "./audit";
import { broadcastToTenant } from "../ws/hub";

export type CloseSource = "human" | "inactivity" | "ai";

export type CloseReasonCode =
  | "COMPLETED"
  | "HUMAN_CLOSED"
  | "AI_RESOLVED"
  | "NO_RESPONSE"
  | "CANCELLED"
  | "DUPLICATE"
  | "SALE"
  | "GAVE_UP"
  | "FORWARDED"
  | "OTHER";

export type AiCloseMode = "off" | "suggest" | "auto";
export type ReopenMode = "new" | "reopen";

export type AttendanceCloseConfig = {
  inactivity: {
    enabled: boolean;
    /** minutos sem resposta do cliente (após última saída da empresa) */
    timeoutMinutes: number;
    sendCloseMessage: boolean;
    closeMessage: string;
  };
  aiClose: {
    mode: AiCloseMode;
    sendFarewell: boolean;
    farewellMessage: string;
  };
  reopen: {
    mode: ReopenMode;
    /** horas após closedAt para reabrir o mesmo atendimento */
    windowHours: number;
  };
};

export const CLOSE_REASON_LABELS: Record<string, string> = {
  COMPLETED: "Resolvido",
  HUMAN_CLOSED: "Encerrado pelo atendente",
  AI_RESOLVED: "Resolvido pela IA",
  NO_RESPONSE: "Inatividade do cliente",
  CANCELLED: "Cancelado",
  DUPLICATE: "Duplicado",
  SALE: "Venda realizada",
  GAVE_UP: "Cliente desistiu",
  FORWARDED: "Encaminhado",
  OTHER: "Outro",
};

export const DEFAULT_INACTIVITY_MESSAGE =
  "Como não recebemos mais respostas, vamos encerrar este atendimento por enquanto. Quando precisar, é só nos chamar novamente.";

export const DEFAULT_AI_FAREWELL =
  "Perfeito! Fico feliz em ajudar. Quando precisar novamente, é só chamar.";

export function defaultAttendanceCloseConfig(): AttendanceCloseConfig {
  return {
    inactivity: {
      enabled: false,
      timeoutMinutes: 24 * 60,
      sendCloseMessage: true,
      closeMessage: DEFAULT_INACTIVITY_MESSAGE,
    },
    aiClose: {
      mode: "off",
      sendFarewell: true,
      farewellMessage: DEFAULT_AI_FAREWELL,
    },
    reopen: {
      mode: "new",
      windowHours: 24,
    },
  };
}

export function parseAttendanceCloseConfig(raw: unknown): AttendanceCloseConfig {
  const base = defaultAttendanceCloseConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const ina = (o.inactivity || {}) as Record<string, unknown>;
  const ai = (o.aiClose || {}) as Record<string, unknown>;
  const re = (o.reopen || {}) as Record<string, unknown>;

  const timeout = Number(ina.timeoutMinutes);
  const windowH = Number(re.windowHours);
  const aiMode = String(ai.mode || "off");
  const reopenMode = String(re.mode || "new");

  return {
    inactivity: {
      enabled: ina.enabled === true,
      timeoutMinutes:
        Number.isFinite(timeout) && timeout >= 15 && timeout <= 60 * 24 * 14
          ? Math.floor(timeout)
          : base.inactivity.timeoutMinutes,
      sendCloseMessage: ina.sendCloseMessage !== false,
      closeMessage:
        typeof ina.closeMessage === "string" && ina.closeMessage.trim()
          ? ina.closeMessage.trim().slice(0, 1000)
          : base.inactivity.closeMessage,
    },
    aiClose: {
      mode:
        aiMode === "suggest" || aiMode === "auto"
          ? (aiMode as AiCloseMode)
          : "off",
      sendFarewell: ai.sendFarewell !== false,
      farewellMessage:
        typeof ai.farewellMessage === "string" && ai.farewellMessage.trim()
          ? ai.farewellMessage.trim().slice(0, 1000)
          : base.aiClose.farewellMessage,
    },
    reopen: {
      mode: reopenMode === "reopen" ? "reopen" : "new",
      windowHours:
        Number.isFinite(windowH) && windowH >= 1 && windowH <= 24 * 30
          ? Math.floor(windowH)
          : base.reopen.windowHours,
    },
  };
}

export async function getAttendanceCloseConfig(
  tenantId: string
): Promise<AttendanceCloseConfig> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const s = (t?.settings || {}) as { attendance?: unknown };
  return parseAttendanceCloseConfig(s.attendance);
}

/** Bloqueios que impedem encerramento automático seguro */
export async function getAutoCloseBlockers(params: {
  tenantId: string;
  conversationId: string;
}): Promise<string[]> {
  const blockers: string[] = [];
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: { id: true, status: true, assignedToId: true },
  });
  if (!conv) {
    blockers.push("not_found");
    return blockers;
  }
  if (conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    blockers.push("already_closed");
    return blockers;
  }

  // Humano no comando → não encerra por inatividade/IA genérica
  if (conv.assignedToId) {
    blockers.push("human_active");
  }

  // Fila humana (aguardando assumir) — nunca auto-close
  if (conv.status === "PENDING" && !conv.assignedToId) {
    blockers.push("waiting_human");
  } else {
    const waitingFlag = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        OR: [
          { metadata: { path: ["waitingHuman"], equals: true } },
          { metadata: { path: ["requiresAssume"], equals: true } },
        ],
      },
      select: { id: true },
    });
    if (waitingFlag && !conv.assignedToId) blockers.push("waiting_human");
  }

  const pendingApproval = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      isAiGenerated: true,
      aiApproved: false,
    },
    select: { id: true },
  });
  if (pendingApproval) blockers.push("pending_approval");

  try {
    const openCriticalTasks = await prisma.task.count({
      where: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        status: { in: ["TODO", "IN_PROGRESS"] },
      },
    });
    if (openCriticalTasks > 0) blockers.push("open_tasks");
  } catch {
    /* schema de task pode variar em ambientes legados */
  }

  const recentOut = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      direction: "OUTBOUND",
      createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
    },
    select: { metadata: true },
    take: 8,
  });
  for (const m of recentOut) {
    const meta = (m.metadata || {}) as Record<string, unknown>;
    if (meta.sendError || meta.deliveryError) {
      blockers.push("pending_send");
      break;
    }
  }

  return blockers;
}

async function postSystemEvent(params: {
  tenantId: string;
  conversationId: string;
  content: string;
  eventKind: string;
  meta?: Record<string, unknown>;
}) {
  const msg = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      direction: "INTERNAL",
      type: "SYSTEM",
      content: params.content,
      metadata: asInputJson({
        systemEvent: true,
        eventKind: params.eventKind,
        ...(params.meta || {}),
      }),
    },
  });
  broadcastToTenant(params.tenantId, "message.created", {
    conversationId: params.conversationId,
    message: msg,
  });
  return msg;
}

/**
 * Encerra atendimento de forma idempotente.
 * Não apaga mensagens. Registra motivo, auditoria e evento na timeline.
 */
export async function closeConversation(params: {
  tenantId: string;
  conversationId: string;
  source: CloseSource;
  reason: CloseReasonCode | string;
  note?: string | null;
  userId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  /** Se false, não envia aviso no WhatsApp */
  sendNotice?: boolean;
  /** Texto customizado; se omitido, usa template padrão do canal */
  noticeText?: string | null;
  skipSafetyChecks?: boolean;
  /** status alvo: CLOSED (default) */
  status?: "CLOSED" | "ARCHIVED";
}) {
  const before = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    include: { assignedTo: { select: { id: true, name: true } }, contact: true },
  });
  if (!before) return { ok: false as const, reason: "not_found" as const };
  if (before.status === "CLOSED" || before.status === "ARCHIVED") {
    return { ok: true as const, skipped: true as const, conversation: before };
  }

  if (!params.skipSafetyChecks && params.source !== "human") {
    const blockers = await getAutoCloseBlockers({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
    });
    if (blockers.length) {
      return { ok: false as const, reason: "blocked" as const, blockers };
    }
  }

  const targetStatus = params.status || "CLOSED";
  const conversation = await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      status: targetStatus,
      closedAt: new Date(),
      closeReason: String(params.reason).slice(0, 40),
      closeSource: params.source,
      closedById: params.userId || null,
      closeNote: params.note?.slice(0, 500) || null,
      isUnread: false,
    },
    include: {
      contact: true,
      channel: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const reasonLabel =
    CLOSE_REASON_LABELS[params.reason] || params.reason || "Encerrado";
  const who =
    params.source === "ai"
      ? params.agentName || "IA"
      : params.source === "inactivity"
        ? "Sistema"
        : before.assignedTo?.name || "Atendente";

  const timelineText =
    params.source === "inactivity"
      ? `Atendimento encerrado automaticamente\nMotivo: ${reasonLabel}`
      : params.source === "ai"
        ? `${who} encerrou o atendimento\nMotivo: ${reasonLabel}`
        : `Atendimento finalizado por ${who}\nMotivo: ${reasonLabel}`;

  await postSystemEvent({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    content: timelineText,
    eventKind: "attendance_closed",
    meta: {
      closeSource: params.source,
      closeReason: params.reason,
      agentId: params.agentId || null,
    },
  });

  // Aviso no WhatsApp (se configurado)
  if (params.sendNotice !== false) {
    try {
      const { notifyAttendanceClosed } = await import("./whatsapp");
      await notifyAttendanceClosed({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        agentUserId: params.userId || null,
        agentName: params.agentName || conversation.assignedTo?.name,
        reason: targetStatus === "ARCHIVED" ? "ARCHIVED" : "CLOSED",
        customText: params.noticeText ?? undefined,
      });
    } catch (err) {
      console.error(
        "[conversation-close] notice failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Pesquisa de satisfação (CSAT) — IA ou humano; salva e alimenta aprendizado
  try {
    const { sendCsatSurvey } = await import("./csat");
    // agentId: último agente da conversa se IA
    let agentId = params.agentId || null;
    if (!agentId) {
      const lastAi = await prisma.message.findFirst({
        where: {
          conversationId: params.conversationId,
          isAiGenerated: true,
          direction: "OUTBOUND",
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
      });
      const mid = (lastAi?.metadata || {}) as { agentId?: string };
      agentId = mid.agentId || null;
    }
    await sendCsatSurvey({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      agentId,
      agentName: params.agentName || conversation.assignedTo?.name,
      closedBy:
        params.source === "ai"
          ? "ai"
          : params.source === "inactivity"
            ? "inactivity"
            : "human",
    });
  } catch (err) {
    console.warn(
      "[conversation-close] CSAT failed:",
      err instanceof Error ? err.message : err
    );
  }

  const auditAction =
    params.source === "inactivity"
      ? "conversation.auto_closed_inactivity"
      : params.source === "ai"
        ? "conversation.auto_closed_ai"
        : "conversation.closed_human";

  await audit({
    tenantId: params.tenantId,
    userId: params.userId || null,
    action: auditAction,
    entity: "conversation",
    entityId: params.conversationId,
    metadata: {
      closeReason: params.reason,
      closeSource: params.source,
      closeNote: params.note || null,
      agentId: params.agentId || null,
      previousStatus: before.status,
      closedAt: conversation.closedAt,
    },
  });

  // Sinal de aprendizado (somente se continuous learning on — gate interno)
  if (params.source === "ai" || params.source === "inactivity") {
    try {
      const { recordLearningSuggestion } = await import("./agent-learning");
      await recordLearningSuggestion({
        tenantId: params.tenantId,
        agentId: params.agentId,
        kind: "pattern",
        title:
          params.source === "ai"
            ? "Atendimento concluído pela IA"
            : "Atendimento encerrado por inatividade",
        content: `Conversa ${params.conversationId} · motivo ${reasonLabel}`,
        source: params.source === "ai" ? "ai_close" : "inactivity",
        sourceKey: "aiAttendance",
        metadata: {
          conversationId: params.conversationId,
          closeReason: params.reason,
        },
      });
    } catch {
      /* learning opcional */
    }
  }

  broadcastToTenant(params.tenantId, "conversation.updated", conversation);

  try {
    const { emitWebhookEvent } = await import("./webhooks/dispatch");
    emitWebhookEvent({
      tenantId: params.tenantId,
      type: "conversation.closed",
      data: {
        conversation: {
          id: conversation.id,
          status: conversation.status,
          closeReason: conversation.closeReason,
          closeSource: conversation.closeSource,
          contactId: conversation.contactId,
        },
      },
    });
  } catch {
    /* webhook opcional */
  }

  return { ok: true as const, conversation, skipped: false as const };
}

export async function reopenConversation(params: {
  tenantId: string;
  conversationId: string;
  userId?: string | null;
  reason?: string;
}) {
  const before = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
  });
  if (!before) return null;
  if (before.status === "OPEN" || before.status === "PENDING") return before;

  const conversation = await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      status: "OPEN",
      closedAt: null,
      closeReason: null,
      closeSource: null,
      closedById: null,
      closeNote: null,
      isUnread: true,
    },
    include: { contact: true, channel: true },
  });

  await postSystemEvent({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    content: "Atendimento reaberto",
    eventKind: "attendance_reopened",
    meta: { reason: params.reason || "inbound" },
  });

  await audit({
    tenantId: params.tenantId,
    userId: params.userId || null,
    action: "conversation.reopened",
    entity: "conversation",
    entityId: params.conversationId,
    metadata: { reason: params.reason || "inbound", previousStatus: before.status },
  });

  broadcastToTenant(params.tenantId, "conversation.updated", conversation);

  try {
    const { emitWebhookEvent } = await import("./webhooks/dispatch");
    emitWebhookEvent({
      tenantId: params.tenantId,
      type: "conversation.reopened",
      data: {
        conversation: {
          id: conversation.id,
          contactId: conversation.contactId,
          reason: params.reason || "inbound",
        },
      },
    });
  } catch {
    /* ignore */
  }

  return conversation;
}

// ── Inatividade ──────────────────────────────────────────────

export async function runInactivityAutoClose(opts?: {
  limitPerTenant?: number;
}): Promise<{ closed: number; scanned: number }> {
  const limitPerTenant = opts?.limitPerTenant ?? 40;
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, settings: true },
    take: 500,
  });

  let closed = 0;
  let scanned = 0;

  for (const t of tenants) {
    const cfg = parseAttendanceCloseConfig(
      (t.settings as { attendance?: unknown } | null)?.attendance
    );
    if (!cfg.inactivity.enabled) continue;

    const cutoff = new Date(Date.now() - cfg.inactivity.timeoutMinutes * 60_000);
    // Candidatos: abertos, última atividade antiga
    const candidates = await prisma.conversation.findMany({
      where: {
        tenantId: t.id,
        status: { in: ["OPEN", "PENDING"] },
        OR: [
          { lastMessageAt: { lt: cutoff } },
          { lastMessageAt: null, createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take: limitPerTenant,
      orderBy: { lastMessageAt: "asc" },
    });

    for (const c of candidates) {
      scanned += 1;
      const eligible = await isEligibleForInactivityClose({
        tenantId: t.id,
        conversationId: c.id,
        cutoff,
      });
      if (!eligible) continue;

      const result = await closeConversation({
        tenantId: t.id,
        conversationId: c.id,
        source: "inactivity",
        reason: "NO_RESPONSE",
        sendNotice: cfg.inactivity.sendCloseMessage,
        noticeText: cfg.inactivity.sendCloseMessage
          ? cfg.inactivity.closeMessage
          : null,
      });
      if (result.ok && !("skipped" in result && result.skipped)) closed += 1;
    }
  }

  return { closed, scanned };
}

async function isEligibleForInactivityClose(params: {
  tenantId: string;
  conversationId: string;
  cutoff: Date;
}): Promise<boolean> {
  const lastInbound = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      direction: "INBOUND",
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const lastAny = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      direction: { in: ["INBOUND", "OUTBOUND"] },
    },
    orderBy: { createdAt: "desc" },
    select: { direction: true, createdAt: true, metadata: true },
  });

  // Sem mensagens → não encerra
  if (!lastAny) return false;

  // Cliente ainda aguarda resposta (última msg é inbound)
  if (lastAny.direction === "INBOUND") return false;

  // Contador: última mensagem do cliente deve ser anterior ao cutoff
  // (empresa falou por último e cliente parou de responder)
  if (lastInbound && lastInbound.createdAt > params.cutoff) return false;
  if (!lastInbound && lastAny.createdAt > params.cutoff) return false;

  // Não contar só aviso de sistema recente como “atividade real” do lado empresa
  // se a última for system notice e inbound ainda for recente — já coberto acima

  const blockers = await getAutoCloseBlockers({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
  });
  return blockers.length === 0;
}

// ── Encerramento inteligente (IA) ────────────────────────────

export type ClosureSignal = {
  shouldClose: boolean;
  confidence: "low" | "medium" | "high";
  reason: string;
};

/**
 * Heurística conservadora — sem chain-of-thought persistido.
 * Só high conf. em padrões claros de conclusão + sem pendências.
 */
export function detectConversationClosure(params: {
  lastClientMessages: string[];
  lastAgentMessages: string[];
  hasHumanAssignee: boolean;
  hasPendingApproval: boolean;
  openCriticalTasks: boolean;
}): ClosureSignal {
  if (
    params.hasPendingApproval ||
    params.openCriticalTasks ||
    params.hasHumanAssignee
  ) {
    return {
      shouldClose: false,
      confidence: "low",
      reason: "pendencia_ou_humano",
    };
  }

  const clientBlob = params.lastClientMessages
    .slice(-4)
    .join("\n")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Sinais NEGATIVOS — nunca encerrar
  const negative =
    /reclam|procon|processo|cancelar (o )?contrato|nao (funcion|resolv)|ainda (nao|não)|continua (com )?(o )?problema|aguardando|quando (vai|voces)|estou esperando|ainda preciso|nao foi|nao resolveu|piorou|raiva|absurdo|inaceitavel|cobranca indevida|quero reembolso|falta pagar|boleto|negociar|proposta|orcamento|aguardo retorno/;
  if (negative.test(clientBlob)) {
    return { shouldClose: false, confidence: "low", reason: "unresolved_or_pending" };
  }

  // "ok" / "entendi" sozinhos — fracos
  const weakOnly = /^(ok|okay|blz|beleza|entendi|certo|sim|valeu|👍|👌|tbm|ta|tá)\s*[!.]*$/i;
  const lastClient = (params.lastClientMessages.slice(-1)[0] || "").trim();
  if (weakOnly.test(lastClient) && lastClient.length < 20) {
    return { shouldClose: false, confidence: "low", reason: "weak_ack" };
  }

  // Sinais FORTES de conclusão
  const strong =
    /(era (so|só) isso|era isso|so isso|só isso|pode (fechar|encerrar)|pode finalizar|nao preciso (de )?mais|não preciso (de )?mais|resolvido|resolveu|problema resolvido|obrigad[oa].{0,40}(era isso|ajud|pela ajuda)|valeu.{0,30}(era isso|ajud)|perfeito.{0,20}(era isso|obrigad|valeu)|otimo.{0,20}(era isso|obrigad)|fico no aguardo nao|ate mais|até mais|tchau|flw|falou)/i;

  const medium =
    /(obrigad[oa]|valeu|agrade[cç]o).{0,40}$|muito obrigad|vlw|grato|grata/i;

  if (strong.test(clientBlob)) {
    return { shouldClose: true, confidence: "high", reason: "client_confirmed_done" };
  }
  if (medium.test(lastClient) && lastClient.length > 12) {
    return { shouldClose: true, confidence: "medium", reason: "client_thanks" };
  }

  return { shouldClose: false, confidence: "low", reason: "no_signal" };
}

export async function maybeHandleAiClosure(params: {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  agentName?: string | null;
}): Promise<{ action: "none" | "suggested" | "closed"; signal?: ClosureSignal }> {
  const cfg = await getAttendanceCloseConfig(params.tenantId);
  if (cfg.aiClose.mode === "off") return { action: "none" };

  // Agente pode desativar: tools.autoClose === false
  if (params.agentId) {
    const agent = await prisma.aiAgent.findFirst({
      where: { id: params.agentId, tenantId: params.tenantId },
      select: { tools: true },
    });
    const tools = (agent?.tools || {}) as { autoClose?: boolean | null };
    if (tools.autoClose === false) return { action: "none" };
  }

  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: { assignedToId: true, status: true },
  });
  if (!conv || conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    return { action: "none" };
  }

  const blockers = await getAutoCloseBlockers({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
  });
  // Nunca auto-encerrar fila humana ou chat com humano no comando
  if (
    blockers.includes("waiting_human") ||
    blockers.includes("human_active") ||
    blockers.includes("already_closed")
  ) {
    return { action: "none" };
  }

  const msgs = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      direction: { in: ["INBOUND", "OUTBOUND"] },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { direction: true, content: true },
  });
  const chronological = [...msgs].reverse();
  const lastClient = chronological
    .filter((m) => m.direction === "INBOUND")
    .map((m) => m.content);
  const lastAgent = chronological
    .filter((m) => m.direction === "OUTBOUND")
    .map((m) => m.content);

  const signal = detectConversationClosure({
    lastClientMessages: lastClient,
    lastAgentMessages: lastAgent,
    hasHumanAssignee: Boolean(conv.assignedToId),
    hasPendingApproval: blockers.includes("pending_approval"),
    openCriticalTasks: blockers.includes("open_tasks"),
  });

  if (!signal.shouldClose) return { action: "none", signal };

  if (cfg.aiClose.mode === "suggest" || signal.confidence !== "high") {
    // Evita spam de sugestões
    const recent = await prisma.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: "INTERNAL",
        metadata: { path: ["eventKind"], equals: "close_suggestion" },
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60_000) },
      },
    });
    if (!recent) {
      await postSystemEvent({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        content:
          "Este atendimento parece concluído.\nSugestão: encerrar o atendimento.",
        eventKind: "close_suggestion",
        meta: {
          confidence: signal.confidence,
          signalReason: signal.reason,
          agentId: params.agentId || null,
        },
      });
    }
    return { action: "suggested", signal };
  }

  // mode auto + high confidence
  if (cfg.aiClose.sendFarewell && cfg.aiClose.farewellMessage) {
    // Despedida já pode ter sido a última resposta da IA — se o último outbound
    // não parece despedida, envia farewell como notice customizado no close.
  }

  const result = await closeConversation({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    source: "ai",
    reason: "AI_RESOLVED",
    agentId: params.agentId,
    agentName: params.agentName,
    sendNotice: cfg.aiClose.sendFarewell,
    noticeText: cfg.aiClose.sendFarewell ? cfg.aiClose.farewellMessage : null,
  });

  if (result.ok && !("skipped" in result && result.skipped)) {
    return { action: "closed", signal };
  }
  return { action: "none", signal };
}

/** Resolve conversa para inbound WhatsApp conforme política de reabertura */
export async function resolveConversationForInbound(params: {
  tenantId: string;
  contactId: string;
  channelId?: string | null;
}): Promise<{ conversationId: string; reopened: boolean; created: boolean }> {
  const open = await prisma.conversation.findFirst({
    where: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      status: { in: ["OPEN", "PENDING"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  if (open) {
    return { conversationId: open.id, reopened: false, created: false };
  }

  const cfg = await getAttendanceCloseConfig(params.tenantId);
  if (cfg.reopen.mode === "reopen") {
    const since = new Date(Date.now() - cfg.reopen.windowHours * 3600_000);
    const recentClosed = await prisma.conversation.findFirst({
      where: {
        tenantId: params.tenantId,
        contactId: params.contactId,
        status: { in: ["CLOSED", "ARCHIVED"] },
        closedAt: { gte: since },
      },
      orderBy: { closedAt: "desc" },
    });
    if (recentClosed) {
      const reopened = await reopenConversation({
        tenantId: params.tenantId,
        conversationId: recentClosed.id,
        reason: "inbound_within_window",
      });
      if (reopened) {
        if (params.channelId) {
          await prisma.conversation.update({
            where: { id: reopened.id },
            data: { channelId: params.channelId },
          });
        }
        return { conversationId: reopened.id, reopened: true, created: false };
      }
    }
  }

  const created = await prisma.conversation.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      channelId: params.channelId || undefined,
      status: "OPEN",
      isUnread: true,
    },
  });
  return { conversationId: created.id, reopened: false, created: true };
}

// ── Scheduler ────────────────────────────────────────────────

let inactivityTimer: ReturnType<typeof setInterval> | null = null;

export function startInactivityCloseScheduler(opts?: {
  intervalMs?: number;
  log?: (msg: string) => void;
}) {
  const intervalMs = opts?.intervalMs ?? 5 * 60 * 1000;
  const log = opts?.log ?? console.info;
  if (inactivityTimer) return;

  const tick = () => {
    void runInactivityAutoClose()
      .then((r) => {
        if (r.closed > 0) {
          log(
            `[inactivity-close] closed=${r.closed} scanned=${r.scanned}`
          );
        }
      })
      .catch((err) => {
        console.warn(
          "[inactivity-close] failed:",
          err instanceof Error ? err.message : err
        );
      });
  };

  setTimeout(tick, 90_000);
  inactivityTimer = setInterval(tick, intervalMs);
  if (typeof inactivityTimer.unref === "function") inactivityTimer.unref();
}

export function stopInactivityCloseScheduler() {
  if (inactivityTimer) {
    clearInterval(inactivityTimer);
    inactivityTimer = null;
  }
}
