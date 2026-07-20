# Backend Final Inventory — NexaFlow

**Data:** 2026-07-17  
**Fonte:** auditoria estática monorepo + Docker live

---

## Applications

| App | Stack | Porta | Role |
|-----|-------|-------|------|
| `@nexaflow/api` | Fastify + Prisma | 4000 | Backend HTTP/WS |
| `@nexaflow/web` | Next.js 15 | 3000 | UI + proxy `/nexa-api` |
| `@nexaflow/db` | Prisma schema + migrations | — | Package DB |
| Evolution API | WhatsApp gateway | 8080 | Canal WA |
| Postgres 16 | Primary store | 5432 | Persistência |
| Redis 7 | Cache / rate-limit / sessions | 6379 | Infra |

---

## API routes (apps/api/src/routes)

| Arquivo | Domínio |
|---------|---------|
| `auth.ts` | Login, refresh, logout, MFA, sessions, password |
| `admin.ts` | Superadmin: tenants, plans, users, finance, audit |
| `ai-agents.ts` | CRUD agentes, modes, tools, knowledge links |
| `agent-advanced.ts` | Versions, metrics, sandbox, learning, gaps |
| `tenant-ai.ts` | BYOK / provider config empresa |
| `nexaflow-assistant.ts` | NIA bootstrap/chat/threads/feedback |
| `conversations.ts` | Inbox, assign, resume-ai, notes, AI suggest |
| `whatsapp.ts` | Channels, QR, connect/disconnect, webhooks |
| `contacts.ts` | Contatos / leads |
| `crm.ts` | Funil / oportunidades |
| `tasks.ts` | Tarefas |
| `integrations.ts` | Integrações |
| `misc.ts` | Settings, dashboard, notifications, tours |
| `public-api-v1.ts` | API pública v1 (API keys) |
| `platform-changelog.ts` | Novidades plataforma |
| `platform-diagnostics.ts` | Diagnósticos superadmin |

---

## Services (principais)

| Área | Path |
|------|------|
| AI Core | `services/ai-core/*` |
| AI / WA reply | `services/ai.ts`, `whatsapp/*` |
| Agent tools / security / learning / versioning | `agent-*.ts` |
| Knowledge | `knowledge*.ts` |
| Handoff | `human-handoff.ts` |
| Access Gate | `access-gate.ts` |
| Billing / entitlements | `billing.ts`, `entitlements.ts` |
| Security | `security/*` (auth, MFA, CSRF, crypto, permissions, redis, mail…) |
| Webhooks | `webhooks/*` |
| NIA | `nexaflow-assistant/*` |
| CSAT / close | `csat.ts`, `conversation-close.ts` |
| Audit | `audit.ts` |
| Notifications | `notifications.ts` |

---

## Middlewares / Guards

- `plugins/auth.ts` — JWT cookie/bearer, `requireTenant`, `requirePermission`
- CSRF Origin/Referer em mutações
- CORS + trust proxy
- Rate limit (Redis quando disponível)
- Production guard (secrets, MFA superadmin)
- Access Gate (capabilities por status financeiro)
- Superadmin MFA gate (prod)

---

## Jobs / schedulers

- Webhook retry scheduler (startup)
- Conversation inactivity close (config)
- WhatsApp session restore
- Platform AI health cooldowns

---

## WebSockets

- `ws/hub.ts` — broadcast por tenant (`conversation.updated`, notifications)

---

## Database

| Item | Valor |
|------|--------|
| Provider | PostgreSQL |
| Migrations | 11 SQL under `packages/db/prisma/migrations` |
| Test schema | `nexaflow_test` (isolado) |

Migrations: init, plans, billing, agents 2.0, NIA, changelog, help freshness, tenant AI, conversation close, knowledge links, webhooks/api keys.

---

## External integrations

| Provider | Uso | Ready |
|----------|-----|-------|
| Groq / OpenAI / xAI / OpenRouter / Mistral | AI Core OpenAI-compat | código ready |
| Anthropic / Gemini | stubs | not productionReady |
| Evolution API | WhatsApp | ops |
| Resend | e-mail | ops (default log em dev) |

---

## Health

| Endpoint | Tipo |
|----------|------|
| `GET /health` | Liveness simplificado |
| `GET /health/live` | Processo vivo |
| `GET /health/ready` | DB CRITICAL + Redis CRITICAL se exigido; mail/WA/AI OPTIONAL |

---

## Volumes (Docker)

- `uploads` (avatars, logos)
- `wa-sessions` / Evolution data
- Postgres / Redis data

---

## Docs de certificação relacionados

- `BACKEND-FINAL-CERTIFICATION.md`
- `BACKEND-PRODUCTION-READINESS.md`
- `SECURITY-FINAL-AUDIT.md`
- `AI-AND-AGENTS-FINAL-CERTIFICATION.md`
- `HANDOFF-FINAL-CERTIFICATION.md`
- `API-PRODUCTION-CERTIFICATION.md`
- `WEBHOOKS-PRODUCTION-CERTIFICATION.md`
- `BACKUP-AND-RESTORE.md`
- `EASYPANEL-DEPLOYMENT.md`
