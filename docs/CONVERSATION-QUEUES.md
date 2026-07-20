# Conversation Queues

Fila humana = conversas `PENDING` + `assignedToId=null` + handoff real (`requiresAssume` / `waitingHuman`, excluindo rate-limit genérico).

- **API:** `GET /conversations/waiting-human` (FIFO por `lastMessageAt`)
- **UI:** Inbox `status=PENDING`, banner global, dashboard prioridade
- **Ordem:** mais antigo primeiro
- **CTA banner:** navega (“Abrir conversa”) — Assumir só no header da conversa
