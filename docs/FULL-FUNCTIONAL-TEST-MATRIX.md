# Matriz de testes funcionais — NexaFlow

**Data:** 2026-07-17  
**Ambiente:** Docker local + API `http://localhost:4000` + Web `http://localhost:3000`  
**Métodos de evidência usados:** API HTTP real (login/impersonate/CRUD), `/health`, páginas HTTP 200, Vitest unitário, logs Docker, SQL Postgres.

### Legenda de status
| Status | Significado |
|--------|-------------|
| **PASS** | Exercitado com evidência concreta |
| **FAIL** | Exercitado e falhou |
| **BLOCKED** | Impedido por ambiente/sessão/config |
| **NOT_TESTED** | Não exercitado nesta rodada |
| **NOT_APPLICABLE** | Não existe / N/A |

### Classificação
CRITICAL / HIGH / MEDIUM / LOW

---

## AUTH / SESSÃO

| ID | Módulo | Ação | Esperado | Obtido | FE | BE | DB | Status | Evidência |
|----|--------|------|----------|--------|----|----|----|--------|-----------|
| AUTH-01 | Auth | Login superadmin válido | 200 + token | 200 accessToken | — | ✓ | ✓ | **PASS** | POST `/auth/login` |
| AUTH-02 | Auth | Senha incorreta | 401 | 401 AUTH_INVALID_CREDENTIALS | — | ✓ | — | **PASS** | negativo intencional |
| AUTH-03 | Auth | Usuário inexistente | 401 | 401 | — | ✓ | — | **PASS** | |
| AUTH-04 | Auth | `/auth/me` autenticado | 200 user | 200 | — | ✓ | — | **PASS** | (pré-impersonate) |
| AUTH-05 | Auth | `/auth/sessions` | lista sessões | 200 | — | ✓ | — | **PASS** | |
| AUTH-06 | Auth | MFA status | enabled false | 200 enabled:false | — | ✓ | — | **PASS** | |
| AUTH-07 | Auth | Access state SA | FULL | 200 FULL_ACCESS | — | ✓ | — | **PASS** | |
| AUTH-08 | Auth | Impersonate sem reason | 400 | 400 reason Required | — | ✓ | — | **PASS** | validação OK |
| AUTH-09 | Auth | Impersonate com reason | token tenant | 200 accessToken | — | ✓ | ✓ | **PASS** | |
| AUTH-10 | Auth | Sessão SA após impersonate | revogada | SESSION_REVOKED | — | ✓ | ✓ | **PASS*** | *comportamento de segurança; SA precisa re-login |
| AUTH-11 | Auth | Logout / logout-all / refresh / forgot / reset / change password | fluxos completos | — | — | — | — | **NOT_TESTED** | |
| AUTH-12 | MFA | setup/enable/login/recovery | completo | — | — | — | — | **NOT_TESTED** | |

---

## SUPERADMIN

| ID | Módulo | Ação | Status | Evidência |
|----|--------|------|--------|-----------|
| ADM-01 | Overview | GET `/admin/overview` | **PASS** | stats tenants/users |
| ADM-02 | Tenants | GET `/admin/tenants` | **PASS** | Fm Conteúdos ACTIVE |
| ADM-03 | Users | GET `/admin/users` | **PASS** | 2 users |
| ADM-04 | Plans | GET `/admin/plans` | **PASS** | planos catálogo |
| ADM-05 | Logs | GET `/admin/logs` | **PASS** | items |
| ADM-06 | Settings | GET `/admin/settings` | **PASS** | branding |
| ADM-07 | Access policy | GET `/admin/access-policy` | **PASS** | graceDays:7 |
| ADM-08 | Impersonate | POST + reason | **PASS** | |
| ADM-09 | Tenant edit/suspend/block/pay | mutações | **NOT_TESTED** | evitar side-effects em prod-like data |
| ADM-10 | UI `/admin` pages HTTP | 200 | **PASS** | web status 200 (shell) |
| ADM-11 | Diagnostics health routes | paths testados | **NOT_TESTED** / 404 em paths chutados | confirmar paths reais em `platform-diagnostics` |

---

## TENANT — LEITURAS

