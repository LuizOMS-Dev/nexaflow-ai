# NIA — Arquitetura

**NIA** = Assistente nativa da plataforma NexaFlow (não é Agente de IA do tenant).

| | NIA | Agentes do tenant |
|--|-----|-------------------|
| Público | Usuários do painel | Clientes finais |
| Knowledge | `HelpKnowledgeDoc` (plataforma) | `KnowledgeDoc` |
| Tools | Leitura + navegação | CRM / WhatsApp / handoff |

## Código

- Service: `apps/api/src/services/nexaflow-assistant/`
- Security: `nia-security.ts`
- Routes: `/assistant/*`
- UI: `apps/web/src/components/nexaflow-assistant/`

## Fluxo

```
Usuário → drawer NIA → POST /assistant/chat
  → rate limit + sanitize
  → security guard (injection/secrets)
  → Access Gate + RBAC + entitlements
  → Help Knowledge published
  → LLM (platform) ou heuristic
  → redact output + action chips allowlisted
```

## Identidade (painel autenticado)

- **Fonte:** sessão JWT + DB (`userId`, `tenantId`) — nunca e-mail/nome/tenant da mensagem.
- **Welcome:** primeiro nome da sessão (`Olá, Fernando! …`).
- **Thread:** `HelpAssistantThread` com `userId` + `tenantId`; histórico isolado por empresa.
- **Troca de tenant:** UI limpa thread; bootstrap só carrega threads do tenant atual.
- **Canal externo (futuro):** pedir e-mail + validação — e-mail ≠ autorização de dados privados.
