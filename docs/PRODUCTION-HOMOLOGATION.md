# Homologação de produção

## Auth

- [ ] Login / logout / logout-all
- [ ] Refresh rotation
- [ ] Forgot/reset password com e-mail real
- [ ] Change password

## MFA Superadmin

- [ ] Setup TOTP
- [ ] Login challenge
- [ ] Recovery codes
- [ ] Step-up
- [ ] Bloqueio de /admin sem MFA

## Multi-tenant / RBAC

- [ ] Isolation IDOR (outro tenant)
- [ ] ADMIN vs AGENT vs READONLY
- [ ] Superadmin sem tenant automático
- [ ] Impersonate start/stop + audit

## WhatsApp (físico)

- [ ] QR connect
- [ ] Inbound mensagem
- [ ] Outbound humano
- [ ] Auto-reply agente AUTO
- [ ] Restart API — sessão restaura
- [ ] Logout no celular — status LOGGED_OUT
- [ ] Reconnect

## Billing manual

- [ ] Plano / pagamento / vencimento / status financeiro

## Campanhas

- [ ] Start com consentimento
- [ ] Batch limit

## Ops

- [ ] Ready com Redis off → 503 em prod
- [ ] SIGTERM graceful
- [ ] Backup + restore drill
