# Segurança de logs

## Nunca registrar

password, passwordHash, JWT, refreshToken, cookies, Authorization, API keys completas, webhook secrets, TOTP, recovery codes, connection strings com senha, prompts completos de clientes por padrão.

## Redaction

Serviço: `apps/api/src/services/platform-log-redaction.ts`

Aplicado em:

- metadata de `/admin/logs`
- payloads de diagnóstico
- mensagens de erro de WhatsApp/webhooks no diagnóstico

## Multi-tenant

Rotas de diagnóstico exigem Superadmin. Tenant nunca acessa logs globais.

## Retenção (política)

- INFO: retenção mais curta (configurável no futuro)
- ERROR / AUDIT: retenção maior conforme compliance

Não há retenção automática purging nesta versão — documentar e evoluir com jobs.
