# Changelog / Novidades da NexaFlow

## Conceito

Área **de produto** para usuários acompanharem o que mudou na plataforma.

**Não** é Audit Log. **Não** é log técnico.

| | Changelog | Audit Log | Log técnico |
|--|-----------|-----------|-------------|
| Público | Usuários (PUBLISHED) | Superadmin / tenant (conforme rota) | Superadmin |
| Conteúdo | Novidades, melhorias, correções | Quem fez o quê | Falhas, jobs, integrações |

## Modelos

- `PlatformRelease` — version, title, summary, status, visibility
- `PlatformReleaseItem` — NEW | IMPROVEMENT | FIX | SECURITY
- `UserReleaseSeen` — badge “Novo” por usuário

## Rotas

| Método | Rota | Quem |
|--------|------|------|
| GET | `/changelog` | Autenticado |
| GET | `/changelog/unseen-count` | Autenticado |
| POST | `/changelog/seen` | Autenticado |
| CRUD | `/admin/changelog/*` | Superadmin |

## UI

- Tenant: `/app/whats-new` + Preferências + menu do usuário
- Superadmin: `/admin/system/releases`

## Segurança do conteúdo

Nunca publicar secrets, CVEs exploráveis detalhadas, IPs internos ou estrutura de banco no changelog público.
