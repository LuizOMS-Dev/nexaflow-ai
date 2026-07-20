# Certificação API pública — Produção

## Classificação final

**API_PRODUCTION_READY**

## Evidência

| Critério | Status | Evidência |
|----------|--------|-----------|
| Auth API key | OK | Bearer `nxf_live_*` |
| Hash SHA-256 | OK | `keyHash` único; secret só na criação |
| Revogação imediata | OK | E2E 401 após `revokedAt` |
| Scopes | OK | E2E read vs write |
| Rate limit | OK | 120/min por key (in-memory process) |
| Tenant isolation | OK | E2E multi-tenant 15 casos |
| IDOR | OK | GET recurso B com key A → 404 |
| tenantId spoofing | OK | body/query/header ignorados |
| Entitlements | OK | `features.api` + sync planos |
| Docs | OK | `/docs/api` alinhada a rotas reais |

## Rotas certificadas

- `GET /api/v1/me`
- `GET/POST /api/v1/contacts`, `GET /api/v1/contacts/:id`
- `GET /api/v1/conversations`
- `GET /api/v1/opportunities`
- `GET /api/v1/tasks`

## Pendências não bloqueantes

- Rotação assistida (criar nova + janela + revogar antiga)
- Rate limit Redis por key em multi-replica
- Mais verbos write (opportunities/tasks) se produto exigir

## Testes

```bash
npx vitest run src/services/api-public-multitenant.e2e.test.ts
```
