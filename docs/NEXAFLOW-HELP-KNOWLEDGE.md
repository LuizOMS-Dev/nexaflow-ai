# Help Knowledge (plataforma)

Base de documentação **exclusiva** do Assistente NexaFlow.

- Tabela: `HelpKnowledgeDoc`
- **Sem `tenantId`**
- Status: `draft` | `published` | `archived`
- Somente `published` entra no prompt do assistente

## Seed

`apps/api/src/services/nexaflow-assistant/help-knowledge-seed.ts`  
Idempotente por **upsert de `seedKey`**: cria novos artigos e atualiza os `source=seed` (não sobrescreve manuais; não reabre `archived`).

Campos de freshness: `seedKey`, `productVersion`, `lastReviewedAt`, `needsReview`.

Mapa e cenários: `docs/NIA-KNOWLEDGE-MAP.md`, `docs/NIA-SUPPORT-SCENARIOS.md`.

Categorias: Início, Conversas, Contatos, Funil, Agentes, Conhecimento, Canais, Automações, Campanhas, API, Webhooks, Planos, Configurações, Segurança, Relatórios, Ajuda, etc.

## Superadmin

- `GET/POST /admin/assistant/help-knowledge`
- `PATCH /admin/assistant/help-knowledge/:id`
- Lacunas: `GET /admin/assistant/gaps`

## Separação

Não usar `KnowledgeDoc` da empresa como documentação da plataforma.  
Não sincronizar planos de assinatura NexaFlow no knowledge comercial do tenant.
