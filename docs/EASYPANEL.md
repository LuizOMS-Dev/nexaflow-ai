# Deploy EasyPanel

Stack de produção: `docker-compose.easypanel.yml`.  
Não use `docker-compose.yml` (é só Docker Desktop local).

Crie um serviço **Compose**, não App. Não existe Dockerfile na raiz.

## Serviços

| Serviço | Papel | Porta interna | Público |
|---------|--------|---------------|---------|
| `postgres-main` | PostgreSQL 16 (serviço separado) | 5432 | não |
| `redis` | cache / rate-limit | 6379 | não |
| `waha` | WhatsApp HTTP API | 3000 | não |
| `api` | Fastify + WebSocket | 4000 | domínio API |
| `web` | Next.js | 3000 | domínio do app |

O Compose contém `redis`, `waha`, `api` e `web`. O `postgres-main` é criado como serviço separado e a API recebe a conexão exclusivamente por `DATABASE_URL` nas variáveis protegidas do EasyPanel.

## Domínios

| Host | Serviço interno | Porta |
|------|-----------------|-------|
| app | `web` | 3000 |
| api / WS | `api` | 4000 |

HTTPS pelo Traefik do EasyPanel.

## Volumes

| Volume | Conteúdo |
|--------|----------|
| `redis_data` | AOF do Redis |
| `uploads_data` | avatars, logos, mídia |
| `wa_sessions` | sessões Baileys |
| `waha_sessions` | sessões WAHA |
| `waha_media` | arquivos temporários WAHA |

O volume do PostgreSQL pertence ao serviço separado `postgres-main`, não ao Compose.

## Health

- API liveness: `GET /health`
- API ready (Postgres + Redis): `GET /health/ready`
- Healthcheck do container da API: `GET /health`
- Web: `GET /login`

## Migrations

O entrypoint da API roda `prisma migrate deploy` em todo boot.  
Não usa `db push`. Seed automático fica desligado (`RUN_SEED_ON_BOOT=0`).

Banco existente: restaure o dump no serviço `postgres-main` **antes** de apontar tráfego, com a API parada; depois reinicie o Compose. O volume do serviço PostgreSQL sobrevive a rebuilds do NexaFlow.

## Variáveis

Ver [`.env.easypanel.example`](../.env.easypanel.example). Cadastrar só no EasyPanel.
