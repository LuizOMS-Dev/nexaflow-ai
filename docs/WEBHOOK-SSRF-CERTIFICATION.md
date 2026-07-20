# Webhooks — certificação SSRF

Código: `apps/api/src/services/webhooks/ssrf.ts`  
Testes: `ssrf.test.ts`, `webhooks.e2e.test.ts`

## Bloqueios validados

| Alvo | Resultado |
|------|-----------|
| localhost / 127.0.0.1 / ::1 | Bloqueado |
| 10.x / 192.168.x / 172.16–31.x | Bloqueado |
| 169.254.169.254 (metadata) | Bloqueado |
| host.docker.internal, postgres, redis, api… | Bloqueado |
| file:, ftp:, gopher:, data: | Bloqueado |
| HTTPS público (example.com) | Permitido (formato) |

## DNS

`assertSafeWebhookUrl` resolve DNS (`lookup all`) e rejeita se qualquer IP for privado.

## Redirects

`fetch` de entrega usa **`redirect: "error"`**.  
Um 302 para localhost/metadata **não é seguido**.

## Produção

Em `NODE_ENV=production`, apenas `https:` é aceito na validação de formato.
