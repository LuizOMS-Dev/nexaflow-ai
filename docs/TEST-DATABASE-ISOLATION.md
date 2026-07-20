# Isolamento do banco de testes

## Ambientes

| Ambiente | Banco | Variável |
|----------|--------|----------|
| development | `C:/nexaflow-data/dev.db` | `DATABASE_URL` |
| test | `C:/nexaflow-data/test.db` | `DATABASE_URL_TEST` |
| production | Postgres (compose/hosting) | `DATABASE_URL` |

## Regras

1. **Vitest** força `NODE_ENV=test` e `DATABASE_URL=DATABASE_URL_TEST` via `apps/api/vitest.config.ts` + `src/test/setup.ts`.
2. Se o URL de teste parecer produção (`prod`, `neon`, `supabase`, etc.), o processo **aborta**.
3. Fixtures de teste gravam `settings: { fixture: true, environment: "test", createdByTest: true }`.
4. Admin **filtra** fixtures da listagem mesmo se algo vazar para o dev DB.
5. Seed em production exige `SEED_DEMO_ENABLED=true`. Seed em `NODE_ENV=test` é abortado.

## Comandos

```bash
# Limpeza de fixtures no banco de desenvolvimento (dry-run)
npm run db:cleanup-fixtures -w @nexaflow/api

# Aplicar limpeza
npm run db:cleanup-fixtures:apply -w @nexaflow/api

# Listar tenants
npm run db:list-tenants -w @nexaflow/api

# Testes (sempre no test.db)
npm test -w @nexaflow/api
```

## CI (recomendado)

```yaml
env:
  NODE_ENV: test
  DATABASE_URL_TEST: file:./test-ci.db
  DATABASE_URL: file:./test-ci.db
steps:
  - run: npx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss
  - run: npm test -w @nexaflow/api
  # destruir artefato test-ci.db ao final do job
```

Nunca aponte testes CI para o `DATABASE_URL` de development ou production.
