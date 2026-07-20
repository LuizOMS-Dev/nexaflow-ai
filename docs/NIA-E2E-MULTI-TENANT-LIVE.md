# NIA — PRODUCTION BLOCKER: E2E_MULTI_TENANT_LIVE

## Classificação

**Não é bug MEDIUM de produto.**

```
PRODUCTION BLOCKER: E2E_MULTI_TENANT_LIVE_NOT_EXECUTED
```

→ vira **PASS** quando o spec `e2e/nia-multi-tenant-isolation.spec.ts` passar no ambiente live.

## O que o teste comprova

### Tenant A (plano com API)
- Login / contexto tenant A
- Bootstrap NIA (`operational.apiEnabled === true` quando aplicável)
- Criação de **múltiplas threads** + chat
- Listagem de histórico só com IDs de A
- Diagnóstico/contexto operacional do A

### Tenant B (plano sem API)
- Switch / login contexto B
- Lista de threads **sem** IDs de A
- `GET /assistant/threads/{idA}` → **404** (IDOR)
- Bootstrap: `apiEnabled === false`; sugestões **sem** “criar chave” operacional
- Threads próprias de B

### A → B → A
- Após voltar a A, threads de A **permanecem**
- Threads de B **não vazam** para A
- Contexto operacional atualizado por switch (não fica “preso” em B)

### Rede (não só UI)
- Playwright captura respostas `/assistant/*`
- Assert em status e corpo de `threads` / `bootstrap`
- Fetch IDOR no browser com credentials

## Como rodar

```bash
# stack Docker: web :3000, api :4000
npx playwright test e2e/nia-multi-tenant-isolation.spec.ts --config=playwright.config.ts
```

Env opcional:
- `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`)
- `PLAYWRIGHT_API_URL` (default `http://localhost:4000`)
- `E2E_SUPERADMIN_EMAIL` / `E2E_SUPERADMIN_PASSWORD`

## Critério NIA_PRODUCTION_READY

Só com este spec **PASS** + regressão unit NIA + builds, e **0 CRITICAL/HIGH** de código.
