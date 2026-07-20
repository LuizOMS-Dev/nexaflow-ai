# Handoff Notifications

| Canal | Comportamento |
|-------|----------------|
| In-app | `createNotification` CONVERSATION_ASSIGNED (membros ADMIN/SUPERVISOR/AGENT) |
| WebSocket | `conversation.updated` + `notification.created` |
| Banner | `HumanQueueBanner` — dismiss **não** cancela handoff |
| Som | Opcional (preferência local + settings empresa) |
| WhatsApp cliente | `notifyHumanTakeover` ao assumir (não ao criar fila) |
| E-mail / browser push | Não nesta fase |

Multi-tenant: só membros do `tenantId` da conversa.
