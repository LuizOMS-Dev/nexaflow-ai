/**
 * Runtime seguro de tools do Agente NexaFlow.
 * - Schema estruturado (nunca texto livre destrutivo)
 * - Valida tenant + permissões do agente
 * - Reutiliza Prisma/services existentes
 * - Ações sensíveis bloqueadas ou NEEDS_APPROVAL
 */
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { AppError } from "../lib/errors";

export const SAFE_TOOLS = [
  "get_contact",
  "update_contact",
  "update_commercial_status",
  "update_priority",
  "set_next_action",
  "update_score",
  "create_opportunity",
  "update_opportunity",
  "move_opportunity",
  "create_task",
  "create_note",
  "transfer_conversation",
  "request_human",
] as const;

export type SafeToolName = (typeof SAFE_TOOLS)[number];

/** Nunca disponíveis para automação do agente */
export const BLOCKED_TOOLS = [
  "delete_contact",
  "delete_opportunity",
  "manage_users",
  "cancel_subscription",
  "register_payment",
  "change_contract",
  "grant_discount",
] as const;

const TOOL_ALIASES: Record<string, SafeToolName> = {
  consult_contact: "get_contact",
  update_status: "update_commercial_status",
  create_opportunity: "create_opportunity",
  transfer: "transfer_conversation",
  transfer_attendance: "transfer_conversation",
  request_human: "request_human",
  create_note: "create_note",
  create_task: "create_task",
  set_next_action: "set_next_action",
  update_priority: "update_priority",
  update_contact: "update_contact",
};

export type ToolContext = {
  tenantId: string;
  agentId: string;
  conversationId?: string | null;
  contactId?: string | null;
  userId?: string | null;
  /** AUTO = executa se permitido; APPROVE_ACTION = só se não requiresApproval */
  source?: "auto" | "suggest" | "manual" | "sandbox";
};

export type ToolCall = {
  tool: string;
  args?: Record<string, unknown>;
};

function normalizeToolName(raw: string): string {
  const t = (raw || "").trim();
  if (TOOL_ALIASES[t]) return TOOL_ALIASES[t];
  return t;
}

function agentAllowsTool(
  toolsJson: unknown,
  toolName: string
): { allowed: boolean; requireApproval: boolean } {
  if (BLOCKED_TOOLS.includes(toolName as (typeof BLOCKED_TOOLS)[number])) {
    return { allowed: false, requireApproval: true };
  }
  const tools = (toolsJson || {}) as {
    allowed?: string[];
    blocked?: string[];
    requireApproval?: string[];
  };
  const blocked = new Set((tools.blocked || []).map(normalizeToolName));
  if (blocked.has(toolName)) return { allowed: false, requireApproval: true };

  const allowedList = (tools.allowed || []).map(normalizeToolName);
  // Sem lista = defaults seguros (consulta + CRM leve + handoff)
  const defaults = [
    "get_contact",
    "update_contact",
    "update_commercial_status",
    "update_priority",
    "set_next_action",
    "create_task",
    "create_note",
    "transfer_conversation",
    "request_human",
  ];
  const allowed = new Set(allowedList.length ? allowedList.map(normalizeToolName) : defaults);
  // Aliases na lista allowed
  for (const a of allowedList) {
    allowed.add(normalizeToolName(a));
  }

  if (!allowed.has(toolName) && !SAFE_TOOLS.includes(toolName as SafeToolName)) {
    return { allowed: false, requireApproval: false };
  }
  if (!allowed.has(toolName)) return { allowed: false, requireApproval: false };

  const needApproval = new Set((tools.requireApproval || []).map(normalizeToolName));
  // Oportunidades em AUTO pedem cuidado — default requireApproval se listado
  if (toolName === "create_opportunity" && needApproval.size === 0) {
    /* permitido se em allowed */
  }
  return { allowed: true, requireApproval: needApproval.has(toolName) };
}

async function resolveContactId(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<string | null> {
  if (typeof args.contactId === "string" && args.contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: args.contactId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    return c?.id || null;
  }
  if (ctx.contactId) return ctx.contactId;
  if (ctx.conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: ctx.conversationId, tenantId: ctx.tenantId },
      select: { contactId: true },
    });
    return conv?.contactId || null;
  }
  return null;
}

