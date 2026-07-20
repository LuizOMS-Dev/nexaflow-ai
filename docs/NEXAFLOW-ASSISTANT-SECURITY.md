# Assistente NexaFlow — Segurança

## Multi-tenant

- `tenantId` e `userId` da JWT/sessão
- Threads filtradas por `userId`
- Snapshot operacional só do tenant da sessão

## Truth & injection

- `GLOBAL_TRUTH_POLICY_ENABLED = true`
- Help Knowledge tratada como **dados**, não como instruções privilegiadas acima da política
- Pedidos de “ignore as regras” rejeitados no system prompt

## Secrets

- Não envia API keys, tokens, senhas ou mensagens de clientes no contexto
- Provider/modelo não expostos na UI do tenant

## Rate limit

- Rota: ~30/min (Fastify rate-limit)
- Bucket em memória adicional: 20/min por usuário (`ASSISTANT_RATE_LIMITED`)

## RBAC / entitlements

- Navegação e orientação filtradas por papel e flags do plano
- Sem link para área bloqueada

## Créditos

- `AiUsageLog.purpose = platform_help`, `credits = 0` (não consome créditos de WhatsApp)
