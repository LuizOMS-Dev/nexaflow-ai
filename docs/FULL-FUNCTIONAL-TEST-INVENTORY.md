# Inventário funcional completo — NexaFlow

**Data:** 2026-07-17  
**Ambiente:** Docker local (`nexaflow-api`, `nexaflow-web`, `postgres`, `redis`, `evolution`)  
**Fonte:** código (apps/web + apps/api), `nav-registry`, rotas Next.js, rotas Fastify, banco real  
**Escopo:** inventário de superfície (Fase 1 do prompt mestre). **Inventariar ≠ homologar.**

---

## 1. Páginas Web (Next.js)

### Públicas / auth
| Rota | Arquivo |
|------|---------|
| `/` | `app/page.tsx` |
| `/login` | `app/login/page.tsx` |
| `/register` | `app/register/page.tsx` |
| `/docs/api` | `app/docs/api/page.tsx` |

### App tenant (`/app/*`)
| Rota | Módulo | Menu sidebar (nav-registry) |
|------|--------|------------------------------|
| `/app` | Home | Início |
| `/app/inbox` | Conversas | Conversas |
| `/app/contacts` | Contatos | Contatos |
| `/app/crm` | Funil | Funil |
| `/app/tasks` | Tarefas | Tarefas |
| `/app/campaigns` | Campanhas | Campanhas |
| `/app/automations` | Fluxos | Fluxos |
| `/app/ai` | Agentes | Agentes |
| `/app/ai/learning` | Aprendizado | Aprendizado |
| `/app/knowledge` | Conhecimento | Conhecimento |
| `/app/team` | Equipe | Equipe |
| `/app/integrations` | Canais | Canais |
| `/app/reports` | Relatórios | Relatórios |
| `/app/settings` | Configurações | Configurações |
| `/app/settings/api` | API | API |
| `/app/settings/webhooks` | Webhooks | Webhooks |
| `/app/onboarding` | Onboarding | (fluxo) |
| `/app/brand` | Marca | (secundário) |
| `/app/whats-new` | Novidades | (conta/novidades) |
| `/app/account` | Minha Conta | Minha Conta |
| `/app/account/preferences` | Preferências | Preferências |
| `/app/account/security` | Segurança | Segurança |
| `/app/account/sessions` | Sessões | (conta) |
| `/app/account/companies` | Empresas | (conta) |

### Superadmin (`/admin/*`)
| Rota | Módulo |
|------|--------|
| `/admin` | Overview |
| `/admin/companies` | Empresas |
| `/admin/tenants/[id]` | Detalhe empresa |
| `/admin/users` | Usuários |
| `/admin/finance` | Financeiro |
| `/admin/plans` | Planos |
| `/admin/audit` | Auditoria |
| `/admin/system/health` | Saúde |
| `/admin/system/diagnostics` | Diagnósticos |
| `/admin/system/releases` | Releases / changelog |

### Proxy
| Rota | Função |
|------|--------|
| `/nexa-api/[...path]` | Proxy web → API |

**Total páginas inventariadas:** ~35 rotas de UI.

---

## 2. Menus e navegação

### Sidebar tenant (allowlist NIA)
Ver `apps/api/src/services/nexaflow-assistant/nav-registry.ts` — 18 itens com permission/entitlement.

### Superadmin shell
Overview, Empresas, Usuários, Financeiro, Planos, Auditoria, Sistema (Health / Diagnostics / Releases).

### Minha Conta
Perfil, Preferências, Segurança, Sessões, Empresas, Novidades (whats-new).

---

## 3. Domínios de backend (API)

Arquivos em `apps/api/src/routes/` (≥ 179 handlers registrados):

