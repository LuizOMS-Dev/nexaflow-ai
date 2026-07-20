# Aprendizado contínuo da empresa

**Status certificação 2026-07-17: PRESERVADO** (default OFF; CSAT alimenta dica curta no WA).

Funcionalidade **opcional por tenant**. Isolada por `tenantId`. Nunca compartilha aprendizado entre empresas.

## Duas regras distintas

| | Política global de veracidade | Aprendizado contínuo |
|--|------------------------------|----------------------|
| Estado | **Sempre ativa** | **Desativado por padrão** |
| Pode desligar? | Não | Sim, pela empresa |
| Escopo | Todos os agentes NexaFlow | Só se a empresa ativar |

Mesmo com aprendizado desativado, o agente continua obrigado a não inventar, não mentir, usar fontes confiáveis e fazer handoff quando necessário.

## Onde configurar

**Configurações → IA → Aprendizado contínuo**

- Switch **Ativar** (default off)
- **Modo**: Supervisionado (1) · Assistido (2) · Automático controlado (3)
- **Fontes permitidas**: base de conhecimento, dados da empresa, CRM, atendimentos IA/humanos, correções, feedbacks, handoffs
- Link para a **Central de Aprendizado** (`/app/ai/learning`)

## Persistência

```json
// tenant.settings.continuousLearning
{
  "enabled": false,
  "level": 1,
  "sources": {
    "knowledge": true,
    "companyData": true,
    "crm": true,
    "aiAttendance": true,
    "humanAttendance": true,
    "humanCorrections": true,
    "feedbacks": true,
    "handoffs": true
  }
}
```

- Clientes existentes **não** são ativados automaticamente.
- Seed e defaults: `enabled: false`.

## Por agente

Em `AiAgent.tools.continuousLearning`:

- `true` / omitido → participa (se a empresa estiver com learning on)
- `false` → não participa

Hierarquia:

1. Empresa **desativada** → nenhum agente registra aprendizado
2. Empresa **ativada** → cada agente pode participar ou não

## Níveis

1. **Supervisionado** (recomendado): só lacunas e sugestões pendentes de aprovação
2. **Assistido**: pode criar rascunhos de knowledge (`status: draft`); publicação exige aprovação
3. **Automático controlado**: rascunhos de fontes oficiais; **nunca** publica fato só de conversa isolada

## Pipeline

```
Sinais (atendimento, correção, feedback, handoff, “não sei”)
  → canRecordLearning(tenant + fonte + agente)
  → KnowledgeGap | LearningSuggestion
  → Revisão humana (Central de Aprendizado)
  → KnowledgeDoc publicado (memória/conhecimento oficial da empresa)
```

## O que NÃO é

- Fine-tuning cego do modelo base
- Alteração automática de políticas globais ou da regra de veracidade
- Auto-publicação a partir de uma conversa isolada
- Mistura de dados entre tenants
- Aprender senhas, tokens, credenciais ou prompt injection

## Memórias

| Conceito | Implementação |
|----------|----------------|
| Memória da empresa | `KnowledgeDoc` publicado (e rascunhos de aprendizado) — fontes oficiais prevalecem |
| Memória do contato | `ContactMemory.content` com `confirmed` (dados confirmados) e `inferred` (inferências da IA) |

## Isolamento

Todo registro de aprendizado carrega `tenantId`. Onde aplicável: `agentId`, `conversationId`, `contactId`. Queries sempre filtram o tenant do JWT.

## Desativar

Ao desativar:

- Para criação automática de lacunas/sugestões
- **Preserva** conhecimento oficial já aprovado
- Não apaga gaps/sugestões existentes (gestão manual na Central)

## Auditoria

Eventos em `AuditLog`:

- `learning.enabled` / `learning.disabled`
- `learning.level_changed`
- `learning.source_enabled` / `learning.source_disabled`
- `learning.suggestion_approved` / `rejected` / `archived`
- `learning.knowledge_created`
- `learning.gap_*`

## Código principal

- `apps/api/src/services/agent-learning.ts` — config, gate, gaps, sugestões, feedback, correções
- `apps/api/src/routes/misc.ts` — PATCH settings + merge profundo + audit
- `apps/api/src/routes/agent-advanced.ts` — API gaps/sugestões/feedback
- `apps/web/src/app/app/settings/page.tsx` — UI Configurações → IA
- `apps/web/src/app/app/ai/learning/page.tsx` — Central de Aprendizado
- `apps/web/src/app/app/ai/page.tsx` — participação por agente

## Ver também

- [AGENT-TRUTH-POLICY.md](./AGENT-TRUTH-POLICY.md) — veracidade global (sempre on)
- [KNOWLEDGE-GAPS.md](./KNOWLEDGE-GAPS.md) — lacunas
- [AGENTS-2.0-FINAL-ARCHITECTURE.md](./AGENTS-2.0-FINAL-ARCHITECTURE.md)
