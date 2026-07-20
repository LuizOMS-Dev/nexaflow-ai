# Encerramento automático de atendimentos

## Auditoria do que existia

| Item | Status anterior |
|------|-----------------|
| Encerramento manual | **Existia** (PATCH status CLOSED + motivo na auditoria) |
| Aviso WhatsApp ao encerrar | **Existia** (`notifyAttendanceClosed`) |
| Reabertura manual | **Existia** |
| Nova msg após close | **Criava novo** atendimento (só OPEN/PENDING) |
| Inatividade automática | **Não existia** |
| Encerramento inteligente IA | **Não existia** |
| Config por empresa | **Não existia** |

## O que foi feito

- **PRESERVADO** fluxo manual, status OPEN/PENDING/CLOSED/ARCHIVED, histórico, multi-tenant
- **REFINADO** motivos, timeline de sistema, auditoria específica, mensagem customizável
- **IMPLEMENTADO** inatividade + IA + reabertura configurável + job in-process

## Configuração

`tenant.settings.attendance` (default seguro: tudo desligado / reabrir = criar novo)

```json
{
  "inactivity": {
    "enabled": false,
    "timeoutMinutes": 1440,
    "sendCloseMessage": true,
    "closeMessage": "…"
  },
  "aiClose": {
    "mode": "off",
    "sendFarewell": true,
    "farewellMessage": "…"
  },
  "reopen": {
    "mode": "new",
    "windowHours": 24
  }
}
```

UI: **Configurações → Atendimento**

## Por agente

`AiAgent.tools.autoClose === false` → não participa do encerramento inteligente (só se empresa ativar).

## Job

`startInactivityCloseScheduler` (a cada ~5 min, após boot 90s) — mesmo padrão de `maintenance` (single-node, sem BullMQ).

Idempotente: conversa já CLOSED é skip; blockers impedem close inseguro.

## Código

- `apps/api/src/services/conversation-close.ts`
- `apps/api/src/services/conversation-close.test.ts`
- Integração: `whatsapp/index.ts`, `conversations.ts`, `index.ts`, settings UI, inbox
