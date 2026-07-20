# NexaFlow AI

Plataforma SaaS para atendimento no WhatsApp, CRM, automações e agentes de IA, criada para pequenas e médias empresas brasileiras.

## Principais áreas

- Site público comercial com catálogo de planos e pedido de demonstração
- Autenticação, sessões, MFA e recuperação de acesso
- Multiempresa com isolamento por tenant e papéis de acesso
- Caixa de entrada do WhatsApp, distribuição e handoff humano
- Contatos, funil comercial, oportunidades e tarefas
- Agentes de IA com modos Copiloto, Aprovação e Automático
- Base de conhecimento, automações, campanhas e relatórios
- Superadmin para empresas, usuários, planos, financeiro, auditoria e leads comerciais
- API pública, webhooks, observabilidade e controles de produção

## Stack

| Camada | Tecnologia |
| --- | --- |
| Web | Next.js 15, React 19, TypeScript, Tailwind, TanStack Query, Zustand |
| API | Fastify, Zod, JWT, WebSocket |
| Banco | PostgreSQL + Prisma |
| Cache | Redis |
| IA | Adaptadores Groq, xAI e OpenAI |

## Requisitos locais

- Node.js 22 ou superior
- npm
- PostgreSQL 16 e Redis 7, normalmente via Docker Desktop

O schema oficial usa PostgreSQL. SQLite não é suportado pelo schema principal.

## Início rápido

1. Instale as dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env` e gere secrets locais próprios.

3. Suba PostgreSQL e Redis:

```bash
docker compose up -d postgres redis
```

4. Gere o Prisma Client, aplique o schema e crie os dados iniciais quando necessário:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

`db:push` é apenas para desenvolvimento local descartável. Ambientes compartilhados e produção devem usar migrações versionadas:

```bash
npm run db:migrate:deploy
```

5. Inicie web e API:

```bash
npm run dev
```

- Site e painel: `http://localhost:3000`
- API: `http://localhost:4000`
- Liveness: `http://localhost:4000/health`
- Readiness: `http://localhost:4000/health/ready`

As credenciais iniciais vêm exclusivamente das variáveis `SEED_SUPERADMIN_*`. Não use senhas de demonstração em produção.

## Site comercial e leads

- `/` apresenta o produto e os recursos
- O catálogo de preços consulta `GET /public/plans`, usando o banco como fonte de verdade
- O formulário envia para `POST /public/demo-requests`
- Pedidos ficam em `SalesLead` e aparecem em `/admin/sales-leads`
- Configure `SALES_EMAIL` para também receber notificação por e-mail

## Comandos de qualidade

```bash
npm run build
npm test
npm run security:check
```

A suíte completa requer o PostgreSQL de teste em `DATABASE_URL_TEST`. O padrão local é o schema isolado `nexaflow_test`.

## Produção

Antes do deploy, revise [docs/PREDEPLOY-CHECKLIST.md](docs/PREDEPLOY-CHECKLIST.md) e [docs/PRODUCTION-ENVIRONMENT-VARIABLES.md](docs/PRODUCTION-ENVIRONMENT-VARIABLES.md).

Para EasyPanel, use o compose endurecido [`docker-compose.easypanel.yml`](docker-compose.easypanel.yml) e siga [`docs/EASYPANEL-DEPLOYMENT.md`](docs/EASYPANEL-DEPLOYMENT.md). O `docker-compose.yml` da raiz permanece voltado ao desenvolvimento local.

Requisitos mínimos:

- HTTPS, URLs públicas e CORS restrito
- Secrets exclusivos para JWT, cookies e criptografia
- `SUPERADMIN_MFA_REQUIRED=1`
- PostgreSQL com backup e restore testado
- Redis disponível conforme a política do ambiente
- `MAIL_PROVIDER=resend`, remetente verificado e `SALES_EMAIL`
- Migrações aplicadas com `prisma migrate deploy`
- `RUN_SEED_ON_BOOT=0`
- Volumes persistentes para uploads e sessões do WhatsApp
- Smoke test real de envio e recebimento no WhatsApp

O entrypoint da API falha se uma migração não puder ser aplicada. Ele nunca executa `db push --accept-data-loss` automaticamente em produção.

## Estrutura

```text
apps/
  api/       API Fastify
  web/       aplicação Next.js
packages/
  db/        schema, migrações e catálogo oficial
docs/        arquitetura, segurança, operação e homologação
scripts/     setup, diagnóstico e manutenção
```

## WhatsApp

A plataforma suporta gateway central Baileys e integrações Evolution API/WAHA. Esses caminhos exigem homologação com aparelho e número reais antes de uso comercial. Provedores não oficiais podem impor risco de bloqueio; avalie o modelo operacional e os termos aplicáveis.
