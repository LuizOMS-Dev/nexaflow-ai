# Logs e diagnóstico

## Separação

- **AuditLog** — atividade operacional (“quem fez o quê”). Já existia; reutilizado em Auditoria e aba Atividade.
- **Diagnóstico** — agrega webhooks, WhatsApp, IA, API usage, security events.
- **Changelog** — produto (ver PLATFORM-CHANGELOG.md).

## Rotas Superadmin

- `GET /admin/diagnostics/overview`
- `GET /admin/diagnostics/activity|webhooks|whatsapp|ai|api|security`
- `GET /admin/platform-health`
- `GET /admin/logs` (audit paginado, metadata redacted)

## UI

- `/admin/system/diagnostics`
- `/admin/system/health`
- `/admin/audit` (auditoria humana)

## Redaction

`platform-log-redaction.ts` — mascara password, token, JWT, API keys, URLs com senha.
