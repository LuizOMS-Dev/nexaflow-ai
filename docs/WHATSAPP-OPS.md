# WhatsApp — operação, estabilidade e conformidade

**Fase fechada:** ver também `docs/WHATSAPP-FASE-FECHAMENTO.md`.

## Arquitetura

- **Abstração:** `WhatsAppConnector` (`types.ts`) — Baileys hoje; `cloud_api` reservado.
- **Runtime Baileys:** `baileys-manager.ts` (single socket por `instanceName`).
- **Auth store:** `auth-store.ts` (`BaileysAuthStateStore` / multifile).
- **Alertas:** `wa-alerts.ts` (LOGGED_OUT, circuit breaker, dedupe).
- **Status global:** `connection-status.ts` + `GET /whatsapp/status`.
- **Envio:** `dispatchWhatsAppText` (idempotência, rate limit, opt-in em campanhas).
- **Restore:** `restoreBaileysSessionsOnBoot` após `listen`.

## Auth state (atual)

- **Baileys:** `@whiskeysockets/baileys@7.0.0-rc13`
- **Store:** `useMultiFileAuthState` em `data/wa-sessions/{instanceName}/`
- **creds.update:** persistido imediatamente via `safeSaveCreds` (falha = log CRITICAL)
- **Migração SQL:** planejada (`BaileysAuthStateStore`); **não** apagar pastas multiFile em produção sem export.

## Reconexão

| Classe | Reconecta? | Apaga creds? |
|--------|------------|--------------|
| TRANSIENT / TIMED_OUT / CONNECTION_CLOSED / RESTART_REQUIRED / UNKNOWN | sim (backoff) | **não** |
| LOGGED_OUT / BAD_SESSION / MULTIDEVICE_MISMATCH | **não** | sim |

Backoff: 1s → 2s → … → 60s + jitter de infra. Circuit breaker após N falhas consecutivas.

## Ações UI (semântica)

| Ação | Efeito |
|------|--------|
| Atualizar status | consulta socket |
| Desconectar | encerra socket, **mantém** creds (via API disconnect) |
| Remover canal | remove registro + logout background |
| Logout no aparelho | LOGGED_OUT, exige novo QR |

## Conformidade (o que NÃO fazemos)

- Anti-ban, fingerprint falso, proxy rotation, spoofing, digitação para enganar sistemas.
- Proteção = opt-in (`consentWhatsapp`), limites de volume, fila/dispatch, qualidade, estabilidade.

## Variáveis

- `WA_SESSIONS_DIR` — pasta de sessões
- `WA_RESTORE_ON_BOOT=0` — desliga restore
- `WA_CIRCUIT_FAILURES` / `WA_CIRCUIT_COOLDOWN_MS`
- `WA_MAX_SEND_PER_CHANNEL_MIN` / `WA_MAX_SEND_PER_RECIPIENT_MIN`