| ID | Endpoint | Status | Notas |
|----|----------|--------|-------|
| T-01 | GET `/auth/me` (impersonate) | **PASS** | Fernando Medeiros |
| T-02 | GET `/auth/access-state` | **PASS** | company ACTIVE FULL |
| T-03 | GET `/dashboard` | **PASS** | kpis reais |
| T-04 | GET `/contacts` | **PASS** | |
| T-05 | GET `/conversations` | **PASS** | total 0 nesta hora |
| T-06 | GET `/pipelines` | **PASS** | Funil Comercial |
| T-07 | GET `/pipelines/:id/board` | **PASS** | 5 stages |
| T-08 | GET `/opportunities` | **PASS** | |
| T-09 | GET `/tasks` | **PASS** | |
| T-10 | GET `/ai-agents` | **PASS** | Julia AUTO |
| T-11 | GET `/knowledge` | **PASS** | 65 docs |
| T-12 | GET `/automations` | **PASS** | [] |
| T-13 | GET `/campaigns` | **PASS** | [] |
| T-14 | GET `/team` | **PASS** | ADMIN |
| T-15 | GET `/channels` | **PASS** | WEBCHAT + WA |
| T-16 | GET `/settings` | **PASS** | |
| T-17 | GET `/usage` | **PASS** | plano Empresa |
| T-18 | GET `/tags` | **PASS** | |
| T-19 | GET `/quick-replies` | **PASS** | |
| T-20 | GET `/audit-logs` | **PASS** | |
| T-21 | GET `/settings/ai-provider` | **PASS** | multi-provider catalog |
| T-22 | GET `/api-keys` | **PASS** | apiEnabled true |
| T-23 | GET `/webhooks` | **PASS** | [] |
| T-24 | GET `/assistant/bootstrap` | **PASS** | NIA online keys OK |

---

## TENANT — CRUD / AÇÕES

| ID | Ação | Esperado | Obtido | Status | Classif. |
|----|------|----------|--------|--------|----------|
| C-01 | POST contact | cria | 200 + id | **PASS** | |
| C-02 | GET contact | lê | 200 | **PASS** | |
| C-03 | PATCH contact name/status | persiste | 200 nome editado | **PASS** | |
| C-04 | DELETE contact | remove | 200 ok | **PASS** | |
| C-05 | POST task | cria | 200 | **PASS** | |
| C-06 | DELETE task | remove | 200 | **PASS** | |
| C-07 | POST knowledge status READY | validação | 400 enum | **PASS*** | *API exige `ready` minúsculo — comportamento correto; UI deve enviar lowercase |
| C-08 | POST knowledge status `ready` | cria | 200 | **PASS** | |
| C-09 | DELETE knowledge | remove | 200 | **PASS** | |
| C-10 | PATCH settings | salva | 200 | **PASS** | campos aceitos |
| C-11 | POST ai-provider test | ok Groq | 200 ok:true ~341ms | **PASS** | |
| C-12 | POST agent test jailbreak | recusa natural | 200 sem leak de prompt | **PASS** | agent-security |
| C-13 | POST agent test normal | resposta | 200 | **PASS** | |
| C-14 | Opportunity create/move DnD | — | — | **NOT_TESTED** | UI DnD |
| C-15 | Campaign lifecycle | — | — | **NOT_TESTED** | |
| C-16 | Automation run | — | — | **NOT_TESTED** | |
| C-17 | Team invite | — | — | **NOT_TESTED** | |

---

## WHATSAPP

| ID | Ação | Status | Evidência |
|----|------|--------|-----------|
| WA-01 | GET status | **PASS** | CONNECTED, connectedCount:1 |
| WA-02 | GET channels | **PASS** | channel Evolution |
| WA-03 | GET gateway | **PASS** | ready evolution platform |
| WA-04 | Inbound/outbound E2E com mensagem real | **NOT_TESTED** nesta rodada | depende telefone; histórico recente de instabilidade TPM corrigido em deploy anterior |
| WA-05 | QR / disconnect / reconnect | **NOT_TESTED** | risco operacional |

---

## AGENTES / IA / SECURITY

