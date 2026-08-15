# Scripts da raiz

Não confundir com `apps/api/src/scripts/` (one-offs da API).

| Script | Uso |
|--------|-----|
| `setup.js` | Bootstrap local (`npm run setup`) |
| `docker/up.ps1` | Sobe a stack no Docker Desktop (`npm run docker:up`) |
| `docker/fix-wsl.ps1` | Ajuste Docker/WSL (Administrador) |
| `db/sync-official-plans.mjs` | Sincroniza o catálogo oficial de planos |
| `db/reset-platform-tour.sql` | Reset do tour da plataforma |
| `ops/easypanel-mcp.mjs` | Operações EasyPanel |
| `qa/check-ui-exports.mjs` | Checagem de exports da UI |
| `qa/responsive-qa.mjs` | QA responsivo (artefatos em `tmp/` / `docs/qa-screenshots`) |

Artefatos locais vão em `tmp/` (fora do git).