| Arquivo | Domínio |
|---------|---------|
| `auth.ts` | Login, MFA, refresh, logout, profile, avatar, tour, sessions |
| `admin.ts` | Superadmin tenants/users/plans/impersonate/logs/settings |
| `contacts.ts` | CRUD contatos + import |
| `conversations.ts` | Inbox, mensagens, assign, notes, AI suggest/send |
| `crm.ts` | Pipelines, board, opportunities |
| `tasks.ts` | Tarefas |
| `ai-agents.ts` | Agentes CRUD, test sandbox, chat, interview |
| `agent-advanced.ts` | Versioning, suites, métricas avançadas |
| `misc.ts` | Knowledge, automations, campaigns, team, dashboard, settings, tags, channels… |
| `whatsapp.ts` | Status, connect, QR, disconnect, gateway |
| `integrations.ts` | Integrações / canais extras |
| `tenant-ai.ts` | Provider IA tenant / BYOK |
| `public-api-v1.ts` | API pública v1 (API keys) |
| `nexaflow-assistant.ts` | NIA bootstrap/chat/feedback |
| `platform-changelog.ts` | Releases |
| `platform-diagnostics.ts` | Diagnósticos admin |
| Webhooks | WhatsApp Evolution + outbound endpoints |

### Endpoints críticos exercitados em homologação API (2026-07-17)
Ver `docs/_homolog-api-results.txt` e matriz.

---

## 4. Entidades de banco (Prisma)

61 tabelas (amostra): User, Tenant, Membership, Contact, Conversation, Message, AiAgent, KnowledgeDoc, Pipeline, Opportunity, Task, Campaign, Automation, Channel, ApiKey, WebhookEndpoint, Payment, Plan, Subscription, AuthSession, HelpKnowledgeDoc, ContactMemory, KnowledgeGap, LearningSuggestion, PlatformRelease, …

---

## 5. Integrações

| Integração | Status ambiente local |
|------------|----------------------|
| Groq (LLM) | Configurado (`llama-3.1-8b-instant`) — teste conexão OK |
| Evolution API (WhatsApp) | Container healthy; tenant **CONNECTED** |
| Postgres 16 | Healthy |
| Redis 7 | Healthy |
| Mail | Provider `log` (dev) |
| OpenAI / Anthropic / Gemini / xAI / OpenRouter / Mistral | Catalogados no multi-provider; **não** todos com key real neste ambiente |

---

## 6. Superfícies de UI a clicar (checklist)

Por página principal, inventário genérico de elementos:

- Botões primários (Criar / Salvar / Excluir / Arquivar / Duplicar / Conectar)
- Menus ⋯ / contextuais
- Filtros, busca, tabs, switches
- Modais e drawers de formulário
- Tabelas (sort, paginação, bulk)
- Dropdowns de status/prioridade/modo
- Banners (Access Gate, WhatsApp, handoff humano, NIA)

**Observação:** o inventário de *cada* botão/modal por página exige varredura UI contínua (Fase 3). Nesta rodada a ênfase foi **API real + Docker + unitários + smoke web HTTP**.

---

## 7. Jobs / eventos / background

- Campaign batch (`CAMPAIGN_BATCH_LIMIT`)
- Automation engine
- WhatsApp session restore on boot
- Webhook delivery + retry
- Human handoff queue / notifications
- Platform AI health cooldown (rate limit)

---

## 8. Segurança transversal inventariada

- JWT + refresh + sessions + logout-all
- MFA + step-up + recovery codes
- RBAC permissions por role
- Multi-tenant `tenantId` em queries
- Access Gate (user/company/payment)
- Impersonation com reason
- Agent security global (não configurável)
- NIA security patterns
- Webhook SSRF protection
- API keys públicas
- CSRF / cookies (camada web)

---

## 9. Contas de teste no ambiente

| Papel | Email | Observação |
|-------|-------|------------|
| SUPERADMIN | `E2E_SUPERADMIN_EMAIL` | Credencial fornecida por variável; sem fallback no repositório |
| Tenant ADMIN | `E2E_TENANT_EMAIL` | Credencial opcional fornecida por variável para a homologação |

---

*Documento gerado na homologação funcional 2026-07-17. Atualizar quando novas rotas forem criadas.*
