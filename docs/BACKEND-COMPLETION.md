# Backend completion — NexaFlow AI

**Atualizado:** 2026-07-17

## Estado

| Dimensão | Status |
|----------|--------|
| Features de produto | FEATURE_COMPLETE (testes internos) |
| Produção | **STAGING_READY / EASYPANEL_DEPLOY_READY** |
| PRODUCTION_READY | **Não** — falta ops/homolog (mail real, HTTPS, restore, WA físico) |

## Correções desta auditoria final

| Item | Classificação |
|------|----------------|
| Redis usa `REDIS_URL` também em dev | CORRIGIDO |
| Redis CRITICAL em prod + ready 503 | REFINADO |
| `/health` liveness vs `/health/ready` | REFINADO |
| `/health/live` | IMPLEMENTADO |
| Superadmin MFA obrigatório em prod guard | IMPLEMENTADO |
| Graceful shutdown SIGTERM/SIGINT | IMPLEMENTADO |
| WA_SESSIONS_DIR + STORAGE no compose | REFINADO |
| Docs deploy/backup/env | IMPLEMENTADO |

## Preservado (sem reescrita)

Auth, MFA, RBAC, multi-tenant, Superadmin, impersonação, CRM/Inbox, IA/Knowledge, WhatsApp Evolution, billing manual, campanhas, migrations, CSRF/Helmet/rate-limit, maintenance jobs.

## Arquitetura

- Single-node API (replicas=1)
- PostgreSQL + Redis + Evolution opcional
- Jobs in-process (maintenance 6h)
- Sem multi-replica Baileys

## Comandos

```bash
npm run typecheck -w @nexaflow/api
npm test -w @nexaflow/api
npm run security:check -w @nexaflow/api
```

Ver: `BACKEND-FINAL-CERTIFICATION.md`, `EASYPANEL-DEPLOYMENT.md`, `PREDEPLOY-CHECKLIST.md`.
