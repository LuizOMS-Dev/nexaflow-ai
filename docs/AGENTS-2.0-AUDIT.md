# Agentes 2.0 — Status final

## Classificação

**AGENTS_2_STAGING_READY**

Não **PRODUCTION_READY** enquanto: embeddings/RAG semântico, UI full de versões/testes no modal, e suite E2E automatizada de multi-tenant tools não estiverem homologados em produção.

## PRESERVADO

Foundation AiAgent, modes, WhatsApp AUTO, Knowledge, Memory write, Wizard, Sandbox, multi-tenant.

## IMPLEMENTADO (fase final)

| Módulo | Status |
|--------|--------|
| Tools reais | Runtime + DB + analyze actions + AUTO handoff tool |
| APPROVE | Rascunho + filtro Aprovar + approve/edit/discard |
| Learning | Gaps + suggestions + feedback API + UI /ai/learning |
| Versioning | AgentVersion publish/rollback |
| Test suites | API create cases + run suite |
| Metrics | GET metrics real aggregates |
| Docs | AGENT-*.md |

## PENDÊNCIAS produção

- UI rica de versões/testes/métricas na central
- pgvector similarity
- APPROVE queue polish (composer edit inline)
- Learning level 3 policy
- Testes e2e automatizados multi-tenant tools
