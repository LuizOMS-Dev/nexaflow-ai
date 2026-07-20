/** Catálogo de eventos de webhook — somente eventos com emissão real no domínio. */

export type WebhookEventDef = {
  type: string;
  label: string;
  category: string;
  /** Onde é emitido (documentação / inventário) */
  emission: string;
};

/**
 * Eventos selecionáveis na UI e aceitos em subscribe.
 * REGRA: só entra aqui se existir emitWebhookEvent no código de domínio.
 */
export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  {
    type: "contact.created",
    label: "Contato criado",
    category: "Contatos",
    emission: "POST /contacts, POST /api/v1/contacts",
  },
  {
    type: "contact.updated",
    label: "Contato atualizado",
    category: "Contatos",
    emission: "PATCH /contacts/:id",
  },
  {
    type: "contact.deleted",
    label: "Contato excluído",
    category: "Contatos",
    emission: "DELETE /contacts/:id",
  },
  {
    type: "conversation.created",
    label: "Conversa criada",
    category: "Conversas",
    emission: "POST /conversations, inbound WhatsApp (nova conversa)",
  },
  {
    type: "conversation.closed",
    label: "Atendimento encerrado",
    category: "Conversas",
    emission: "closeConversation (manual, inatividade, IA)",
  },
  {
    type: "conversation.reopened",
    label: "Atendimento reaberto",
    category: "Conversas",
    emission: "reopenConversation / PATCH status OPEN",
  },
  {
    type: "conversation.assigned",
    label: "Atendimento atribuído",
    category: "Conversas",
    emission: "assign / takeover humano",
  },
  {
    type: "message.received",
    label: "Mensagem recebida",
    category: "Mensagens",
    emission: "ingest WhatsApp inbound",
  },
  {
    type: "message.sent",
    label: "Mensagem enviada",
    category: "Mensagens",
    emission: "POST /conversations/:id/messages (não interna)",
  },
  {
    type: "opportunity.created",
    label: "Oportunidade criada",
    category: "Funil",
    emission: "POST /opportunities",
  },
  {
    type: "opportunity.updated",
    label: "Oportunidade atualizada",
    category: "Funil",
    emission: "PATCH /opportunities/:id",
  },
  {
    type: "opportunity.stage_changed",
    label: "Oportunidade movida",
    category: "Funil",
    emission: "PATCH /opportunities/:id com stageId diferente",
  },
  {
    type: "task.created",
    label: "Tarefa criada",
    category: "Tarefas",
    emission: "POST /tasks",
  },
  {
    type: "task.completed",
    label: "Tarefa concluída",
    category: "Tarefas",
    emission: "PATCH /tasks/:id status DONE",
  },
  {
    type: "ai.handoff",
    label: "Handoff para humano",
    category: "IA",
    emission: "notifyHumanTakeover / assign com takeover",
  },
  {
    type: "webhook.test",
    label: "Evento de teste",
    category: "Sistema",
    emission: "POST /webhooks/:id/test",
  },
];

export const WEBHOOK_EVENT_TYPES = new Set(WEBHOOK_EVENTS.map((e) => e.type));

export function labelForEvent(type: string): string {
  return WEBHOOK_EVENTS.find((e) => e.type === type)?.label || type;
}

/** Inventário completo para certificação (inclui planejados não expostos) */
export const WEBHOOK_EVENT_INVENTORY: Array<{
  type: string;
  status: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  notes: string;
}> = [
  ...WEBHOOK_EVENTS.map((e) => ({
    type: e.type,
    status: "IMPLEMENTED" as const,
    notes: e.emission,
  })),
  {
    type: "campaign.started",
    status: "NOT_IMPLEMENTED",
    notes: "Não exposto na UI — sem emit central",
  },
  {
    type: "campaign.completed",
    status: "NOT_IMPLEMENTED",
    notes: "Não exposto na UI — sem emit central",
  },
];
