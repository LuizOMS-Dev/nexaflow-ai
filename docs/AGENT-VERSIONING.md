# Versionamento de agente

- `AgentVersion` — snapshot JSON
- `AiAgent.currentVersion`, `publishStatus`, `draftSnapshot`

API:

- GET `/ai-agents/:id/versions`
- POST `/ai-agents/:id/publish`
- POST `/ai-agents/:id/rollback` `{ version }`
- POST `/ai-agents/:id/ensure-version`

Rollback cria nova versão (histórico preservado).
