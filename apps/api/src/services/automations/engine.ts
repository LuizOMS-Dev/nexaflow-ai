import type { LeadStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asInputJson } from "../../lib/json";

/**
 * Motor leve de automações (event-driven).
 *
 * Gatilhos (trigger.type | trigger.event):
 * - message.received | inbound_message | conversation.message
 * - conversation.created
 * - lead.status_changed
 *
 * Ações (definition.actions[]):
 * - create_task { title?, body?, dueHours? }
 * - set_lead_status { status }  → Contact.commercialStatus
 * - add_tag { tag }            → Tag + ContactTag
 * - notify_internal { title?, body? }
 */

export type AutomationEventType =
  | "message.received"
  | "conversation.created"
  | "lead.status_changed";

export type AutomationEvent = {
  type: AutomationEventType;
  tenantId: string;
  conversationId?: string;
  contactId?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
};

type TriggerShape = {
  type?: string;
  event?: string;
  conditions?: Array<{ field?: string; op?: string; value?: unknown }>;
};

type ActionShape = {
  type?: string;
  title?: string;
  body?: string;
  status?: string;
  tag?: string;
  dueHours?: number;
};

const LEAD_STATUSES = new Set<string>([
  "NOVO",
  "EM_ANALISE",
  "QUALIFICADO",
  "NAO_QUALIFICADO",
  "EM_NEGOCIACAO",
  "CLIENTE",
  "PERDIDO",
  "NUTRICAO",
]);

function triggerMatches(trigger: unknown, event: AutomationEvent): boolean {
  const t = (trigger || {}) as TriggerShape;
  const kind = (t.type || t.event || "").toString().toLowerCase();
  if (!kind || kind === "*" || kind === "any") return true;

  const aliases: Record<string, string[]> = {
    "message.received": [
      "message.received",
      "inbound_message",
      "conversation.message",
      "message",
    ],
    "conversation.created": ["conversation.created", "new_conversation"],
    "lead.status_changed": ["lead.status_changed", "lead_status", "contact.status"],
  };
  const accepted = aliases[event.type] || [event.type];
  if (!accepted.some((a) => kind === a || kind.includes(a))) return false;

  const conditions = Array.isArray(t.conditions) ? t.conditions : [];
  for (const c of conditions) {
    const field = c.field || "";
    const expected = c.value;
    const actual = event.payload?.[field];
    const op = (c.op || "eq").toLowerCase();
    if (op === "eq" && actual !== expected) return false;
    if (op === "contains" && !String(actual ?? "").includes(String(expected ?? ""))) {
      return false;
    }
  }
  return true;
}

async function runAction(
  action: ActionShape,
  event: AutomationEvent,
  automationName: string
): Promise<{ ok: boolean; detail: string }> {
  const type = (action.type || "").toLowerCase();

  if (type === "create_task") {
    const due = new Date();
    due.setHours(due.getHours() + (action.dueHours ?? 24));
    await prisma.task.create({
      data: {
        tenantId: event.tenantId,
        title: action.title || `Automação: ${automationName}`,
        description: action.body || `Gerada por evento ${event.type}`,
        status: "TODO",
        dueAt: due,
        contactId: event.contactId || null,
        conversationId: event.conversationId || null,
      },
    });
    return { ok: true, detail: "task criada" };
  }

  if (type === "set_lead_status" && event.contactId && action.status) {
    const status = String(action.status).toUpperCase();
    if (!LEAD_STATUSES.has(status)) {
      return { ok: false, detail: `status inválido: ${status}` };
    }
    await prisma.contact.updateMany({
      where: { id: event.contactId, tenantId: event.tenantId },
      data: { commercialStatus: status as LeadStatus },
    });
    return { ok: true, detail: `commercialStatus=${status}` };
  }

  if (type === "add_tag" && event.contactId && action.tag) {
    const tagName = action.tag.trim();
    if (!tagName) return { ok: false, detail: "tag vazia" };
    const tag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: event.tenantId, name: tagName } },
      create: { tenantId: event.tenantId, name: tagName },
      update: {},
    });
    await prisma.contactTag.upsert({
      where: {
        contactId_tagId: { contactId: event.contactId, tagId: tag.id },
      },
      create: { contactId: event.contactId, tagId: tag.id },
      update: {},
    });
    return { ok: true, detail: `tag ${tagName}` };
  }

  if (type === "notify_internal") {
    const members = await prisma.membership.findMany({
      where: {
        tenantId: event.tenantId,
        isActive: true,
        role: { in: ["ADMIN", "SUPERVISOR"] },
      },
      take: 5,
      select: { userId: true },
    });
    for (const m of members) {
      await prisma.notification.create({
        data: {
          tenantId: event.tenantId,
          userId: m.userId,
          type: "AUTOMATION",
          title: action.title || automationName,
          body: action.body || `Evento ${event.type}`,
          entityType: event.conversationId ? "conversation" : "contact",
          entityId: event.conversationId || event.contactId || null,
          href: event.conversationId ? `/app/inbox?c=${event.conversationId}` : undefined,
          metadata: asInputJson({
            conversationId: event.conversationId,
            contactId: event.contactId,
          }),
        },
      });
    }
    return { ok: true, detail: `notify ${members.length}` };
  }

  return { ok: false, detail: `ação não suportada: ${type || "?"}` };
}

/**
 * Dispara automações ACTIVE do tenant para o evento.
 * Erros viram AutomationRun failed e não propagam ao caller.
 */
export async function dispatchAutomationEvent(event: AutomationEvent): Promise<number> {
  // Access Gate: não executar se empresa bloqueada/suspensa/inadimplente
  try {
    const { evaluateTenantOperationalGate } = await import("../access-gate");
    const gate = await evaluateTenantOperationalGate(event.tenantId);
    if (gate.operationalPaused || !gate.decision.capabilities.canRunAutomations) {
      return 0;
    }
  } catch {
    return 0;
  }

  const automations = await prisma.automation.findMany({
    where: { tenantId: event.tenantId, status: "ACTIVE" },
    take: 50,
  });

  let ran = 0;
  for (const auto of automations) {
    if (!triggerMatches(auto.trigger, event)) continue;
    const started = Date.now();
    const steps: Array<{ name: string; status: string; detail: string }> = [];
    try {
      const def = (auto.definition || {}) as { actions?: ActionShape[] };
      const actions = Array.isArray(def.actions) ? def.actions : [];
      if (actions.length === 0) {
        steps.push({ name: "actions", status: "skip", detail: "sem actions" });
      }
      for (const action of actions) {
        const r = await runAction(action, event, auto.name);
        steps.push({
          name: action.type || "action",
          status: r.ok ? "ok" : "error",
          detail: r.detail,
        });
      }
      await prisma.automationRun.create({
        data: {
          automationId: auto.id,
          status: steps.some((s) => s.status === "error") ? "partial" : "success",
          payload: asInputJson(event),
          result: asInputJson({
            durationMs: Date.now() - started,
            steps,
          }),
        },
      });
      await prisma.automation.update({
        where: { id: auto.id },
        data: { lastRunAt: new Date() },
      });
      ran += 1;
    } catch (err) {
      try {
        await prisma.automationRun.create({
          data: {
            automationId: auto.id,
            status: "failed",
            payload: asInputJson(event),
            result: asInputJson({ steps }),
            error: err instanceof Error ? err.message : "erro",
          },
        });
      } catch {
        /* ignore secondary failure */
      }
    }
  }
  return ran;
}
