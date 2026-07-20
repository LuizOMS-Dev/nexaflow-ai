# NexaFlow AI — Final Production Audit

**Data da auditoria:** 2026-07-15  
**Escopo:** monorepo NexaFlow AI (inspeção estática + estado conhecido do repositório)  
**Método:** código/config + suítes de teste existentes  
**Classificação:** `PRESERVADO` · `CORRIGIDO` · `IMPLEMENTADO` · `PENDENTE` · `BLOQUEADOR` · `NÃO BLOQUEADOR`

> Atualização pós-auditoria (mesma data): separação SUPERADMIN global vs tenant; importação em lote de Conhecimento. Ver §14.

---

## Sumário executivo

| Dimensão | Estado | Nota |
|----------|--------|------|
| Produto / features | Amplamente **IMPLEMENTADO** | Auth, MFA, CRM, inbox, IA, WA, admin, multi-tenant, knowledge import |
| Hardening de segurança (código) | **IMPLEMENTADO** / **CORRIGIDO** | Fail-closed, CSRF, RBAC, isolation tests |
| Path Docker “production” | **BLOQUEADOR** | Schema Prisma = SQLite vs Postgres no compose; secrets default |
| Secrets no repositório | **BLOQUEADOR** | `.env` / `.env.docker` com chaves e senhas |
| Migrações / backup | **PENDENTE** | Sem `prisma/migrations`; sem job de backup |
| Homologação checklist | **PENDENTE** | Controles em `PRODUCTION-SECURITY-CHECKLIST.md` ainda PENDING operacionalmente |

**Veredito:** núcleo de aplicação maduro em código e coberto por testes de segurança/WhatsApp, mas o **stack Docker de produção não está coerente com o schema Prisma nem com o fail-closed de secrets**. Classificação honesta:

```
READY_FOR_INTERNAL_TESTING
```

Não usar `READY_FOR_PRODUCTION` enquanto P0 (§13) não forem resolvidos.

---

## 1. Architecture

| Componente | Evidência | Status |
|------------|-----------|--------|
| Monorepo npm workspaces | `package.json` → `apps/*`, `packages/*` | **IMPLEMENTADO** |
| Frontend Next.js 15 + React 19 | `apps/web` | **IMPLEMENTADO** |
| Backend Fastify 5 | `apps/api` | **IMPLEMENTADO** |
| DB Prisma | `packages/db/prisma/schema.prisma` | **IMPLEMENTADO** (provider **sqlite** no schema) |
| Redis | compose + `redis.ts` | **IMPLEMENTADO** |
| WhatsApp | Evolution + Baileys + WAHA | **IMPLEMENTADO** |
| Docker full stack | `docker-compose.yml` | **IMPLEMENTADO** (com blockers) |
| Proxy same-origin | `/nexa-api/[...path]` | **IMPLEMENTADO** |
| WebSocket | `/ws` + hub in-memory | **IMPLEMENTADO** · multi-réplica **NÃO BLOQUEADOR** |

### Serviços (compose)

| Service | Portas host | Volume |
|---------|-------------|--------|
| postgres | 5432 | `postgres_data` |
| redis | 6379 | `redis_data` |
| evolution | 8080 | `evolution_data` |
| api | 4000 | `uploads_data`, `wa_sessions` |
| web | 3000 | — |

### Boot API (Docker)

1. `prisma generate`  
2. `prisma db push --accept-data-loss`  
3. `seed.ts` (erro engolido)  
4. `node apps/api/dist/index.js` + restore Baileys  

---

## 2. Env vars

| Var | Compose default | Produção (código) |
|-----|-----------------|-------------------|
| `DATABASE_URL` | Postgres | Obrigatória |
| `JWT_SECRET` | fraco (`change-me`) | Fail-closed se fraco |
| `ENCRYPTION_KEY` | **ausente** | Obrigatório em prod |
| `CORS_ORIGIN` | localhost | HTTPS allowlist em prod |
| `REDIS_URL` | redis interno | Rate limit |
| `SEED_SUPERADMIN_*` | plain no compose | Defaults sensíveis |
| `SEED_CREATE_TENANT` | `0` | Plataforma limpa no seed |
| `SEED_DEMO_ENABLED` | ausente | Seed aborta em `NODE_ENV=production` |

