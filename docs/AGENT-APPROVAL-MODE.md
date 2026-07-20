# Modo APPROVE

Quando o agente está em `mode=APPROVE` e roda `POST .../ai-suggest`:

1. Gera reply
2. Cria `Message` OUTBOUND com `isAiGenerated=true`, `aiApproved=false`, `metadata.pendingApproval=true`
3. **Não** envia WhatsApp

## Inbox

Filtro `pendingApproval=1` (chip **Aprovar**)

## Ações

`POST /conversations/:id/messages/:messageId/approve`

- Aprovar e enviar (content opcional = editar)
- `discard: true` remove rascunho

Correções humanas geram `LearningSuggestion`.
