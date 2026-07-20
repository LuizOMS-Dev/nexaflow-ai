/**
 * Handoff para fila humana — motor central de orquestração IA ↔ humano.
 * Usado por: regras de handoff do agente, tools request_human, degradação de IA,
 * assume atômico, transferir, retomar IA.
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { AppError } from "../lib/errors";
import { createNotification } from "./notifications";
import { broadcastToTenant } from "../ws/hub";

export type HandoffSource =
  | "ai_rule"
  | "ai_tool"
  | "ai_reply"
  | "platform_degradation";

export type HandoffMatch = {
  trigger: string;
  label: string;
};

/** Matchers por id de regra do formulário do agente (+ custom = string livre). */
const TRIGGER_DEFS: Record<
  string,
  { label: string; customer?: RegExp; reply?: RegExp }
> = {
  humano: {
    label: "Pediu atendente humano",
    customer:
      /\b(humano|atendente|pessoa\s+real|falar\s+com\s+(algu[eé]m|uma\s+pessoa|um\s+atendente|a\s+equipe)|quero\s+(um\s+)?(atendente|humano)|suporte\s+humano|me\s+passa\s+(pra|para)\s+(um\s+)?(humano|atendente)|encaminha|transfer)/i,
  },
  nao_sabe: {
    label: "IA sem informação confiável",
    // só pelo texto da resposta da IA (não pelo cliente)
    reply:
      /\b(n[aã]o\s+(tenho|encontrei|possuo|sei)\s+(essa\s+)?(informa[cç][aã]o|dado)|n[aã]o\s+tenho\s+acesso|preciso\s+confirmar\s+com\s+a\s+equipe|n[aã]o\s+consta\s+nos\s+(meus\s+)?dados|sem\s+essa\s+informa[cç][aã]o)\b/i,
  },
  reclamacao: {
    label: "Reclamação / insatisfação",
    customer:
      /\b(reclama[cç][aã]o|reclamar|p[eé]ssim[oa]|horr[ií]vel|absurdo|cancelar|quero\s+cancelar|procon|processar|inaceit[aá]vel|indignad|raiva|furios)/i,
  },
  compra: {
    label: "Intenção de compra",
    customer:
      /\b(quero\s+comprar|fechar\s+(o\s+)?pedido|contratar|assine|assinatura|fechamos|pode\s+fechar|quero\s+o\s+plano|vou\s+querer)\b/i,
  },
  negociacao: {
    label: "Negociação / desconto",
    customer:
      /\b(desconto|negociar|negocia[cç][aã]o|proposta\s+comercial|condi[cç][aã]o\s+especial|abaixar\s+o\s+pre[cç]o|melhor\s+pre[cç]o|or[cç]amento\s+especial)\b/i,
  },
  urgencia: {
    label: "Urgência",
    customer:
      /\b(urgente|urg[eê]ncia|agora\s+mesmo|imediat|hoje\s+ainda|prazo\s+cr[ií]tico|n[aã]o\s+pode\s+esperar|emerg[eê]ncia)\b/i,
  },
  juridico: {
    label: "Jurídico / LGPD",
    customer:
      /\b(jur[ií]dic|advogad|contrato|lgpd|gdpr|privacidade|dados\s+pessoais|compliance|processo\s+legal)\b/i,
  },
  pagamento: {
    label: "Pagamento / cobrança",
    customer:
      /\b(pagament|boleto|fatura|cobran[cç]a|estorno|reembolso|cart[aã]o\s+recus|n[aã]o\s+consigo\s+pagar|pix\s+n[aã]o)\b/i,
  },
  tecnico: {
    label: "Problema técnico",
    customer:
      /\b(bug|erro\s+t[eé]cnic|n[aã]o\s+funciona|travou|fora\s+do\s+ar|problema\s+t[eé]cnic|falha\s+no\s+sistema|quebrou)\b/i,
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Copy da notificação in-app quando a IA pede que um humano assuma.
 * Foco na ação (Assumir) e no cliente — sem jargão técnico.
 */
export function buildHandoffNotificationCopy(params: {
  agentLabel: string;
  contactLabel: string;
  reason?: string;
  reasonLabel?: string;
  source?: HandoffSource;
}): { title: string; body: string } {
  const agent = (params.agentLabel || "O agente de IA").trim() || "O agente de IA";
  const contact = (params.contactLabel || "um cliente").trim() || "um cliente";
  const reason = (params.reason || "").toLowerCase();
  const reasonLabel = (params.reasonLabel || "").trim();
  const source = params.source;

  // Título curto e acionável no sino
  let title = "Assumir atendimento";
  if (source === "ai_tool" || reason === "request_human" || /humano|atendente|equipe/i.test(reasonLabel)) {
    title = "IA pediu para você assumir";
  } else if (/reclama|insatisf/i.test(reasonLabel) || reason === "reclamacao") {
    title = "Cliente insatisfeito — assumir";
  } else if (/urgente|urgência/i.test(reasonLabel) || reason === "urgencia") {
    title = "Urgente — assumir agora";
  } else if (/compra|negoci/i.test(reasonLabel) || reason === "compra" || reason === "negociacao") {
    title = "Oportunidade — assumir atendimento";
  }

  // Motivo em linguagem humana (1 frase)
  let why = reasonLabel;
  if (!why || /ia solicitou atendimento humano/i.test(why)) {
    why = `${agent} pediu ajuda de um atendente humano`;
  } else if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕ]/.test(why) && agent) {
    // "Pediu atendente humano" → contextualiza com o agente
    if (source === "ai_tool" || source === "ai_rule" || source === "ai_reply") {
      why = `${agent}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
    }
  }

  const body = `${why}. Conversa com ${contact} na fila — abra e toque em Assumir.`;

  return {
    title: title.slice(0, 80),
    body: body.slice(0, 220),
  };
}

/**
 * Avalia regras de handoff do agente contra mensagem do cliente e/ou resposta da IA.
 */
export function matchHandoffTriggers(params: {
  customerMessage: string;
  aiReply?: string | null;
  triggers?: string[] | null;
}): HandoffMatch | null {
  const triggers =
    Array.isArray(params.triggers) && params.triggers.length
      ? params.triggers
      : ["humano", "nao_sabe"];
  const customer = (params.customerMessage || "").trim();
  const reply = (params.aiReply || "").trim();

  for (const raw of triggers) {
    const id = String(raw || "").trim();
    if (!id || id === "outro") continue;

    const def = TRIGGER_DEFS[id];
    if (def) {
      if (def.customer && customer && def.customer.test(customer)) {
        return { trigger: id, label: def.label };
      }
      if (def.reply && reply && def.reply.test(reply)) {
        return { trigger: id, label: def.label };
      }
      continue;
    }

    // Trigger customizado (texto livre do formulário)
    if (id.length >= 3 && customer) {
      try {
        const re = new RegExp(escapeRegExp(id), "i");
        if (re.test(customer)) {
          return { trigger: id, label: `Regra: ${id.slice(0, 48)}` };
        }
      } catch {
        if (customer.toLowerCase().includes(id.toLowerCase())) {
          return { trigger: id, label: `Regra: ${id.slice(0, 48)}` };
        }
      }
    }
  }

  // IA disse que vai transferir (mesmo sem trigger explícito de texto do cliente)
  if (
    reply &&
    /\b(vou\s+(te\s+)?(passar|encaminhar|transferir)|encaminh(o|ando)|transfer(o|indo)|algu[eé]m\s+da\s+(nossa\s+)?equipe\s+(vai|j[aá])|atendente\s+(humano\s+)?(vai|j[aá])|fila\s+(de\s+)?atendimento)\b/i.test(
      reply
    )
  ) {
    return { trigger: "ai_reply_handoff", label: "IA indicou transferência" };
  }

  return null;
}

export type HandoffParams = {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  agentName?: string | null;
  contactName?: string | null;
  /** id da regra ou reason de degradação */
  reason: string;
  reasonLabel: string;
  source: HandoffSource;
  destination?: string | null;
  /** se true, não recria notice se já houver handoff recente */
  dedupeMinutes?: number;
  /**
   * Se true (padrão para regras/pedido do cliente/tool), entra na fila "Assumir chat".
   * false = registro interno sem banner de Assumir (ex.: degradação sem créditos).
   */
  requiresAssume?: boolean;
};

/**
 * Coloca conversa na fila humana, registra evento e notifica a equipe no painel.
 */
export async function handoffToHumanQueue(
  params: HandoffParams
): Promise<{ ok: boolean; alreadyQueued: boolean }> {
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: {
      id: true,
      assignedToId: true,
      status: true,
      contact: { select: { name: true } },
    },
  });
  if (!conv) return { ok: false, alreadyQueued: false };

  // Humano já no comando → não re-notifica em loop
  if (conv.assignedToId) {
    return { ok: true, alreadyQueued: true };
  }

  const dedupeMs = (params.dedupeMinutes ?? 8) * 60_000;
  const recent = await prisma.message.findFirst({
    where: {
      conversationId: params.conversationId,
      metadata: { path: ["humanHandoff"], equals: true },
      createdAt: { gte: new Date(Date.now() - dedupeMs) },
    },
    orderBy: { createdAt: "desc" },
  });

  const alreadyQueued =
    Boolean(recent) &&
    (conv.status === "PENDING" ||
      (recent?.metadata as { waitingHuman?: boolean } | null)?.waitingHuman === true);

  // Pedido real (cliente/IA/tool) ou créditos → Assumir. Demais degradações não.
  const requiresAssume =
    params.requiresAssume !== undefined
      ? params.requiresAssume
      : params.source === "ai_rule" ||
        params.source === "ai_tool" ||
        params.source === "ai_reply";

  if (!recent) {
    if (requiresAssume) {
      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: {
          status: "PENDING",
          assignedToId: null,
          isUnread: true,
        },
      });
    }

    const dest =
      params.destination && params.destination !== "queue"
        ? ` Destino sugerido: ${params.destination}.`
        : "";

    await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "INTERNAL",
        content: requiresAssume
          ? `Fila humana: ${params.reasonLabel}.${dest} Aguardando um atendente assumir.`
          : `Aviso interno: ${params.reasonLabel}.${dest}`,
        isAiGenerated: true,
        type: "SYSTEM",
        metadata: asInputJson({
          systemNotice: true,
          noticeKind:
            params.source === "platform_degradation"
              ? "platform_ai_degradation_handoff"
              : params.source === "ai_tool"
                ? "ai_handoff_request"
                : "ai_rule_handoff",
          humanHandoff: true,
          waitingHuman: requiresAssume,
          requiresAssume,
          assumedByHuman: false,
          agentId: params.agentId || null,
          reason: params.reason,
          reasonLabel: params.reasonLabel,
          destination: params.destination || "queue",
          source: params.source,
        }),
      },
    });
  } else if (requiresAssume && conv.status !== "PENDING") {
    // Garante status de fila mesmo se já havia notice
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { status: "PENDING", assignedToId: null, isUnread: true },
    });
  }

  // Sem Assumir → não notifica equipe na fila (evita "Pendências" falsas)
  if (!requiresAssume) {
    console.log(
      `[handoff] notice only (sem Assumir) conv=${params.conversationId} reason=${params.reason}`
    );
    return { ok: true, alreadyQueued: false };
  }

  // Sempre tenta notificar (dedupe por notificação não lida)
  const contactLabel =
    params.contactName || conv.contact?.name || "Cliente";
  const agentLabel = (params.agentName || "O agente de IA").trim() || "O agente de IA";

  const members = await prisma.membership.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR", "AGENT"] },
    },
    select: { userId: true },
  });

  // Copy clara: ação esperada = Assumir (não jargão técnico)
  const { title, body } = buildHandoffNotificationCopy({
    agentLabel,
    contactLabel,
    reason: params.reason,
    reasonLabel: params.reasonLabel,
    source: params.source,
  });
  const actionUrl = `/app/inbox?c=${params.conversationId}&status=PENDING`;

  await Promise.all(
    members.map((m) =>
      createNotification({
        userId: m.userId,
        tenantId: params.tenantId,
        type: "CONVERSATION_ASSIGNED",
        title,
        body,
        actionUrl,
        entityType: "conversation",
        entityId: params.conversationId,
        metadata: {
          reason: params.reason,
          reasonLabel: params.reasonLabel,
          source: params.source,
          humanHandoff: true,
          waitingHuman: true,
          agentId: params.agentId || null,
          playSound: true,
          kind: "human_queue_assume",
        },
        dedupe: true,
      }).catch(() => null)
    )
  );

  broadcastToTenant(params.tenantId, "conversation.updated", {
    conversationId: params.conversationId,
    status: "PENDING",
    humanHandoff: true,
    waitingHuman: true,
    reason: params.reason,
  });
  // Banner + som no painel escutam este canal
  broadcastToTenant(params.tenantId, "notification.created", {
    conversationId: params.conversationId,
    reason: params.reason,
    reasonLabel: params.reasonLabel,
    waitingHuman: true,
    humanHandoff: true,
    playSound: true,
    kind: "human_queue_assume",
    title,
    body,
    contactName: contactLabel,
    agentName: agentLabel,
  });

  // Resumo curto para o atendente (sem chain-of-thought / sem inventar)
  if (!alreadyQueued && requiresAssume) {
    try {
      const summary = await buildHandoffBriefSummary(params.conversationId);
      if (summary) {
        await prisma.message.create({
          data: {
            conversationId: params.conversationId,
            direction: "INTERNAL",
            type: "SYSTEM",
            content: summary,
            isAiGenerated: true,
            metadata: asInputJson({
              systemNotice: true,
              noticeKind: "handoff_brief",
              humanHandoff: true,
              handoffBrief: true,
              reason: params.reason,
              reasonLabel: params.reasonLabel,
            }),
          },
        });
      }
    } catch {
      /* best-effort */
    }
  }

  console.log(
    `[handoff] queue conv=${params.conversationId} reason=${params.reason} source=${params.source} notify=${members.length}`
  );

  return { ok: true, alreadyQueued };
}

/** Resumo operacional a partir das últimas mensagens (fatos; sem LLM). */
export async function buildHandoffBriefSummary(
  conversationId: string
): Promise<string | null> {
  const msgs = await prisma.message.findMany({
    where: {
      conversationId,
      direction: { in: ["INBOUND", "OUTBOUND"] },
      type: { in: ["TEXT", "TEMPLATE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { direction: true, content: true },
  });
  if (!msgs.length) return null;
  const chronological = [...msgs].reverse();
  const lines = chronological.map((m) => {
    const who = m.direction === "INBOUND" ? "Cliente" : "Empresa";
    const text = (m.content || "").replace(/\s+/g, " ").trim().slice(0, 160);
    return `• ${who}: ${text}`;
  });
  return `Resumo para o atendente (últimas mensagens):\n${lines.join("\n")}`;
}

export type AssumeResult = {
  ok: true;
  conversationId: string;
  assignedToId: string;
  assignedToName: string | null;
  alreadyYours: boolean;
};

/**
 * Assumir atendimento de forma atômica (concorrência segura).
 * Só um humano vence se dois clicarem ao mesmo tempo.
 */
export async function assumeConversationAtomic(params: {
  tenantId: string;
  conversationId: string;
  userId: string;
  /** se true, permite assumir mesmo se outro humano já for responsável (transfer implícito) */
  force?: boolean;
}): Promise<AssumeResult> {
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR", "AGENT"] },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError("Sem permissão para assumir atendimentos nesta empresa.", 403, "FORBIDDEN");
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true },
  });
  if (!user) throw new AppError("Usuário não encontrado", 404, "NOT_FOUND");

  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      contact: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!conv) throw new AppError("Conversa não encontrada", 404, "NOT_FOUND");
  if (conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    throw new AppError("Este atendimento está finalizado. Reabra antes de assumir.", 409, "CONVERSATION_CLOSED");
  }

  if (conv.assignedToId === params.userId) {
    // Já é seu — garante status OPEN
    if (conv.status !== "OPEN") {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { status: "OPEN" },
      });
    }
    return {
      ok: true,
      conversationId: conv.id,
      assignedToId: params.userId,
      assignedToName: user.name,
      alreadyYours: true,
    };
  }

  if (conv.assignedToId && !params.force) {
    const who = conv.assignedTo?.name?.split(" ")[0] || "outro atendente";
    throw new AppError(
      `Este atendimento já foi assumido por ${who}.`,
      409,
      "ALREADY_ASSUMED"
    );
  }

  // Atômico: só assume se ainda sem responsável (ou force + mesmo id atual)
  const whereClause = params.force
    ? { id: conv.id, tenantId: params.tenantId }
    : { id: conv.id, tenantId: params.tenantId, assignedToId: null };

  const updated = await prisma.conversation.updateMany({
    where: whereClause,
    data: {
      assignedToId: params.userId,
      status: "OPEN",
      isUnread: false,
    },
  });

  if (updated.count === 0) {
    // Race: alguém assumiu entre o read e o update
    const again = await prisma.conversation.findFirst({
      where: { id: conv.id, tenantId: params.tenantId },
      select: {
        assignedToId: true,
        assignedTo: { select: { name: true } },
      },
    });
    if (again?.assignedToId === params.userId) {
      return {
        ok: true,
        conversationId: conv.id,
        assignedToId: params.userId,
        assignedToName: user.name,
        alreadyYours: true,
      };
    }
    const who = again?.assignedTo?.name?.split(" ")[0] || "outro atendente";
    throw new AppError(
      `Este atendimento já foi assumido por ${who}.`,
      409,
      "ALREADY_ASSUMED"
    );
  }

  // Marca handoffs ativos como assumidos (não cancela histórico)
  try {
    const openFlags = await prisma.message.findMany({
      where: {
        conversationId: conv.id,
        OR: [
          { metadata: { path: ["waitingHuman"], equals: true } },
          { metadata: { path: ["requiresAssume"], equals: true } },
        ],
      },
      select: { id: true, metadata: true },
      take: 20,
    });
    await Promise.all(
      openFlags.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: {
            metadata: asInputJson({
              ...((m.metadata as Record<string, unknown>) || {}),
              waitingHuman: false,
              requiresAssume: false,
              assumedByHuman: true,
              assumedByUserId: params.userId,
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
      conversationId: conv.id,
      direction: "INTERNAL",
      type: "SYSTEM",
      content: `${user.name || "Atendente"} assumiu o atendimento. A IA permanece pausada neste chat.`,
      isAiGenerated: false,
      authorId: params.userId,
      metadata: asInputJson({
        systemNotice: true,
        noticeKind: "human_takeover",
        assumedByHuman: true,
        agentName: user.name,
        humanHandoff: false,
        waitingHuman: false,
      }),
    },
  });

  broadcastToTenant(params.tenantId, "conversation.updated", {
    conversationId: conv.id,
    id: conv.id,
    status: "OPEN",
    assignedToId: params.userId,
    waitingHuman: false,
  });
  broadcastToTenant(params.tenantId, "notification.created", {
    conversationId: conv.id,
    waitingHuman: false,
    assumed: true,
  });

  console.log(
    `[handoff] assumed conv=${conv.id} by=${params.userId} contact=${conv.contact?.name || "—"}`
  );

  return {
    ok: true,
    conversationId: conv.id,
    assignedToId: params.userId,
    assignedToName: user.name,
    alreadyYours: false,
  };
}

/**
 * Devolver atendimento para a IA (retomada explícita pelo humano).
 * Não reenvia mensagem ao cliente — próxima inbound segue regras do agente.
 */
export async function resumeAiAttendance(params: {
  tenantId: string;
  conversationId: string;
  userId: string;
}): Promise<{ ok: true; conversationId: string }> {
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
    },
  });
  if (!conv) throw new AppError("Conversa não encontrada", 404, "NOT_FOUND");
  if (conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    throw new AppError("Reabra o atendimento antes de retomar a IA.", 409, "CONVERSATION_CLOSED");
  }

  // ADMIN/SUPERVISOR podem devolver mesmo se não forem o responsável
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      isActive: true,
    },
    select: { role: true },
  });
  const elevated = membership?.role === "ADMIN" || membership?.role === "SUPERVISOR";
  if (conv.assignedToId && conv.assignedToId !== params.userId && !elevated) {
    throw new AppError(
      "Somente o responsável atual (ou um administrador) pode devolver para a IA.",
      403,
      "FORBIDDEN"
    );
  }

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      assignedToId: null,
      status: "OPEN",
      isUnread: true,
    },
  });

  // Limpa flags de fila antiga
  try {
    const flags = await prisma.message.findMany({
      where: {
        conversationId: conv.id,
        OR: [
          { metadata: { path: ["waitingHuman"], equals: true } },
          { metadata: { path: ["requiresAssume"], equals: true } },
        ],
      },
      select: { id: true, metadata: true },
      take: 20,
    });
    await Promise.all(
      flags.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: {
            metadata: asInputJson({
              ...((m.metadata as Record<string, unknown>) || {}),
              waitingHuman: false,
              requiresAssume: false,
              resolvedByHumanResume: true,
            }),
          },
        })
      )
    );
  } catch {
    /* best-effort */
  }

  const who = conv.assignedTo?.name?.split(" ")[0] || "Atendente";
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "INTERNAL",
      type: "SYSTEM",
      content: `${who} devolveu o atendimento para a IA. Na próxima mensagem do cliente, o agente poderá responder conforme o modo configurado.`,
      isAiGenerated: false,
      authorId: params.userId,
      metadata: asInputJson({
        systemNotice: true,
        noticeKind: "ai_resumed_by_human",
        aiResumed: true,
        humanHandoff: false,
        waitingHuman: false,
        agentName: conv.assignedTo?.name || null,
      }),
    },
  });

  broadcastToTenant(params.tenantId, "conversation.updated", {
    conversationId: conv.id,
    id: conv.id,
    status: "OPEN",
    assignedToId: null,
    aiResumed: true,
    waitingHuman: false,
  });
  broadcastToTenant(params.tenantId, "notification.created", {
    conversationId: conv.id,
    aiResumed: true,
    waitingHuman: false,
  });

  console.log(`[handoff] resume AI conv=${conv.id} by=${params.userId}`);
  return { ok: true, conversationId: conv.id };
}

/**
 * Transferir para outro humano do mesmo tenant (IA continua pausada).
 */
export async function transferConversationToUser(params: {
  tenantId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  note?: string | null;
}): Promise<{ ok: true; assignedToId: string; assignedToName: string | null }> {
  if (params.fromUserId === params.toUserId) {
    throw new AppError("Escolha outro atendente para transferir.", 400, "BAD_REQUEST");
  }

  const toMember = await prisma.membership.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.toUserId,
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR", "AGENT"] },
    },
    select: { id: true },
  });
  if (!toMember) {
    throw new AppError("Destino inválido: usuário não é atendente ativo desta empresa.", 400, "INVALID_ASSIGNEE");
  }

  const toUser = await prisma.user.findUnique({
    where: { id: params.toUserId },
    select: { id: true, name: true },
  });
  if (!toUser) throw new AppError("Usuário destino não encontrado", 404, "NOT_FOUND");

  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
    },
  });
  if (!conv) throw new AppError("Conversa não encontrada", 404, "NOT_FOUND");
  if (conv.status === "CLOSED" || conv.status === "ARCHIVED") {
    throw new AppError("Não é possível transferir um atendimento finalizado.", 409, "CONVERSATION_CLOSED");
  }

  const fromMembership = await prisma.membership.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.fromUserId,
      isActive: true,
    },
    select: { role: true },
  });
  const elevated =
    fromMembership?.role === "ADMIN" || fromMembership?.role === "SUPERVISOR";
  if (conv.assignedToId && conv.assignedToId !== params.fromUserId && !elevated) {
    throw new AppError(
      "Somente o responsável atual (ou um administrador) pode transferir.",
      403,
      "FORBIDDEN"
    );
  }

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      assignedToId: params.toUserId,
      status: "OPEN",
      isUnread: true,
    },
  });

  const fromName = conv.assignedTo?.name?.split(" ")[0] || "Atendente";
  const toName = toUser.name || "colega";
  const noteBit = params.note?.trim() ? ` Nota: ${params.note.trim().slice(0, 200)}` : "";

  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "INTERNAL",
      type: "SYSTEM",
      content: `${fromName} transferiu o atendimento para ${toName}.${noteBit} A IA continua pausada.`,
      isAiGenerated: false,
      authorId: params.fromUserId,
      metadata: asInputJson({
        systemNotice: true,
        noticeKind: "human_transfer",
        transferredFrom: params.fromUserId,
        transferredTo: params.toUserId,
        agentName: toUser.name,
        humanHandoff: false,
        waitingHuman: false,
        assumedByHuman: true,
      }),
    },
  });

  await createNotification({
    userId: params.toUserId,
    tenantId: params.tenantId,
    type: "CONVERSATION_ASSIGNED",
    title: "Atendimento transferido para você",
    body: `${fromName} transferiu uma conversa. A IA está pausada — continue o atendimento.`,
    actionUrl: `/app/inbox?c=${conv.id}`,
    entityType: "conversation",
    entityId: conv.id,
    dedupe: true,
  }).catch(() => null);

  broadcastToTenant(params.tenantId, "conversation.updated", {
    conversationId: conv.id,
    id: conv.id,
    status: "OPEN",
    assignedToId: params.toUserId,
    transferred: true,
  });

  console.log(
    `[handoff] transfer conv=${conv.id} from=${params.fromUserId} to=${params.toUserId}`
  );

  return {
    ok: true,
    assignedToId: params.toUserId,
    assignedToName: toUser.name,
  };
}
