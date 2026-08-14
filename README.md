# NexaFlow AI

Plataforma de atendimento, CRM e agentes de IA para WhatsApp.

Monorepo atual — sem histórico antigo.

## Estrutura

```
nexaflow-ai/
├── apps/
│   ├── api/             Fastify 5 · rotas, serviços, WhatsApp, IA
│   └── web/             Next.js 15 · app do tenant + admin da plataforma
├── packages/
│   └── db/              Prisma 6 · schema, migrations, seed
├── e2e/                 Playwright
├── scripts/
│   ├── setup.js         Bootstrap local
│   ├── docker/          Subir stack no Windows
│   ├── db/              Manutenção de planos / tour
│   ├── ops/             EasyPanel e one-offs
│   └── qa/              Checagens de UI
├── docker-compose.yml
└── package.json
```

## Requisitos

- Node.js 22+
- PostgreSQL 16 e Redis 7 (ou Docker Desktop)

## Setup local

```bash
npm run setup
docker compose up -d postgres redis
npm run db:migrate:deploy
```

Defina no `.env` um superadmin e rode o seed:

```bash
# SEED_SUPERADMIN_EMAIL e SEED_SUPERADMIN_PASSWORD (16+ caracteres)
npm run db:seed
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/health

Não existe login padrão. O primeiro usuário sai do seed.

## Docker completo

```bash
copy .env.docker.example .env.docker
npm run docker:up
```

## Workspaces

| Pacote | Papel |
|--------|--------|
| `@nexaflow/web` | Frontend |
| `@nexaflow/api` | Backend |
| `@nexaflow/db` | Banco |

## Scripts

| Comando | Uso |
|---------|-----|
| `npm run dev` | API + Web juntos |
| `npm run build` | Build dos três workspaces |
| `npm test` | Vitest da API |
| `npm run test:e2e` | Playwright |
| `npm run security:check` | Checagem de segurança |
