# NexaFlow — Inventário Final da Plataforma

**Data:** 2026-07-17  
**Escopo:** monorepo completo (web, api, db, docker)  
**Método:** inventário estático + typecheck + suíte de testes + health Docker + análise de logs

---

## 1. Frontend (Next.js 15 — `apps/web`)

### Rotas públicas
| Rota | Arquivo |
|------|---------|
| `/` | `app/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/register` | `app/register/page.tsx` |
| `/docs/api` | `app/docs/api/page.tsx` |

### Tenant (`/app/*`)
| Rota | Módulo |
|------|--------|
| `/app` | Início / dashboard |
| `/app/inbox` | Conversas |
| `/app/contacts` | Contatos |
| `/app/crm` | Funil |
| `/app/tasks` | Tarefas |
| `/app/campaigns` | Campanhas |
| `/app/automations` | Fluxos |
| `/app/ai` | Agentes |
| `/app/ai/learning` | Aprendizado |
| `/app/knowledge` | Conhecimento |
| `/app/team` | Equipe |
| `/app/integrations` | Canais (WhatsApp) |
| `/app/reports` | Relatórios |
| `/app/settings` | Configurações |
| `/app/settings/api` | API keys |
| `/app/settings/webhooks` | Webhooks |
| `/app/onboarding` | Onboarding empresa |
| `/app/brand` | Marca |
| `/app/whats-new` | Novidades / changelog |
| `/app/account` | Conta |
| `/app/account/preferences` | Preferências + tour + NIA |
| `/app/account/security` | Segurança / MFA |
| `/app/account/sessions` | Sessões |
| `/app/account/companies` | Empresas do usuário |

### Superadmin (`/admin/*`)
| Rota | Módulo |
|------|--------|
| `/admin` | Overview |
| `/admin/companies` | Empresas |
| `/admin/tenants/[id]` | Detalhe tenant |
| `/admin/users` | Usuários |
| `/admin/finance` | Financeiro |
| `/admin/plans` | Planos |
| `/admin/audit` | Auditoria |
| `/admin/system/releases` | Changelog / versões |
| `/admin/system/diagnostics` | Logs e diagnóstico |
| `/admin/system/health` | Saúde da plataforma |

### Shell / cross-cutting
- `app-shell` (sidebar, menu usuário, ambient, banners)
- `NexaflowAssistantProvider` (NIA drawer)
- `PlatformTourController`
- `HumanQueueBanner`, `WhatsAppStatusBanner`
- `CommandPalette`, notificações

---

## 2. Backend (Fastify — `apps/api`)

### Route modules
| Arquivo | Domínio |
|---------|---------|
| `auth.ts` | Login, MFA, sessões, tour, invites accept |
| `contacts.ts` | Contatos / score |
| `conversations.ts` | Inbox, mensagens, waiting-human |
| `crm.ts` | Funil / oportunidades |
| `tasks.ts` | Tarefas |
| `ai-agents.ts` | Agentes + import-config |
| `agent-advanced.ts` | Metrics, gaps, learning, versions |
| `whatsapp.ts` | Canais, QR, webhooks Evolution |
| `integrations.ts` | Webhooks endpoints, API keys auxiliares |
| `misc.ts` | Settings, campaigns, team, dashboard, audit tenant |
| `admin.ts` | Superadmin completo |
| `public-api-v1.ts` | API pública (API key) |
| `nexaflow-assistant.ts` | NIA |
| `platform-changelog.ts` | Changelog |
| `platform-diagnostics.ts` | Diagnóstico / health admin |

### Serviços (93 arquivos TS)
Destaques: `ai`, `access-gate`, `entitlements`, `whatsapp/*`, `agent-tools`, `automations/engine`, `platform-ai-degradation`, `platform-ai-health`, `nexaflow-assistant/*`, `security/*`, `webhooks/*`.

### Health
- `GET /health` — liveness  
- `GET /health/ready` — readiness (Postgres CRITICAL, Redis, mail, WA gateway, AI)

---

## 3. Banco (Prisma — 58 models)

Plan, Tenant, User, Membership, auth (RefreshToken, AuthSession, Mfa, LoginAttempt, PasswordReset, UserInvite, SecurityEvent), CRM (Contact, Pipeline, Opportunity, Task…), Channel, Conversation, Message, AiAgent + learning/version/tools, Knowledge*, Automation*, Campaign, Webhook*, ApiKey, ApiUsageLog, AuditLog, Notification, Subscription, Payment, AiUsageLog, Help* (NIA), PlatformRelease*.

Migrations em `packages/db/prisma/migrations/` (incl. changelog 20260717050000).

---

## 4. Infra Docker

| Serviço | Função |
|---------|--------|
| nexaflow-api | API + workers leves in-process |
| nexaflow-web | Next standalone |
| nexaflow-postgres | DB |
| nexaflow-redis | Rate limit / cache |
| nexaflow-evolution | WhatsApp gateway |

---

## 5. Integrações

| Sistema | Status inventário |
|---------|-------------------|
| Groq (IA) | Env `GROQ_*`, prioridade em `env.ts` |
| Evolution API | Webhooks + status |
| Mail | Provider log/resend |
| Webhooks outbound | Tenant endpoints |
| API pública v1 | API keys |

---

## 6. O que **não** é inventário de produto completo

- QA visual/manual em todos os viewports (parcialmente coberto por scripts QA históricos em `docs/`)
- E2E Playwright browser full suite (existe setup; não reexecutado ponta-a-ponta nesta auditoria)
- Canal Email/Telegram de campanhas (marcado futuro na UI)
