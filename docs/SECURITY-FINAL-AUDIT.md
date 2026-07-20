# NexaFlow AI — Auditoria Final de Segurança

**Data:** 2026-07-15  
**Escopo:** hardening / fechamento de brechas (sem reconstruir auth)  
**Status geral:** controles críticos **IMPLEMENTED + TESTED**; residual P1 documentado

---

## Arquitetura de tokens (escolha consciente)

**Opção A (oficial):**

| Token | Onde fica | Quem lê | Como envia | Vida | Revogação |
|-------|-----------|---------|------------|------|-----------|
| **Access JWT** | Memória JS + cookie `nexa_access` HttpOnly (bootstrap) | Client JS só o valor em memória; cookie não é legível por JS | Preferência: `Authorization: Bearer` | ~15 min | `sid`/`jti` → `AuthSession` revogada |
| **Refresh** | Cookie `nexa_refresh` **somente** HttpOnly | Nunca JS | Automático no browser (`credentials: include`) | 30 dias | Rotação + family revoke |

**CSRF:** mutações com Origin/Referer na allowlist de `CORS_ORIGIN` (não confiar só em CORS).

---

## Matriz de controles

| Controle | Implementação | Arquivos | Endpoints | Risco residual | Sev | P | Teste | Status |
|----------|---------------|----------|-----------|----------------|-----|---|-------|--------|
| Argon2id | password hash + rehash | `password.ts`, `auth.ts` | login, reset, invite | — | INFO | — | seed/login | **TESTED** |
| Access JWT curto | 15m + iss/aud/jti | `auth.ts`, `plugins/auth.ts` | * | dual cookie+bearer | MED | P2 | negative tests | **TESTED** |
| Refresh rotativo | hash + family | `session.ts` | login/refresh/logout | — | INFO | — | login flow | **IMPLEMENTED** |
| Cookie HttpOnly/Secure | setCookie prod Secure | `auth.ts`, `admin.ts` | auth | Domain amplo | LOW | P2 | manual | **IMPLEMENTED** |
| CSRF Origin | onRequest mutações | `csrf.ts` | POST/PATCH/DELETE | APIs sem Origin+Bearer em prod | MED | P1 | csrf.test | **TESTED** |
| Session bind | sid obrigatório | `plugins/auth.ts` | * | — | INFO | — | negative | **TESTED** |
| User/tenant suspend | check em authenticate | `plugins/auth.ts` | * | — | INFO | — | parcial | **IMPLEMENTED** |
| MFA TOTP | setup/enable/verify | `mfa.ts`, `auth.ts` | /auth/mfa/* | e-mail reset real | MED | P1 | mfa.test | **TESTED** |
| TOTP encrypted | AES-256-GCM | `crypto.ts` | MFA | key rotation ops | LOW | P2 | crypto.test | **TESTED** |
| TOTP replay | lastTotpStep | `mfa.ts` | verify | clock skew | LOW | P2 | mfa.test | **TESTED** |
| Challenge limits | attempts max 5 | `mfa.ts` | verify | — | INFO | — | code | **IMPLEMENTED** |
| Superadmin MFA | requireSuperadminMfa | `step-up.ts` | /admin/* | seed superadmin sem MFA | HIGH | P1* | code path | **IMPLEMENTED** |
| Step-up | lastStrongAuthAt | `step-up.ts`, `/auth/step-up` | impersonate, sensitive | UI step-up | MED | P1 | code | **IMPLEMENTED** |
| Impersonation | reason+2h cap+audit | `admin.ts`, session | /admin/impersonate | UI reason fixo | MED | P1 | manual | **IMPLEMENTED** |
| Tenant isolation | session tenantId | routes | multi-tenant | coverage parcial | MED | P1 | isolation+negative | **TESTED** |
| requirePermission | RBAC | routes | business | — | INFO | — | permissions.test | **TESTED** |
| Rate limit | global + Redis | `app.ts`, redis | * | Redis optional dev | MED | P1 prod | — | **IMPLEMENTED** |
| Logo MIME | magic bytes, no GIF | `logo-upload.ts` | settings/onboarding | no reprocess lib | LOW | P2 | logo.test | **TESTED** |
| Production fail-closed | assertProductionSafe | `production-guard.ts` | startup | — | INFO | P0 | security:check | **IMPLEMENTED** |
| Helmet/CSP | prod CSP+HSTS | `app.ts` | * | CSP vs Next | MED | P1 | manual | **IMPLEMENTED** |
| trustProxy | env loopback prod | `env.ts` | * | infra-specific | MED | P1 | — | **IMPLEMENTED** |
| WS auth | JWT+session+tenant | `app.ts` /ws | WS | suite WS limitada | MED | P1 | parcial | **IMPLEMENTED** |
| Deps JWT | @fastify/jwt 10 / fast-jwt 6 | package.json | auth | @fastify/static mod | MED | P1 | audit | **TESTED** |
| Audit log immutability | no tenant update/delete API | routes | audit | admin platform | LOW | P2 | — | **PARTIAL** |
| Password reset e-mail | token only; log em non-prod | `auth.ts` | forgot/reset | prod e-mail provider | HIGH | P1 | — | **PARTIAL** |
| User invites | password on invite still | team invite | invite | default pwd | HIGH | P1 | — | **OPEN** |
| Page size cap | contacts max 100 | contacts.ts | GET list | other routes | MED | P1 | negative | **TESTED** contacts |

\* Superadmin MFA: **bloqueia /admin** sem MFA. Contas seed precisam configurar MFA antes de admin.

---

## P0 corrigidos nesta fase

1. Production fail-closed (secrets, CORS, encryption, rate limit policy)  
2. JWT iss/aud + jti/sid + sessão revogada + user/tenant suspenso  
3. CSRF Origin guard em mutações  
4. TOTP secret cifrado em repouso  
5. Anti-replay TOTP + challenge attempts  
6. Superadmin MFA obrigatório + step-up em impersonação  
7. Impersonação com motivo + expiração 2h + auditoria actor real/efetivo  
8. Upgrade `@fastify/jwt` → 10.x / `fast-jwt` 6 (critical auth CVE)  
9. Cap de paginação em contacts  
10. WS valida sessão e tenant da sessão  

## P1 residual (atualizado após fechamento)

| ID | Item | Status | Notas |
|----|------|--------|-------|
| R1 | E-mail reset | **FECHADO (camada)** | `sendMail` + link; MAIL_PROVIDER=log/none; sem log de token em prod |
| R2 | Convites | **FECHADO** | `UserInvite` + `/auth/accept-invite`; sem senha default |
| R3 | Cap paginação | **FECHADO** | contacts/tasks/crm/conversations max 100 |
| R4 | Superadmin MFA bootstrap | **FECHADO** | banner settings + empty state admin + redirect login |
| R5 | @fastify/static moderate | ABERTO (P2) | não usado para auth |
| R6 | Testes WS cross-tenant | PARCIAL | handshake validado; suite WS dedicada opcional |

## Novos endpoints desta finalização

| Método | Rota | Função |
|--------|------|--------|
| POST | `/team/invite` | Cria convite token (sem password) |
| POST | `/auth/accept-invite` | Define senha + entra |
| POST | `/auth/forgot-password` | Envia e-mail via `sendMail` |
| POST | `/auth/reset-password` | + notificação de alteração |
| GET | `/auth/me` | + `security` flags |

## P2

- Prefixo `__Host-` cookies  
- Reprocessamento de imagem (sharp)  
- Tamper-evident audit store  
- Key rotation operacional documentado (ver abaixo)

---

## Rotação de chaves (processo)

1. Gerar novos `JWT_SECRET`, `COOKIE_SECRET`, `ENCRYPTION_KEY` (32+ bytes aleatórios)  
2. Deploy com `ENCRYPTION_KEY` novo **e** período de dual-key (v1/v2) se secrets TOTP existirem  
3. TOTP: formato `enc:vN:` permite multi-versão em `crypto.ts`  
4. JWT: troca secret invalida access; refresh re-emite  
5. Revogar sessões ativas se comprometimento  
6. Remover secret antigo do vault após 1 ciclo  

---

## Comandos

```bash
npm test
npm run security:check
npm audit --audit-level=high
```

---

## Definição de pronto

| Critério | Estado |
|----------|--------|
| Sem P0 aberto | **SIM** (código) |
| P1 listados | **SIM** |
| Testes auth/MFA/IDOR/CSRF | **SIM** (35+) |
| Declaração PRODUCTION READY | **Condicional** — exige secrets reais, Redis, MFA superadmin, e-mail reset, checklist infra |
