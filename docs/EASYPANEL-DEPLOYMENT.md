# EasyPanel — deploy completo do NexaFlow

Use `docker-compose.easypanel.yml`. Ele foi separado do compose local para não levar credenciais de desenvolvimento nem publicar as portas do banco e do Redis.

## 1. Criar o projeto

1. No EasyPanel, crie um projeto do tipo **Docker Compose** conectado ao repositório GitHub.
2. Selecione `docker-compose.easypanel.yml` como caminho do Compose.
3. Cadastre as variáveis abaixo antes do primeiro build.
4. Aponte o domínio do app para o serviço `web`, porta `3000`.
5. Aponte o domínio da API para o serviço `api`, porta `4000`.
6. Mantenha Postgres e Redis sem domínio e sem porta pública.

## Serviços

| Serviço | Imagem / build | Porta interna | Réplicas |
|---------|----------------|---------------|----------|
| postgres | postgres:16-alpine | 5432 | 1 |
| redis | redis:7-alpine | 6379 | 1 |
| evolution | evoapicloud/evolution-api | 8080 | 1 |
| api | `apps/api/Dockerfile` | 4000 | **1** |
| web | `apps/web/Dockerfile` | 3000 | 1+ |

## Volumes persistentes

| Volume | Conteúdo |
|--------|----------|
| `postgres_data` | banco principal |
| `redis_data` | cache e filas |
| `uploads_data` | avatars, logos e mídia |
| `wa_sessions` | sessões Baileys |
| `evolution_data` | instâncias Evolution |

## Variáveis mínimas

Use valores exclusivos. Quando uma senha fizer parte de uma URL, aplique URL encoding.

```text
POSTGRES_USER=nexaflow
POSTGRES_PASSWORD=<senha forte e exclusiva>
POSTGRES_DB=nexaflow
DATABASE_URL=postgresql://nexaflow:<senha URL-encoded>@postgres:5432/nexaflow?schema=public
EVOLUTION_DATABASE_URL=postgresql://nexaflow:<senha URL-encoded>@postgres:5432/nexaflow?schema=evolution
REDIS_PASSWORD=<senha forte e exclusiva>
REDIS_URL=redis://:<senha URL-encoded>@redis:6379

APP_PUBLIC_URL=https://app.seudominio.com
API_URL=https://api.seudominio.com
CORS_ORIGIN=https://app.seudominio.com
NEXT_PUBLIC_WS_URL=wss://api.seudominio.com/ws

JWT_SECRET=<aleatório com pelo menos 32 caracteres>
COOKIE_SECRET=<aleatório com pelo menos 32 caracteres>
ENCRYPTION_KEY=<aleatório com pelo menos 32 caracteres>
EVOLUTION_API_KEY=<aleatório com pelo menos 32 caracteres>
EVOLUTION_SERVER_URL=https://whatsapp.seudominio.com

MAIL_PROVIDER=resend
MAIL_API_KEY=<chave do provedor>
MAIL_FROM=NexaFlow <noreply@seudominio.com>
RUN_SEED_ON_BOOT=0
```

Se a Evolution não precisar ser acessada externamente, não crie um domínio para ela; mantenha somente o acesso interno da API.

## 2. Primeiro acesso

No primeiro deploy, defina temporariamente:

```text
RUN_SEED_ON_BOOT=1
SEED_SUPERADMIN_EMAIL=<seu e-mail administrativo>
SEED_SUPERADMIN_PASSWORD=<senha forte e exclusiva>
SEED_SUPERADMIN_NAME=<seu nome>
```

Depois que o superadministrador for criado e o login for confirmado, volte `RUN_SEED_ON_BOOT` para `0` e remova `SEED_SUPERADMIN_PASSWORD` do painel. Ative o MFA imediatamente.

## Healthchecks

- Liveness: `GET /health` ou `/health/live`
- Readiness: `GET /health/ready` → 200

## Regras de produção

1. API com uma réplica até os locks distribuídos serem homologados.
2. O entrypoint executa `prisma migrate deploy`, nunca `db push` destrutivo.
3. HTTPS deve terminar no proxy do EasyPanel; `NODE_ENV=production` ativa cookies seguros.
4. Nunca envie `.env`, `.env.docker`, banco local, uploads ou sessões do navegador ao GitHub.
5. Homologue login, MFA, envio de e-mail, WebSocket e WhatsApp antes de receber tráfego comercial.

## Rede interna

- Web → API: `http://api:4000`
- API → Evolution: `http://evolution:8080`
- API → Postgres: `postgres:5432`
- API → Redis: `redis:6379`
