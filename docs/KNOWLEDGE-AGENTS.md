# Base de conhecimento ↔ Agentes

## Modelo

```
Tenant → KnowledgeDoc (fonte única)
              ↓ scope
         all | agents
              ↓
         AgentKnowledge (vínculos N:N)
              ↓
           AiAgent
```

Sem cópia do conteúdo por agente.

## Status

| Interno | UI | Uso na IA |
|---------|-----|-----------|
| `draft` | Rascunho | Não |
| `ready` / `published` | Pronto | Sim |
| `archived` | Arquivado | Não |

## Fonte

| sourceType | UI |
|------------|-----|
| manual / text | Manual |
| document | Documento |
| import | Importação |
| system | Sistema NexaFlow |
| learning | Aprendizado |
| gap | Lacuna resolvida |

## SYSTEM (catálogo de planos)

- `sourceType = system`
- Conteúdo regenerado a partir de `Plan` no banco
- Edição de título/conteúdo **bloqueada**
- Não pode excluir (só arquivar se necessário)

## Runtime

`getKnowledgeForAgent({ tenantId, agentId })` → apenas ready + (scope all OU link do agente).

Subordinado à Global Truth Policy (knowledge nunca sobrescreve system policy).

## API

- `GET/POST/PATCH/DELETE /knowledge`
- `POST /knowledge/:id/duplicate`
- `GET /ai-agents/:id/knowledge`