export async function executeAgentTool(
  ctx: ToolContext,
  rawTool: string,
  rawArgs: Record<string, unknown> = {}
): Promise<{
  ok: boolean;
  status: string;
  toolName: string;
  result?: unknown;
  error?: string;
  executionId?: string;
}> {
  const toolName = normalizeToolName(rawTool);
  const args = rawArgs || {};

  if (ctx.source === "sandbox") {
    return {
      ok: true,
      status: "SUCCESS",
      toolName,
      result: { simulated: true, tool: toolName, args },
    };
  }

  if (BLOCKED_TOOLS.includes(toolName as (typeof BLOCKED_TOOLS)[number])) {
    return { ok: false, status: "REJECTED", toolName, error: "Ferramenta bloqueada por segurança" };
  }
  if (!SAFE_TOOLS.includes(toolName as SafeToolName)) {
    return { ok: false, status: "REJECTED", toolName, error: "Ferramenta desconhecida" };
  }

  const agent = await prisma.aiAgent.findFirst({
    where: { id: ctx.agentId, tenantId: ctx.tenantId },
  });
  if (!agent) {
    return { ok: false, status: "FAILED", toolName, error: "Agente não encontrado" };
  }

  const perm = agentAllowsTool(agent.tools, toolName);
  if (!perm.allowed) {
    return { ok: false, status: "REJECTED", toolName, error: "Agente sem permissão para esta ferramenta" };
  }

  const exec = await prisma.agentToolExecution.create({
    data: {
      tenantId: ctx.tenantId,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId || undefined,
      contactId: (typeof args.contactId === "string" && args.contactId) || ctx.contactId || undefined,
      toolName,
      input: asInputJson(args),
      status: perm.requireApproval ? "NEEDS_APPROVAL" : "RUNNING",
      requiresApproval: perm.requireApproval,
    },
  });

  if (perm.requireApproval) {
    return {
      ok: false,
      status: "NEEDS_APPROVAL",
      toolName,
      executionId: exec.id,
      error: "Ação requer aprovação humana",
    };
  }

  try {
    const result = await runTool(ctx, toolName as SafeToolName, args);
    await prisma.agentToolExecution.update({
      where: { id: exec.id },
      data: {
        status: "SUCCESS",
        result: asInputJson(result),
        completedAt: new Date(),
        contactId: (result as { contactId?: string })?.contactId || exec.contactId,
      },
    });
    return { ok: true, status: "SUCCESS", toolName, result, executionId: exec.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na tool";
    await prisma.agentToolExecution.update({
      where: { id: exec.id },
      data: {
        status: "FAILED",
        error: message.slice(0, 500),
        completedAt: new Date(),
      },
    });
    return { ok: false, status: "FAILED", toolName, error: message, executionId: exec.id };
  }
}

async function runTool(
  ctx: ToolContext,
  toolName: SafeToolName,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "get_contact": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          company: true,
          commercialStatus: true,
          priority: true,
          score: true,
          nextAction: true,
          nextActionDueAt: true,
        },
      });
      if (!contact) throw new AppError("Contato não encontrado", 404);
      return { contact };
    }
    case "update_contact": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const fields = z
        .object({
          name: z.string().min(1).optional(),
          email: z.string().email().optional().nullable(),
          company: z.string().optional().nullable(),
          city: z.string().optional().nullable(),
        })
        .parse(args.fields || args);
      const contact = await prisma.contact.update({
        where: { id: contactId },
        data: fields,
        select: { id: true, name: true, email: true, company: true, city: true },
      });
      return { contact, contactId };
    }
    case "update_commercial_status": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const commercialStatus = z
        .enum([
          "NOVO",
          "EM_ANALISE",
          "QUALIFICADO",
          "NAO_QUALIFICADO",
          "EM_NEGOCIACAO",
          "CLIENTE",
          "PERDIDO",
          "NUTRICAO",
        ])
        .parse(args.commercialStatus || args.status);
      await prisma.contact.update({
        where: { id: contactId },
        data: { commercialStatus },
      });
      return { contactId, commercialStatus };
    }
    case "update_priority": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const priority = z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]).parse(args.priority);
      await prisma.contact.update({ where: { id: contactId }, data: { priority } });
      return { contactId, priority };
    }
    case "set_next_action": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const nextAction = z.string().min(1).max(500).parse(args.nextAction || args.action);
      const nextActionDueAt = args.dueAt
        ? new Date(String(args.dueAt))
        : args.nextActionDueAt
          ? new Date(String(args.nextActionDueAt))
          : undefined;
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          nextAction,
          ...(nextActionDueAt && !Number.isNaN(nextActionDueAt.getTime())
            ? { nextActionDueAt }
            : {}),
        },
      });
      return { contactId, nextAction };
    }
    case "update_score": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const score = z.number().int().min(0).max(100).parse(args.score);
      const prev = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: ctx.tenantId },
        select: { score: true },
      });
      await prisma.contact.update({
        where: { id: contactId },
        data: { score, scoreUpdatedAt: new Date() },
      });
      await prisma.contactScoreHistory.create({
        data: {
          tenantId: ctx.tenantId,
          contactId,
          previousScore: prev?.score ?? 0,
          newScore: score,
          source: "AI",
          note: "Atualizado por ferramenta do agente",
        },
      });
      return { contactId, score };
    }
    case "create_opportunity": {
      const contactId = await resolveContactId(ctx, args);
      if (!contactId) throw new AppError("Contato não encontrado", 404);
      const title = z.string().min(1).max(200).parse(args.title || args.name || "Oportunidade");
      const value =
        args.value != null ? z.number().nonnegative().parse(Number(args.value)) : undefined;
      let stageId = typeof args.stageId === "string" ? args.stageId : undefined;
      let pipelineId: string | undefined =
        typeof args.pipelineId === "string" ? args.pipelineId : undefined;
      if (!stageId || !pipelineId) {
        const pipeline = await prisma.pipeline.findFirst({
          where: { tenantId: ctx.tenantId },
          include: { stages: { orderBy: { position: "asc" }, take: 1 } },
        });
        stageId = stageId || pipeline?.stages[0]?.id;
        pipelineId = pipelineId || pipeline?.id;
      }
      if (!stageId || !pipelineId) throw new AppError("Nenhum funil/estágio configurado", 400);
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: stageId, pipeline: { tenantId: ctx.tenantId } },
      });
      if (!stage) throw new AppError("Estágio inválido", 400);
      const opp = await prisma.opportunity.create({
        data: {
          tenantId: ctx.tenantId,
          pipelineId,
          contactId,
          stageId,
          title,
          value: value ?? 0,
          status: "OPEN",
        },
      });
      return { opportunityId: opp.id, contactId, title };
    }
    case "update_opportunity": {
      const opportunityId = z.string().min(1).parse(args.opportunityId || args.id);
      const opp = await prisma.opportunity.findFirst({
        where: { id: opportunityId, tenantId: ctx.tenantId },
      });
      if (!opp) throw new AppError("Oportunidade não encontrada", 404);
      const title = args.title != null ? z.string().min(1).max(200).parse(args.title) : undefined;
      const value =
        args.value != null ? z.number().nonnegative().parse(Number(args.value)) : undefined;
      const updated = await prisma.opportunity.update({
        where: { id: opportunityId },
        data: {
          ...(title ? { title } : {}),
          ...(value != null ? { value } : {}),
        },
      });
      return { opportunityId: updated.id, title: updated.title };
    }
    case "move_opportunity": {
      const opportunityId = z.string().min(1).parse(args.opportunityId || args.id);
      const stageId = z.string().min(1).parse(args.stageId);
      const opp = await prisma.opportunity.findFirst({
        where: { id: opportunityId, tenantId: ctx.tenantId },
      });
      if (!opp) throw new AppError("Oportunidade não encontrada", 404);
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: stageId, pipeline: { tenantId: ctx.tenantId } },
      });
      if (!stage) throw new AppError("Estágio inválido", 400);
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: { stageId },
      });
      await prisma.opportunityHistory.create({
        data: {
          opportunityId,
          fromStageId: opp.stageId,
          toStageId: stageId,
          action: "STAGE_CHANGE",
          note: "Movido por agente de IA",
        },
      });
      return { opportunityId, stageId };
    }
    case "create_task": {
      const title = z.string().min(1).max(200).parse(args.title);
      const contactId = await resolveContactId(ctx, args);
      const dueAt = args.dueAt ? new Date(String(args.dueAt)) : undefined;
      const task = await prisma.task.create({
        data: {
          tenantId: ctx.tenantId,
          title,
          description: typeof args.description === "string" ? args.description : undefined,
          contactId: contactId || undefined,
          conversationId: ctx.conversationId || undefined,
          status: "TODO",
          priority: "MEDIUM",
          dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : undefined,
          assigneeId: ctx.userId || undefined,
        },
      });
      return { taskId: task.id, title: task.title, contactId };
    }
    case "create_note": {
      const content = z.string().min(1).max(5000).parse(args.content || args.note);
      if (!ctx.conversationId) throw new AppError("Conversa necessária para nota", 400);
      const authorId = ctx.userId;
      if (!authorId) {
        // nota interna precisa de author — grava message INTERNAL sem author se necessário
        const msg = await prisma.message.create({
          data: {
            conversationId: ctx.conversationId,
            direction: "INTERNAL",
            content: `[IA] ${content}`,
            isAiGenerated: true,
            metadata: asInputJson({ agentId: ctx.agentId, tool: "create_note" }),
          },
        });
        return { messageId: msg.id, note: content };
      }
      const note = await prisma.note.create({
        data: {
          conversationId: ctx.conversationId,
          authorId,
          content: `[IA] ${content}`,
          tenantId: ctx.tenantId,
        },
      });
      return { noteId: note.id, content };
    }
    case "transfer_conversation":
    case "request_human": {
      if (!ctx.conversationId) throw new AppError("Conversa necessária", 400);
      const assigneeId =
        typeof args.assigneeId === "string" && args.assigneeId ? args.assigneeId : null;

      // Assignee específico (opcional) — senão fila geral
      if (assigneeId) {
        await prisma.conversation.update({
          where: { id: ctx.conversationId },
          data: { status: "PENDING", assignedToId: assigneeId },
        });
      }

      const agent = ctx.agentId
        ? await prisma.aiAgent.findFirst({
            where: { id: ctx.agentId, tenantId: ctx.tenantId },
            select: { name: true, transferRules: true },
          })
        : null;
      const rules = (agent?.transferRules || {}) as {
        destination?: string;
        handoffMessage?: string | null;
      };

      const { handoffToHumanQueue } = await import("./human-handoff");
      const conv = await prisma.conversation.findFirst({
        where: { id: ctx.conversationId, tenantId: ctx.tenantId },
        select: { contact: { select: { name: true } } },
      });

      await handoffToHumanQueue({
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        agentId: ctx.agentId,
        agentName: agent?.name || null,
        contactName: conv?.contact?.name || null,
        reason: toolName === "request_human" ? "request_human" : "transfer_conversation",
        reasonLabel:
          toolName === "request_human"
            ? `${agent?.name || "O agente"} pediu um atendente humano para continuar a conversa`
            : "Atendimento transferido para a equipe",
        source: "ai_tool",
        destination: rules.destination || "queue",
      });

      // Se havia assignee específico e handoff limpou assignedToId, reatribui
      if (assigneeId) {
        await prisma.conversation.update({
          where: { id: ctx.conversationId },
          data: { assignedToId: assigneeId, status: "PENDING" },
        });
      }

      return {
        conversationId: ctx.conversationId,
        status: "PENDING",
        assigneeId,
        handoff: true,
        notified: true,
      };
    }
    default:
      throw new AppError("Tool não implementada", 400);
  }
}

/** Executa lista de tool calls em sequência (para AUTO / suggest) */
export async function executeAgentToolCalls(
  ctx: ToolContext,
  calls: ToolCall[]
): Promise<Array<{ tool: string; ok: boolean; status: string; result?: unknown; error?: string }>> {
  const out: Array<{
    tool: string;
    ok: boolean;
    status: string;
    result?: unknown;
    error?: string;
  }> = [];
  for (const call of calls.slice(0, 5)) {
    const r = await executeAgentTool(ctx, call.tool, call.args || {});
    out.push({
      tool: r.toolName,
      ok: r.ok,
      status: r.status,
      result: r.result,
      error: r.error,
    });
    // handoff: para demais tools
    if (r.ok && (r.toolName === "request_human" || r.toolName === "transfer_conversation")) {
      break;
    }
  }
  return out;
}
