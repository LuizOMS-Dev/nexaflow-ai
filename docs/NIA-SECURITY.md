# NIA — Segurança

## Camadas

1. Session `userId` / `tenantId` (nunca do body da pergunta)
2. `detectNiaSecurityThreat` (determinístico)
3. System policy + Global Truth Policy
4. Help Knowledge como DADO
5. Nav allowlist + RBAC + entitlements
6. `redactSecretsFromOutput`
7. `recordSecurityEvent` em bloqueios

## Proibido

Secrets, system prompt, SQL/shell, cross-tenant, privilege escalation, tools destrutivas.

## Rate limit

20/min por usuário + 30/min na rota Fastify.
