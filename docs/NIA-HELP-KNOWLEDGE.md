# NIA — Help Knowledge

Tabela `HelpKnowledgeDoc` (sem tenant).

- Status: `draft` | `published` | `archived`
- Só `published` entra no contexto
- Superadmin: `/admin/assistant/help-knowledge`
- Seed: `help-knowledge-seed.ts` (upsert por `seedKey`)
- Freshness: `productVersion`, `lastReviewedAt`, `needsReview`
- Mapa: `docs/NIA-KNOWLEDGE-MAP.md`
- Cenários: `docs/NIA-SUPPORT-SCENARIOS.md`
- Suíte de perguntas: `nia-eval-questions.ts` (≥200)

## Separação

Help Knowledge da plataforma ≠ KnowledgeDoc da empresa.  
NIA ≠ Agente de atendimento do tenant.
