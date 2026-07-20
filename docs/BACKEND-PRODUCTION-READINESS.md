# Backend — Production Readiness

**Atualizado:** 2026-07-17  
**Arquitetura:** single-node (API replicas = 1)

## Classificação

```
STAGING_READY / EASYPANEL_DEPLOY_READY
```

**Não** `PRODUCTION_READY` até homologação real de: Mail Resend, HTTPS, Superadmin MFA ligado, restore de backup e WhatsApp físico pós-restart.

## Critérios

| Critério | Status |
|----------|--------|
| Typecheck | OK |
| Testes vitest | OK (78) |
| PostgreSQL | IMPLEMENTADO |
| Redis obrigatório em prod | IMPLEMENTADO (guard + ready) |
| Secrets externalizados | IMPLEMENTADO (env + fail-closed) |
| MFA Superadmin prod | IMPLEMENTADO (default on + guard) |
| Health / ready honestos | IMPLEMENTADO |
| Graceful shutdown | IMPLEMENTADO |
| Migrations Prisma | IMPLEMENTADO |
| Volumes uploads + WA | IMPLEMENTADO no compose |
| Mail Resend real | PENDENTE (config/ops) |
| HTTPS / CORS produção | PENDENTE (deploy) |
| Backup + restore testado | PENDENTE (ops) |
| WhatsApp homologação física | PENDENTE (ops) |

## Dependências (tiers)

| Dependência | Tier | Ready se falhar |
|-------------|------|-----------------|
| PostgreSQL | CRITICAL | not_ready |
| Redis (prod) | CRITICAL | not_ready |
| Mail | OPTIONAL | ready (degraded ops) |
| WhatsApp gateway | OPTIONAL | ready |
| IA provider | OPTIONAL | ready (heurística) |

## Single-node

Jobs in-process + Baileys + locks locais → **1 réplica** da API até arquitetura distribuída.

## Comandos

```bash
npm run typecheck -w @nexaflow/api
npm test -w @nexaflow/api
npm run security:check -w @nexaflow/api
curl -s http://localhost:4000/health
curl -s http://localhost:4000/health/ready
```
