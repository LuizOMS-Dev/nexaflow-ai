# Inventário de eventos de Webhook

**Regra absoluta:** só eventos com `status: IMPLEMENTED` aparecem na UI de inscrição.

| Código | Nome UI | Status | Emissão |
|--------|---------|--------|---------|
| `contact.created` | Contato criado | **IMPLEMENTED** | `POST /contacts`, `POST /api/v1/contacts` |
| `contact.updated` | Contato atualizado | **IMPLEMENTED** | `PATCH /contacts/:id` |
| `contact.deleted` | Contato excluído | **IMPLEMENTED** | `DELETE /contacts/:id` |
| `conversation.created` | Conversa criada | **IMPLEMENTED** | `POST /conversations`, inbound WhatsApp (nova) |
| `conversation.closed` | Atendimento encerrado | **IMPLEMENTED** | `closeConversation` (manual / inatividade / IA) |
| `conversation.reopened` | Atendimento reaberto | **IMPLEMENTED** | `reopenConversation` |
| `conversation.assigned` | Atendimento atribuído | **IMPLEMENTED** | `POST /conversations/:id/assign` |
| `message.received` | Mensagem recebida | **IMPLEMENTED** | ingest WhatsApp inbound |
| `message.sent` | Mensagem enviada | **IMPLEMENTED** | `POST /conversations/:id/messages` (não interna) |
| `opportunity.created` | Oportunidade criada | **IMPLEMENTED** | `POST /opportunities` |
| `opportunity.updated` | Oportunidade atualizada | **IMPLEMENTED** | `PATCH /opportunities/:id` |
| `opportunity.stage_changed` | Oportunidade movida | **IMPLEMENTED** | `PATCH` com `stageId` diferente |
| `task.created` | Tarefa criada | **IMPLEMENTED** | `POST /tasks` |
| `task.completed` | Tarefa concluída | **IMPLEMENTED** | `PATCH /tasks/:id` → `DONE` |
| `ai.handoff` | Handoff para humano | **IMPLEMENTED** | assign / takeover |
| `webhook.test` | Evento de teste | **IMPLEMENTED** | `POST /webhooks/:id/test` |
| `campaign.started` | — | **NOT_IMPLEMENTED** | Não exposto |
| `campaign.completed` | — | **NOT_IMPLEMENTED** | Não exposto |

Fonte de código: `apps/api/src/services/webhooks/events.ts`
