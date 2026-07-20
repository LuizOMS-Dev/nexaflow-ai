# Variáveis de ambiente — produção

## Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres `postgresql://…` |
| `REDIS_URL` | Redis |
| `JWT_SECRET` | ≥32 chars, alta entropia |
| `COOKIE_SECRET` | ≥24 chars |
| `ENCRYPTION_KEY` | ≥32 chars (TOTP) |
| `CORS_ORIGIN` | HTTPS origin(s) CSV |
| `APP_PUBLIC_URL` | HTTPS do front |
| `SUPERADMIN_MFA_REQUIRED` | `1` |

## Fortemente recomendadas

| Variável | Descrição |
|----------|-----------|
| `API_URL` | HTTPS pública da API |
| `INTERNAL_API_URL` | URL Docker interna para webhooks |
| `MAIL_PROVIDER` | `resend` |
| `MAIL_API_KEY` / `RESEND_API_KEY` | chave Resend |
| `MAIL_FROM` | remetente verificado |
| `TRUST_PROXY` | `true` atrás de EasyPanel |
| `STORAGE_LOCAL_PATH` | `/app/uploads` |
| `WA_SESSIONS_DIR` | `/app/data/wa-sessions` |
| `WA_GATEWAY_*` | Evolution/Baileys |

## Opcionais

| Variável | Default |
|----------|---------|
| `ACCESS_TOKEN_MINUTES` | 15 |
| `REFRESH_TOKEN_DAYS` | 30 |
| `CAMPAIGN_BATCH_LIMIT` | 100 |
| `GROQ_API_KEY` / `XAI_API_KEY` / `OPENAI_API_KEY` | — |

## Proibidas em produção

- `SEED_DEMO_ENABLED=1`
- `ALLOW_DEMO_ACCOUNTS=1`
- `SUPERADMIN_MFA_REQUIRED=0`
- `CORS_ORIGIN=*`
- `APP_PUBLIC_URL` com localhost
- Secrets default do compose Docker

Ver `.env.example` na raiz.
