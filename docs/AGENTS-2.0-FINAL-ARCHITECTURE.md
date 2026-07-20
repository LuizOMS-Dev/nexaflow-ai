# Agentes 2.0 — Arquitetura final

## Foundation (preservado)

- `AiAgent`, modos SUGGEST | APPROVE | AUTO
- Knowledge + import
- ContactMemory + CRM insights
- WhatsApp AUTO + handoff humano
- Wizard + Sandbox
- Multi-tenant

## Camadas novas (esta entrega)

| Camada | Modelos / services |
|--------|-------------------|
| Tools runtime | `AgentToolExecution` + `agent-tools.ts` |
| APPROVE | Message `pendingApproval` + approve API |
| Learning | `KnowledgeGap`, `LearningSuggestion`, `AgentFeedback` |
| Versioning | `AgentVersion`, publish/rollback |
| Tests | `AgentTestCase`, `AgentTestRun` |
| Metrics | agregações reais em `/ai-agents/:id/metrics` |

## Classificação

Ver `docs/AGENTS-2.0-AUDIT.md` atualizado.

**AGENTS_2_STAGING_READY** — foundation + runtime tools + approve + learning + versions + tests API + UI mínima.

Production full (RAG embeddings, suite UX completa, dashboard métricas rich) permanece com gaps documentados.
