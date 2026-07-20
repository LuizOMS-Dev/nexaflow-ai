# API pública e Webhooks

## Classificação

| Módulo | Status |
|--------|--------|
| Webhooks | **WEBHOOKS_PRODUCTION_READY** |
| API | **API_PRODUCTION_READY** |

## Webhooks (tenant)

- CRUD: `GET/POST /webhooks`, `PATCH/DELETE /webhooks/:id`
- Secret: `POST /webhooks/:id/rotate-secret` (exibido uma vez)
- Teste: `POST /webhooks/:id/test`
- Entregas: `GET /webhooks/:id/deliveries`
- Reenvio: `POST /webhooks/:id/deliveries/:deliveryId/resend`
- Assinatura: `X-NexaFlow-Signature: t=<unix>,v1=<hmac-sha256(t+"."+rawBody)>`
- Validar: HMAC-SHA256 de `` `${timestamp}.${rawBody}` `` com o secret
- Tolerância de replay (consumidor): rejeitar `t` com skew > 5 min (recomendado)
- SSRF: bloqueia localhost, IPs privados, metadata, hosts Docker; `redirect: "error"`
- Retry: até 4 tentativas (0 / 30s / 2m / 10m); in-process (single-node)
- Eventos: ver [WEBHOOK-EVENT-INVENTORY.md](./WEBHOOK-EVENT-INVENTORY.md) — só IMPLEMENTED na UI

UI: `/app/settings/webhooks`

## API Keys

- `GET/POST /api-keys`, `POST /api-keys/:id/revoke`
- Secret `nxf_live_…` — só hash SHA-256 no banco
- Escopos: contacts/conversations/opportunities/tasks read|write
- Entitlement: `features.api` (Empresa/Enterprise)

UI: `/app/settings/api`  
Docs: `/docs/api`

## API pública v1

Base: `/api/v1`  
Auth: `Authorization: Bearer nxf_live_…`  
Tenant: **somente** da chave.

## Planos (features oficiais)

| Plano | Webhooks | API |
|-------|----------|-----|
| Free / Inicial | não | não |
| Profissional | sim (5) | não |
| Empresa | sim (20) | sim (10 keys) |
| Enterprise | sim (50) | sim (25 keys) |

Sync idempotente de features de plano:

```bash
npx tsx apps/api/src/scripts/sync-plan-entitlements.ts
```

Não sobrescreve preço/contrato do tenant — só `Plan.features`.

## Certificação

- [API-PRODUCTION-CERTIFICATION.md](./API-PRODUCTION-CERTIFICATION.md)
- [WEBHOOKS-PRODUCTION-CERTIFICATION.md](./WEBHOOKS-PRODUCTION-CERTIFICATION.md)
- [API-MULTITENANT-IDOR-TESTS.md](./API-MULTITENANT-IDOR-TESTS.md)
- [WEBHOOK-SSRF-CERTIFICATION.md](./WEBHOOK-SSRF-CERTIFICATION.md)
