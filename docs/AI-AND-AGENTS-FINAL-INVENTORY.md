# Inventário final — IA e Agentes NexaFlow

**Data:** 2026-07-17  
**Escopo:** auditoria estática + testes unitários (105 casos IA/segurança) + correção de bypass AI Core  
**Método:** PRESERVAR / CORRIGIR / REFINAR / IMPLEMENTAR — sem redesign

---

## 1. Módulos de código

| Área | Caminho principal | Status |
|------|-------------------|--------|
| AI Core gateway | `apps/api/src/services/ai-core/` | PRESERVADO + CORRIGIDO (callers) |
| Catálogo providers/modelos | `ai-core/catalog.ts` | PRESERVADO |
| Resolve config PLATFORM/TENANT | `ai-core/resolve-config.ts` | PRESERVADO |
| Adapter OpenAI-compat | `ai-core/openai-compatible-adapter.ts` | PRESERVADO |
| Stub Anthropic/Gemini | `ai-core/stub-adapter.ts` | PRESERVADO (não finge ready) |
| Runtime agentes + truth | `services/ai.ts` | CORRIGIDO (analyze + chat → Core) |
| Segurança agente | `services/agent-security.ts` | PRESERVADO |
| Tools | `services/agent-tools.ts` | PRESERVADO |
| Knowledge | `services/knowledge*.ts` | PRESERVADO |
| Handoff | `services/human-handoff.ts` | PRESERVADO |
| Learning + CSAT | `services/agent-learning.ts`, `csat.ts` | PRESERVADO |
| Import config | `services/agent-config-import.ts` | PRESERVADO |
| Versioning | `services/agent-versioning.ts` | PRESERVADO |
| NIA | `services/nexaflow-assistant/` | PRESERVADO |
| Tenant BYOK routes | `routes/tenant-ai.ts` | PRESERVADO |
| Agents API | `routes/ai-agents.ts` | PRESERVADO |
| WhatsApp AUTO | `services/whatsapp/index.ts` | PRESERVADO |
| Access gate | `services/access-gate.ts` | PRESERVADO |

---

## 2. Fluxos LLM (pós-correção)

| Fluxo | Scope | Via AI Core |
|-------|-------|-------------|
| WhatsApp AUTO | tenant | Sim |
| analyzeConversation (copiloto/score) | tenant | Sim |
| chatWithAgent (sandbox) | tenant | Sim |
| nexaflowGenerateText | platform\|tenant | Sim |
| NIA chat | platform | Sim |
| Import config LLM | platform | Sim |
| Knowledge enhance | tenant/platform | Sim |
| getPlatformAiClient | — | Legado SDK — só compat |

---

## 3. Providers

| Provider | productionReady | Adapter | Notas |
|----------|-----------------|---------|--------|
| Groq | **Sim** | OpenAI-compat | Homologado ops (WA TPM) |
| OpenAI | **Sim** | OpenAI-compat | Catalog + BYOK |
| xAI | **Sim** | OpenAI-compat | Catalog + BYOK |
| OpenRouter | **Sim** | OpenAI-compat | Model IDs custom ok |
| Mistral | **Sim** | OpenAI-compat | Catalog |
| Anthropic | **Não** | Stub | UI "em breve" |
| Gemini | **Não** | Stub | UI "em breve" |

---

## 4. Agentes — capacidades

| Capacidade | Implementado | Evidência |
|------------|--------------|-----------|
| Criar/editar | Sim | `routes/ai-agents.ts` |
| Identidade estruturada | Sim | name/role/objective/tone/personality |
| Prompt compiler (camadas) | Sim (funções) | truth + security + identity + behavior |
| Modos SUGGEST/APPROVE/AUTO | Sim | enum + WA só AUTO |
| isActive (desativado) | Sim | `isActive` |
| Tools allowlist | Sim | `agent-tools.ts` |
| Knowledge link | Sim | `getKnowledgeForAgent` |
| Memory contact | Sim | confirmed vs inferred |
| Handoff | Sim | triggers + fila |
| Continuous learning | Sim (opt-in) | default OFF |
| Import config seguro | Sim | allowlist + testes |
| Versions | Sim | publish/rollback |
| Sandbox chat | Sim | chatWithAgent |
| Metrics | Sim (básico) | API metrics |
| CSAT pós-atendimento | Sim | csat.ts |
| RAG embeddings | **Não** | score lexical |

---

## 5. NIA vs Tenant

| Regra | Status |
|-------|--------|
| NIA usa `scope: platform` | PRESERVADO |
| Agentes usam `scope: tenant` + BYOK | PRESERVADO |
| NIA não lê `TenantAiConfig.apiKeyEnc` | PRESERVADO |

---

## 6. Classificação global da área

| Classificação | Itens |
|--------------|-------|
| **PRESERVADO** | AI Core, catalog, BYOK, NIA, truth policy, security, tools, knowledge, handoff, learning opt-in, import, modes, access gate |
| **CORRIGIDO** | `analyzeConversation` e `chatWithAgent` agora usam AI Core (BYOK + fallback + modelo correto) |
| **REFINADO** | Inventário de calls; matriz de certificação honestidade |
| **IMPLEMENTADO** | (nesta rodada) migração callers legados |
| **PENDENTE** | Anthropic/Gemini nativos; multi-provider live battery; Julia E2E live; RAG embeddings; streaming UI full |
