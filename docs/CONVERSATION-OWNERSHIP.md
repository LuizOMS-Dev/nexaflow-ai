# Conversation Ownership

**Fonte de verdade:** `Conversation.assignedToId` + `Conversation.status`.

| assignedToId | status | Responsável |
|--------------|--------|-------------|
| null | OPEN | IA (se agente AUTO ativo) |
| null | PENDING | Fila humana — ninguém ainda |
| userId | OPEN | Humano (IA pausada) |
| * | CLOSED/ARCHIVED | Encerrado |

UI e backend devem refletir o mesmo estado.  
Assumir/transferir/retomar IA atualizam assignedToId + timeline interna.
