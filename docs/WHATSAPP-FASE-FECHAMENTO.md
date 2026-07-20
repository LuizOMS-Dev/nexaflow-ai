# WhatsApp — fechamento da fase de estabilidade

Data de fechamento: 2026-07-15

## Escopo desta fase

Estabilidade, resiliência, status real, envio controlado e conformidade operacional.  
**Fora de escopo (proposital):** anti-ban, spoofing, Cloud API completa, auth SQL em produção.

## Entregue

| Item | Estado |
|------|--------|
| Status real (CONNECTED ≠ Channel no banco) | IMPLEMENTADO |
| Classificação de disconnect + backoff + circuit breaker | IMPLEMENTADO |
| creds.update com save seguro | IMPLEMENTADO |
| Single socket / lock in-process | IMPLEMENTADO |
| Restore on boot | IMPLEMENTADO |
| Auth store interface (multifile) | IMPLEMENTADO |
| Dispatch + opt-in campanha + rate limit | IMPLEMENTADO |
| Alertas LOGGED_OUT / circuit breaker (dedupe) | IMPLEMENTADO |
| Diagnóstico na UI Canais | IMPLEMENTADO |
| Baileys 7.0.0-rc13 / multiFile | PRESERVADO |

## Persistência de auth

- **Backend:** `useMultiFileAuthState` em `data/wa-sessions/{instanceName}/`
- **Interface:** `BaileysAuthStateStore` (`auth-store.ts`)
- **Migração SQL:** planejada; **não** migrar automaticamente sem export das pastas existentes

## Como recuperar após restart

1. API sobe → `restoreBaileysSessionsOnBoot`
2. Canais WHATSAPP ativos com `creds.json` → `startBaileysSession`
3. Se credencial válida → CONNECTED sem novo QR

## Riscos residuais aceitos nesta fase

1. Multi-réplica da API sem Redis lock (risco de socket duplo em scale-out)
2. Auth ainda em filesystem (volume deve ser persistente no deploy)
3. Fila de envio em memória (não job queue Redis/DB)
4. Cloud API Meta não implementada

## Variáveis úteis

```
WA_SESSIONS_DIR=
WA_RESTORE_ON_BOOT=0|1
WA_CIRCUIT_FAILURES=10
WA_CIRCUIT_COOLDOWN_MS=300000
WA_MAX_SEND_PER_CHANNEL_MIN=60
WA_MAX_SEND_PER_RECIPIENT_MIN=8
```
