# NIA — Certificação final (fechamento 2026-07-17)

## STATUS FINAL NIA

**`NIA_PRODUCTION_CANDIDATE`**

Não `NIA_PRODUCTION_READY`: E2E browser multi-tenant live (dois tenants reais com planos distintos + Playwright) não executado neste ambiente. Demais bloqueadores objetivos do leia de fechamento foram resolvidos e homologados em testes automatizados com schema real.

---

## PRESERVADO

- AI Core platform (sem BYOK tenant)
- Global Truth Policy + NIA security
- Tools allowlisted + CTAs allowlisted
- Help Knowledge published
- Feedback, mobile full, chat, composer, ícone único no header
- Isolamento userId + tenantId

## CORRIGIDO

| Bloqueador | Resolução |
|------------|-----------|
| Diagnóstico live | `buildDiagnosticFindings` homologado (WA off, agente off, knowledge draft, handoff, plan API, access gate, RBAC) |
| Sugestões só módulo | `suggestionsForContext` = módulo + entitlement + RBAC + Access Gate |
| Histórico multi-thread UI | `GET /assistant/threads`, `GET /assistant/threads/:id` + painel no drawer |
| 2ª mensagem “instável” | (ciclo anterior) sem hard-block + retry + prompt enxuto |

## REFINADO

- Welcome curto; sugestões honestas por plano/permissão
- Banner de instabilidade não bloqueia envio

## IMPLEMENTADO

- API list/open threads (paginação por cursor)
- UI Histórico (header)
- Filtro de sugestões backend
- Achados `plan_no_api`, `rbac_channels`, handoff explícito

## PENDENTE (não CRITICAL/HIGH de código)

| Item | Impacto |
|------|---------|
| Playwright E2E jornadas 1–7 com tenants reais | Homologação ops |
| Live LLM full (Groq) multi-turn em staging | Ops |

---

## DIAGNÓSTICO LIVE (suite `nia-diagnostic.homolog.test.ts`)

| Caso | Status |
|------|--------|
| WHATSAPP OFF | PASS |
| AGENTE OFF | PASS |
| KNOWLEDGE DRAFT | PASS |
| HANDOFF ACTIVE | PASS |
| PLAN WITHOUT API | PASS |
| RBAC DENIED | PASS |
| ACCESS GATE | PASS |

## SUGESTÕES

| Dimensão | Status |
|----------|--------|
| MODULE CONTEXT | PASS |
| RBAC | PASS |
| ENTITLEMENTS | PASS |
| ACCESS GATE | PASS |

## HISTÓRICO

| Item | Status |
|------|--------|
| THREAD LIST | IMPLEMENTED |
| OPEN THREAD | IMPLEMENTED |
| NEW THREAD | PRESERVED |
| PERSISTENCE | PRESERVED |
| TENANT ISOLATION | PASS (where userId+tenantId) |
| PAGINATION | cursor `nextCursor` |

## SEGURANÇA (unit)

Truth, injection, cross-tenant, secrets, tools — **PASS** (nia-security)

## TESTES

```
TOTAL: 46
PASS: 46
FAIL: 0
SKIPPED: 0
```

Suites: assistant, nia-security, nia-account-tools, help-knowledge, nia-diagnostic.homolog

## BUILD

API + Web production build via Docker (ciclo de deploy).

## BUGS ABERTOS

| Sev | Qtd |
|-----|-----|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | E2E browser multi-tenant live |
| LOW | — |

## VEREDITO

```
NIA_PRODUCTION_CANDIDATE
```

Critério leia PRODUCTION_READY exige E2E completo multi-tenant com evidência live — falta apenas essa camada de homologação operacional, não feature de produto.