**Classificação:** defaults Docker **BLOQUEADOR** · secrets em disco **BLOQUEADOR** · docs env **PENDENTE**

---

## 3. External dependencies

| Integração | Status |
|------------|--------|
| Groq / xAI / OpenAI | **IMPLEMENTADO** (prioridade Groq) |
| Evolution / Baileys / WAHA | **IMPLEMENTADO** |
| E-mail SMTP/Resend | **PENDENTE** (`mail.ts`: log/none) |

---

## 4. Persistent volumes

| Volume | Conteúdo | Status |
|--------|----------|--------|
| `postgres_data` | DB app + Evolution | **IMPLEMENTADO** |
| `redis_data` | cache / RL | **IMPLEMENTADO** |
| `uploads_data` | avatares/media | **IMPLEMENTADO** |
| `evolution_data` | sessões Evolution | **IMPLEMENTADO** |
| `wa_sessions` | Baileys auth | **IMPLEMENTADO** |

Backup automatizado: **PENDENTE** / **BLOQUEADOR** operacional.

---

## 5. Auth / MFA / Impersonation

| Controle | Status |
|----------|--------|
| Login + rate limit + Argon2id | **IMPLEMENTADO** |
| JWT 15m + refresh HttpOnly + reuse detection | **IMPLEMENTADO** |
| CSRF Origin | **IMPLEMENTADO** |
| MFA TOTP + backup + anti-replay | **IMPLEMENTADO** |
| Superadmin MFA para `/admin` | **IMPLEMENTADO** |
| Impersonate + stop + audit + 2h cap | **IMPLEMENTADO** |
| SUPERADMIN login sem tenant automático | **CORRIGIDO** (§14) |

E-mail reset real: **PENDENTE** (**NÃO BLOQUEADOR** se processo manual).

---

## 6. Multi-tenant

| Controle | Status |
|----------|--------|
| `tenantId` da sessão | **IMPLEMENTADO** |
| Queries com filtro tenant | **IMPLEMENTADO** |
| Testes IDOR | **IMPLEMENTADO** (`tenant-isolation.test.ts`) |
| Impersonação força escopo | **IMPLEMENTADO** |

---

## 7. RBAC

Roles: `ADMIN` · `SUPERVISOR` · `AGENT` · `SALES` · `READONLY` + `SUPERADMIN`  
Enforcement: `requirePermission` / `requireSuperadmin` + testes.  
**IMPLEMENTADO**

---

## 8. WhatsApp

| Fluxo | Status |
|-------|--------|
| Connect / QR / status canônico | **IMPLEMENTADO** |
| Inbound webhooks + ingest | **IMPLEMENTADO** |
| Outbound + idempotência | **IMPLEMENTADO** |
| Restore Baileys on boot | **IMPLEMENTADO** |
| Homologação celular real | **PENDENTE** (não executada no ambiente) |

Riscos: webhooks sem HMAC (**P1**); portas 8080/5432/6379 no host (**BLOQUEADOR** em host público).

---

## 9. AI + Knowledge

| Feature | Status |
|---------|--------|
| Agentes CRUD + modos AUTO/SUGGEST | **IMPLEMENTADO** |
| Knowledge CRUD tenant | **IMPLEMENTADO** |
| Chunks simples (sem embeddings) | **IMPLEMENTADO** / vector **PENDENTE** |
| Importação em lote + revisão | **IMPLEMENTADO** (§14) |
| Guardrails off-topic | **IMPLEMENTADO** |

---

## 10. CRM / Automations / Admin

| Área | Status |
|------|--------|
| CRM funil + oportunidades | **IMPLEMENTADO** |
| Automations CRUD + run-test sandbox | **IMPLEMENTADO** · motor event-driven real **PENDENTE** |
| Admin global (overview, empresas, users, finance, plans, audit) | **IMPLEMENTADO** |
| Sidebar SUPERADMIN só platform | **CORRIGIDO** (§14) |

---

## 11. Tests

