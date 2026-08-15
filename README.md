# NexaFlow AI

Plataforma de atendimento, CRM e agentes de IA para WhatsApp.  
Feita para pequenas e médias empresas brasileiras: conversas, contatos, vendas e automação no mesmo lugar.

- **Web:** http://localhost:3000
- **API:** http://localhost:4000/health

Não existe login padrão. O primeiro usuário nasce no seed.

---

## O que a plataforma faz

| Área | Função |
|------|--------|
| Inbox | Fila de WhatsApp, histórico e distribuição para a equipe |
| Agentes de IA | Copiloto, aprovação ou automático, com base de conhecimento da empresa |
| CRM | Contatos, funil e oportunidades ligados à conversa |
| Automações | Tarefas e respostas padronizadas sem perder contexto |
| Admin | Tenants isolados, papéis, MFA, auditoria e planos |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 15 · React 19 · Tailwind · TanStack Query |
| Backend | Fastify 5 · Zod · WebSocket |
| Banco | PostgreSQL 16 · Prisma 6 |
| Cache | Redis 7 |
| WhatsApp | Baileys (embutido). Evolution ou WAHA opcionais |
| IA | Groq → xAI → OpenAI (nessa ordem, se a chave existir) |

Requisito: **Node.js 22+**.

---

## Monorepo

```
nexaflow-ai/
├── apps/
│   ├── api/                 Backend Fastify
│   └── web/                 App do tenant + admin da plataforma
├── packages/
│   └── db/                  Schema Prisma, migrations e seed
├── e2e/                     Playwright
├── scripts/
│   ├── setup.js             Bootstrap local
│   ├── docker/              Stack no Windows
│   ├── db/                  Planos e tour
│   ├── ops/                 EasyPanel e one-offs
│   └── qa/                  Checagens de UI
├── docker-compose.yml
└── package.json
```

| Pacote | Nome npm | Papel |
|--------|----------|--------|
| `apps/web` | `@nexaflow/web` | Interface |
| `apps/api` | `@nexaflow/api` | API, WhatsApp, IA |
| `packages/db` | `@nexaflow/db` | Banco |

Scripts avulsos da API ficam em `apps/api/src/scripts/`. Os da raiz estão em `scripts/` — detalhes em [`scripts/README.md`](scripts/README.md).

---

## Começar

### 1. Setup

```bash
npm run setup
```

Cria o `.env` a partir de `.env.example` e instala as dependências.

### 2. Banco e cache

```bash
docker compose up -d postgres redis
npm run db:migrate:deploy
```

### 3. Superadmin

No `.env`, defina:

```env
SEED_SUPERADMIN_EMAIL=voce@empresa.com
SEED_SUPERADMIN_PASSWORD=uma-senha-forte-16+
```

A senha precisa de **pelo menos 16 caracteres** e 3 classes (maiúscula, minúscula, número ou símbolo).

```bash
npm run db:seed
npm run dev
```

Abra http://localhost:3000 e entre com o e-mail e a senha do seed.

---

## Docker completo

Sobe API, web, Postgres e Redis de uma vez:

```bash
copy .env.docker.example .env.docker
```

Preencha `SEED_SUPERADMIN_*` (e a chave de IA, se quiser) no `.env.docker`, depois:

```bash
npm run docker:up
```

WhatsApp local usa **Baileys** dentro da API. Conecte pelo QR em **Canais**.

---

## Variáveis importantes

Tudo está documentado em [`.env.example`](.env.example). O mínimo para desenvolver:

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis |
| `JWT_SECRET` / `COOKIE_SECRET` / `ENCRYPTION_KEY` | Auth e dados em repouso |
| `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` | Primeiro admin |
| `GROQ_API_KEY` | IA (opcional no começo) |
| `WA_GATEWAY_PROVIDER` | `baileys` (padrão), `evolution`, `waha` ou `simulated` |

Em produção, troque todos os secrets. Os valores de desenvolvimento **não** servem para VPS.

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run setup` | Instala e gera o `.env` |
| `npm run dev` | API + web juntos |
| `npm run dev:api` | Só a API |
| `npm run dev:web` | Só o front |
| `npm run build` | Build dos três workspaces |
| `npm run db:migrate:deploy` | Aplica migrations |
| `npm run db:seed` | Cria o superadmin |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Vitest da API |
| `npm run test:e2e` | Playwright |
| `npm run security:check` | Checagem de segurança |
| `npm run docker:up` | Stack Docker no Windows |

---

## Produção (EasyPanel)

Deploy pelo GitHub com serviço **Compose** e o arquivo `docker-compose.easypanel.yml`.  
Guia: [`docs/EASYPANEL.md`](docs/EASYPANEL.md). Variáveis: [`.env.easypanel.example`](.env.easypanel.example).

Não publique Postgres, Redis nem WAHA. O front fala com a API em `/nexa-api` (mesmo origin) e o WebSocket no domínio da API (`wss://…/ws`).

## Licença

Repositório privado. Todos os direitos reservados.
