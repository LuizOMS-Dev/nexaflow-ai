# Arquitetura final — IA e Agentes

```
┌─────────────────────────────────────────────────────────────┐
│  NexaFlow (produto)                                         │
│  Agents · Tools · Knowledge · Memory · Truth · Handoff ·    │
│  Learning · RBAC · Tenant Isolation · Access Gate · NIA     │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AI CORE                                                    │
│  resolveAiRuntime → generateForScope / generateText         │
│  capability assert · fallback · error normalize · usage     │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PROVIDER GATEWAY (getAdapter)                              │
│  openai-compatible | stub(anthropic, gemini)                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                     Modelo (catalog)
```

## Hierarquia de config

```
PLATFORM DEFAULT (env AI_*)
    → TENANT DEFAULT (TenantAiConfig / BYOK ou platform_managed)
        → AGENT OVERRIDE (somente model, se válido no provider)
```

## Hierarquia de prompt (runtime)

1. NexaFlow Agent Security (sempre)
2. Global Truth Policy (sempre)
3. Context guardrails (escopo atendimento)
4. Company name / contexto
5. Agent Identity (campos estruturados)
6. Agent objective / tone / personality
7. Behavior (instructions sanitizadas)
8. Limits (restrictions sanitizadas)
9. Knowledge autorizada (relevante, capped)
10. Memory (confirmed ≠ inferred)
11. Conversation context
12. Tool results (quando houver)

**Nada abaixo sobrescreve 1–2.**

## Separação NIA

| | NIA | Agentes tenant |
|--|-----|----------------|
| Scope | `platform` | `tenant` |
| Credencial | env plataforma | BYOK ou platform_managed |
| Knowledge | Help NexaFlow | Knowledge da empresa |
| Tools | account/nav allowlist | CRM/handoff tenant |

## WhatsApp (especial)

Prompt **compacto** (TPM Groq): security compact + identity + knowledge curto + histórico 6 msgs.  
Não usa o system prompt full de chat — trade-off documentado e intencional.
