# Auditoria — eventos e IP

## Separação

| Canal | Uso |
|-------|-----|
| **Auditoria** (`AuditLog`) | Ações de segurança e administração |
| **Logs** (Fastify/logger) | Diagnóstico técnico |

## UI

- Lista: título **humanizado** (`apps/web/src/lib/audit-labels.ts`).
- Detalhes: código técnico, ator, empresa, IP, data, metadados (secrets omitidos).

## Eventos (exemplos)

| Código | UI |
|--------|-----|
| `auth.login` | Login realizado |
| `auth.mfa.enabled` | Autenticação em duas etapas ativada |
| `company.blocked` | Empresa bloqueada |
| `company.payment_registered` | Pagamento registrado |
| `company.plan_changed` | Plano alterado |
| `plan.updated` | Plano do catálogo atualizado |

## IP e trust proxy

Fastify `trustProxy` via `TRUST_PROXY`:

| Ambiente | Recomendação |
|----------|----------------|
| Dev Docker | `true` (default não-prod) — IP pode ser `172.x` (rede Docker) |
| EasyPanel / prod | `loopback` ou lista de proxies confiáveis — **não** `true` aberto à internet |

`request.ip` já resolve `X-Forwarded-For` / `X-Real-IP` quando o proxy é confiável.

UI: IPs privados rotulados como **Rede interna / proxy (ip)** — não como “IP do usuário final” quando for só o hop Docker.
