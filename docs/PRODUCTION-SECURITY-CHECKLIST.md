# Checklist de Homologação de Segurança — Produção

Marcar com evidência (comando, PR, log). Estados: `PENDING` | `OK` | `N/A`.

| # | Controle | Status | Teste / Evidência | Arquivo |
|---|----------|--------|-------------------|---------|
| 1 | `NODE_ENV=production` | PENDING | deploy env | — |
| 2 | `JWT_SECRET` forte (≥32, não default) | PENDING | `security:check` | `env.ts` |
| 3 | `COOKIE_SECRET` forte | PENDING | `security:check` | `env.ts` |
| 4 | `ENCRYPTION_KEY` forte (TOTP at rest) | PENDING | `security:check` | `crypto.ts` |
| 5 | `CORS_ORIGIN` HTTPS allowlist (sem `*`) | PENDING | `security:check` | `app.ts` |
| 6 | `REDIS_URL` + rate limit Redis | PENDING | logs `rate-limit: using Redis` | `redis.ts` |
| 7 | HTTPS terminado no proxy | PENDING | HSTS header | `app.ts` helmet |
| 8 | Cookies Secure + HttpOnly | PENDING | Set-Cookie response | `auth.ts` |
| 9 | Superadmin com MFA ativo | PENDING | login → settings MFA → /admin | `step-up.ts` |
| 9b | Bootstrap MFA superadmin | OK (código) | empty state admin + banner settings | admin + settings |
| 10 | Contas demo desabilitadas | PENDING | `ALLOW_DEMO_ACCOUNTS` ≠ 1 | seed |
| 10b | Convite sem senha default | OK (código+teste) | `invite.test` | team/invite + accept-invite |
| 10c | Reset senha via sendMail | OK (código) | sem log de token em prod | `mail.ts` |
| 11 | Trust proxy só loopback/CIDR | PENDING | `TRUST_PROXY` | `env.ts` |
| 12 | `npm audit` sem CRITICAL auth | PENDING | `npm audit` | CI |
| 13 | Testes vitest verdes | PENDING | `npm test` | `apps/api` |
| 14 | CSRF Origin em mutações | PENDING | csrf.test | `csrf.ts` |
| 15 | IDOR tenant isolation | PENDING | isolation tests | routes |
| 16 | Impersonação com reason + 2h | PENDING | admin flow | `admin.ts` |
| 17 | Reset password sem log de token | PENDING | code review prod | `auth.ts` |
| 18 | Upload logo MIME (PNG/JPEG/WebP) | PENDING | logo.test | `logo-upload.ts` |
| 19 | WS com session binding | PENDING | manual/WS | `app.ts` |
| 20 | Fail-closed no boot | PENDING | boot sem secrets | `production-guard.ts` |

## Resultado da suíte automatizada (última execução local)

Ver saída de `npm test` no CI ou local. Controles com testes:

- tenant isolation  
- auth negative (JWT adulterado, IDOR, mass assignment)  
- MFA (verify, replay, encrypt)  
- CSRF  
- crypto  
- permissions / impersonation RBAC  
- logo MIME  

## Riscos aceitos (se houver)

| Risco | Impacto | Prob. | Mitigação | Revisão |
|-------|---------|-------|-----------|---------|
| E-mail reset não enviado (só token) | Recuperação manual | Média | Provider SMTP/API | antes do GA |
| Convite com senha definida pelo admin | Credencial fraca | Média | Migrar para invite token | 30 dias |
| @fastify/static moderate | Path listing se usado | Baixa | Não servir uploads via static público | próximo release |