Suíte Vitest em `apps/api` (security + WhatsApp + knowledge-import).  
Frontend sem E2E Playwright no monorepo.  
CI formal: **PENDENTE**.

---

## 12. Docs existentes

`SECURITY-*`, `WHATSAPP-*`, `PLATFORM-ADMIN-*`, `PRODUCTION-SECURITY-CHECKLIST`, `KNOWLEDGE-BULK-IMPORT`, `DOCKER.md`, etc.  
README parcialmente desatualizado (credenciais / Postgres vs SQLite).

---

## 13. Bloqueadores P0 (pré-produção)

1. **Unificar Prisma provider** → `postgresql` em prod + **migrations** (sair de `db push --accept-data-loss`).  
2. Remover/rotacionar secrets commitados (ex.: `GROQ_API_KEY` em `.env*`).  
3. Compose prod: `JWT_SECRET`, `COOKIE_SECRET`, `ENCRYPTION_KEY` fortes; `CORS_ORIGIN` HTTPS.  
4. Seed de bootstrap vs fail-closed em production.  
5. Não expor `5432` / `6379` / `8080` publicamente; TLS no edge.  
6. Backup Postgres + volumes WA + uploads.  
7. Alinhar README/DOCKER com senhas e arquitetura reais.  
8. Registrar `npm test` + `security:check` em env de prod simulado.

### P1

- HMAC/API key em webhooks WA  
- Provider de e-mail real  
- Motor de automações se for feature de venda  
- WS sem token na query; Redis pub/sub multi-instance  
- CI com audit + vitest  

---

## 14. Atualizações pós-auditoria (2026-07-15)

| Mudança | Classificação |
|---------|---------------|
| SUPERADMIN login sem `memberships[0]` / tenant forçado | **CORRIGIDO** |
| Sidebar global: só nav Admin (sem “Empresa atual” operacional) | **CORRIGIDO** |
| Impersonação + “Voltar para Administração” | **PRESERVADO** + UX refinada |
| Refresh preserva flags de impersonação | **CORRIGIDO** |
| Importação knowledge em lote (TXT/MD + revisão) | **IMPLEMENTADO** |
| `docs/KNOWLEDGE-BULK-IMPORT.md` | **IMPLEMENTADO** |

---

## Matriz consolidada

| # | Área | Status | Bloqueia prod? |
|---|------|--------|----------------|
| 1 | Architecture | IMPLEMENTADO | Sim se SQLite/Postgres |
| 2 | Env / secrets | PENDENTE + fracos | **Sim** |
| 3 | External deps | IMPLEMENTADO | Não (IA opcional) |
| 4 | Volumes / backup | Volumes OK; backup PENDENTE | Backup **Sim** ops |
| 5 | Auth / MFA / Imp | IMPLEMENTADO / CORRIGIDO | Não (se secrets OK) |
| 6 | Multi-tenant | IMPLEMENTADO | Não |
| 7 | RBAC | IMPLEMENTADO | Não |
| 8 | WhatsApp | IMPLEMENTADO | Rede/webhook P1 |
| 9 | AI + Knowledge | IMPLEMENTADO | Não |
| 10 | CRM / Admin | IMPLEMENTADO | Não |
| 11 | Tests | IMPLEMENTADO (API) | Não se verdes |
| 12 | Docs | IMPLEMENTADO (drift parcial) | Não |

---

## Classificação final (honesta)

| Nível | Aplicável? |
|-------|------------|
| NOT_READY | Não (produto utilizável em dev/homolog) |
| **READY_FOR_INTERNAL_TESTING** | **Sim** |
| READY_FOR_EXTERNAL_HOMOLOGATION | Parcial — após P0 secrets + Postgres alinhado |
| READY_FOR_CONTROLLED_PRODUCTION_PILOT | Não — falta backup, migrations, secrets, WA real |
| READY_FOR_PRODUCTION | **Não** |

---

## Integridade factual

- Baseado em leitura de código/config e relatórios de testes unitários pontuais.  
- **Não** afirmado: E2E WhatsApp com celular real, restore de backup testado, ou deploy HTTPS em VPS.  
- Produção exige: teste real · persistência · restart · rede · segurança · backup · restore · monitoramento · documentação.
