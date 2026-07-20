# Agent Knowledge

## Status: PRESERVADO

- Docs por tenant + vínculo a agente
- Import bulk + enhance via AI Core
- Retrieval: score lexical (`scoreKnowledgeDoc`) — **não** embeddings
- Poisoning: knowledge é DADO no prompt; security/truth acima
- Import config de agente ≠ knowledge docs

## Gaps

| Item | Estado |
|------|--------|
| Embeddings / vector RAG | PENDENTE |
| Chunking avançado | Parcial |
| Knowledge vs System Policy | Policy vence (prompt) |

## Testes

`knowledge-retrieval.test.ts`, `knowledge-import.test.ts`, `knowledge-starter.test.ts`
