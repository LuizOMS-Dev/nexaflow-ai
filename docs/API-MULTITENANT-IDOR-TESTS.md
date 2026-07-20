# API pública — testes multi-tenant / IDOR

Suite: `apps/api/src/services/api-public-multitenant.e2e.test.ts`

## Pré-requisito

```bash
cd apps/api
npx vitest run src/services/api-public-multitenant.e2e.test.ts
```

Usa schema `nexaflow_test` (vitest setup).

## Casos cobertos (15)

| # | Caso | Esperado | Resultado |
|---|------|----------|-----------|
| 1 | Key A lista contacts | só Tenant A | PASS |
| 2 | Key A GET contact B | 404 | PASS |
| 3 | tenantId em query/header | ignorado | PASS |
| 4 | POST contact com tenantId B no body | cria em A | PASS |
| 5 | scope read bloqueia write | 403 | PASS |
| 6 | scope read permite GET | 200 | PASS |
| 7 | key revogada | 401 | PASS |
| 8 | key inválida | 401 | PASS |
| 9 | prefixo incorreto | 401 | PASS |
| 10 | lista conversations sem B | PASS |
| 11 | lista opportunities sem B | PASS |
| 12 | lista tasks sem B | PASS |
| 13 | Key B GET contact A | 404 | PASS |
| 14 | hash ≠ plaintext | PASS |
| 15 | /me = tenant A | PASS |

## Princípio

`tenantId` **nunca** vem de body/query/header do cliente.  
Autoridade = `authenticateApiKey` → `apiKey.tenantId`.
