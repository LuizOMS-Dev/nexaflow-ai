# Política global de veracidade NexaFlow

## Status

**SEMPRE ATIVA** — `GLOBAL_TRUTH_POLICY_ENABLED = true` em `apps/api/src/services/ai.ts`.

Não é setting de tenant, agente ou UI desligável.

## Prioridade

```
NEXAFLOW SYSTEM POLICY (veracidade)
  → guardrails de contexto da plataforma
    → regras do tenant
      → instruções do agente
        → knowledge
          → conversa / cliente
```

## Aplicação

Incluída em `buildPlatformContextGuardrails()`, usada por:

- `analyzeConversation` (Copiloto / Aprovação / insights) — via AI Core tenant
- `generateHumanWhatsAppReply` (Automático) — política compacta + security no WA
- `chatWithAgent` (Sandbox) — via AI Core tenant

Certificação: `ai-truth-policy.test.ts` PASS (2026-07-17).

## Quando não sabe

Admitir / confirmar / handoff — nunca inventar.

## Testes

`apps/api/src/services/ai-truth-policy.test.ts`
