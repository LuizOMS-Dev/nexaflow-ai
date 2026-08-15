# Deploy EasyPanel

Stack de produção: `docker-compose.easypanel.yml`.  
Não use `docker-compose.yml` (é só Docker Desktop local).

Crie um serviço **Compose**, não App. Não existe Dockerfile na raiz.

## Serviços

| Serviço | Papel | Porta interna | Público |
|---------|--------|---------------|---------|
| `postgres` | PostgreSQL 16 | 5432 | não |
| `redis` | cache / rate-limit | 6379 | não |
| `waha` | WhatsApp HTTP API | 3000 | não |
| `api` | Fastify + WebSocket | 4000 | domínio API |
| `web` | Next.js | 3000 | domínio do app |

Comunicação interna: `postgres`, `redis`, `waha`, `api`, `web` (rede do Compose).

## Domínios

| Host | Serviço interno | Porta |
|------|-----------------|-------|
| app | `web` | 3000 |
| api / WS | `api` | 4000 |

HTTPS pelo Traefik do EasyPanel.

## Volumes

| Volume | Conteúdo |
|--------|----------|
| `postgres_data` | banco |
| `redis_data` | AOF do Redis |
| `uploads_data` | avatars, logos, mídia |
| `wa_sessions` | sessões Baileys |
| `waha_sessions` | sessões WAHA |
| `waha_media` | arquivos temporários WAHA |

## Health

- API liveness: `GET /health`
- API ready (Postgres + Redis): `GET /health/ready` — healthcheck do container
- Web: `GET /login`

## Migrations

O entrypoint da API roda `prisma migrate deploy` em todo boot.  
Não usa `db push`. Seed automático fica desligado (`RUN_SEED_ON_BOOT=0`).

Banco existente: restore do dump **antes** de apontar tráfego, com a API parada ou em seguida `restart` do Compose. O volume `postgres_data` sobrevive a rebuild.

## Variáveis

Ver [`.env.easypanel.example`](../.env.easypanel.example). Cadastrar só no EasyPanel.
