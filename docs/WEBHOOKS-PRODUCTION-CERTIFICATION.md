# Certificação Webhooks — Produção

## Classificação final

**WEBHOOKS_PRODUCTION_READY**

## Evidência

| Critério | Status | Evidência |
|----------|--------|-----------|
| CRUD | OK | `/webhooks` routes + UI |
| Assinatura HMAC | OK | `signPayload` + teste E2E HMAC |
| Retry / backoff | OK | 4 tentativas, delays 0/30s/2m/10m |
| Idempotência (eventId) | OK | teste delivery mantém eventId |
| SSRF | OK | ssrf.test + e2e |
| Redirect | OK | `redirect: "error"` |
| Multi-tenant | OK | webhooks.e2e (A não entrega em B) |
| Eventos UI = reais | OK | inventário + emits no domínio |
| Entitlements | OK | plan features + script sync |
| Secret em logs | OK | sanitize + não loga secret |

## Limitação documentada (não bloqueante)

- Retry é **in-process** (single-node). Reinício da API pode perder retries `retrying` até o scheduler; jobs pendentes com `nextRetryAt` são reprocessados no scheduler de 60s **se o processo continuar**. Em multi-replica futura: fila externa.

## Superadmin

Painel global de saúde de webhooks **não** é bloqueador — tenants operam self-service.

## Testes

```bash
npx vitest run src/services/webhooks/
```