| ID | Ação | Status | Evidência |
|----|------|--------|-----------|
| AI-01 | List agents | **PASS** | Julia |
| AI-02 | Sandbox jailbreak | **PASS** | recusa sem system prompt |
| AI-03 | Sandbox normal | **PASS** | |
| AI-04 | Truth policy unit | **PASS** | vitest 6 tests |
| AI-05 | Agent security unit | **PASS** | vitest 14 tests |
| AI-06 | chatWithAgent companyName genérico | **FAIL→FIX** | usava literal "a empresa"; corrigido no source para nome do tenant |
| AI-07 | Knowledge draft never in context | **NOT_TESTED** | unitário parcial em knowledge-retrieval |
| AI-08 | Modes SUGGEST/APPROVE/AUTO UI | **NOT_TESTED** | |
| AI-09 | Import config agent | **NOT_TESTED** | unit import exists |
| AI-10 | Multi-provider all vendors | **NOT_TESTED** | só Groq com key real |
| AI-11 | BYOK encrypt/mask | **NOT_TESTED** | docs AI-BYOK |

---

## NIA

| ID | Ação | Status |
|----|------|--------|
| NIA-01 | GET `/assistant/bootstrap` | **PASS** |
| NIA-02 | POST `/assistant/chat` | **NOT_TESTED** (rate/TPM) |
| NIA-03 | Security unit nia-security | **NOT_TESTED** nesta rodada isolada (suite DB) |
| NIA-04 | Help knowledge admin | **NOT_TESTED** |

---

## MULTI-TENANT / RBAC

| ID | Ação | Status | Notas |
|----|------|--------|-------|
| MT-01 | Superadmin sem tenant em `/contacts` | **PASS** | 401/negado |
| MT-02 | Contact fake id | **PASS** | 404 |
| MT-03 | Tenant A vs B IDOR completo | **NOT_TESTED** | só 1 tenant no DB; e2e precisa `DATABASE_URL` no host |
| MT-04 | RBAC AGENT vs ADMIN UI+API | **NOT_TESTED** | 1 membership ADMIN |
| MT-05 | E2E vitest multitenant | **BLOCKED** | Prisma `DATABASE_URL` inválida no host Windows (só no Docker) |

---

## WEB / INFRA

| ID | Ação | Status |
|----|------|--------|
| WEB-01 | GET `/` 200 | **PASS** |
| WEB-02 | GET `/login` 200 | **PASS** |
| WEB-03 | GET `/app` 200 | **PASS** |
| WEB-04 | GET `/admin` 200 | **PASS** |
| WEB-05 | Click-all UI (Fase 3) | **NOT_TESTED** | sem browser automation completo nesta rodada |
| DOC-01 | Docker stack healthy | **PASS** | api/web/pg/redis/evolution |
| DOC-02 | API `/health` | **PASS** | ok development |
| DOC-03 | Vitest unit (src, sem e2e DB) | **PASS** parcial | 187 passed / 35 skipped; e2e DB BLOCKED no host |
| DOC-04 | Production build web+api | **NOT_TESTED** nesta rodada | builds Docker recentes ok |

---

## MÓDULOS NÃO EXERCITADOS A FUNDO (NOT_TESTED)

Onboarding UI, Tour UI, Handoff E2E WhatsApp, Finalização conversa, Memória confirmed/inferred, Aprendizado contínuo UI, Campanhas, Automações, Relatórios CSV, Webhooks delivery/HMAC/SSRF ao vivo, Cobrança mutações, Access Gate combinações bloqueio, Responsividade, A11y teclado, Performance profiling, Back button, Migrations clean DB.

---

## Contagem resumida (esta rodada)

| Status | Qtd aproximada (itens de matriz) |
|--------|-----------------------------------|
| PASS | ~55 |
| FAIL (produto) | 1 (corrigido: companyName chatWithAgent) |
| FAIL (falso positivo script) | paths chutados 404, 401 negativos mal classificados no 1º script |
| BLOCKED | e2e DB host |
| NOT_TESTED | maioria da Fase 3 UI click-all + fluxos longos |

*Matriz viva — expandir IDs por botão/modal conforme Fase 3 avançar.*
