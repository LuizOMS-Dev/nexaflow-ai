# AI Provider — inventário de chamadas (pré multi-provider)

Auditado em 2026-07-17. Após migração, fluxos críticos passam pelo **AI Core**.

| Arquivo | Função | Provider antes | Finalidade | Via AI Core? |
|---------|--------|----------------|------------|--------------|
| `services/ai.ts` | `generateHumanWhatsAppReply` | env Groq/xAI/OpenAI | AUTO WhatsApp | **Sim** (tenant) |
| `services/ai.ts` | `analyzeConversation` | OpenAI client env | score/resumo/copiloto | **Sim** (tenant) — migrado 2026-07-17 |
| `services/ai.ts` | `chatWithAgent` | OpenAI client env | sandbox/chat agente | **Sim** (tenant) — migrado 2026-07-17 |
| `services/ai.ts` | `getPlatformAiClient` | env | legado SDK (compat) | Compat — não usar em fluxos novos |
| `services/ai.ts` | `nexaflowGenerateText` | AI Core | API canônica | **Sim** |
| `nexaflow-assistant/index.ts` | `chatWithNexaflowAssistant` | platform | NIA | **Sim** (platform) |
| `agent-config-import.ts` | `extractWithLlm` | platform | import config | **Sim** (platform) |
| `knowledge-import.ts` | `enhanceWithAi` | env | organizar import | **Sim** (tenant/platform) |
| `whatsapp/index.ts` | `maybeAutoReplyAi` | via generateHuman… | handoff/auto | **Sim** indireto |
| `lib/env.ts` | `resolveAiProvider` | GROQ→xAI→OpenAI | bootstrap platform | Platform only |

## Escopos

| Scope | Uso |
|-------|-----|
| `platform` | NIA, import config conceitual, tarefas internas NexaFlow |
| `tenant` | Agentes, WhatsApp AUTO, knowledge enhance da empresa |

## Não migrar às cegas

- Truth policy / prompts em `ai.ts` (regra de negócio)
- Tools runtime / RBAC em `agent-tools.ts`
- Knowledge retrieval (sem LLM embeddings ainda)
