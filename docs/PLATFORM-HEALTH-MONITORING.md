# Saúde da plataforma

Endpoint autenticado: `GET /admin/platform-health` (Superadmin).

Também: `GET /health` (liveness) e `GET /health/ready` (readiness pública).

## Dependências

| Serviço | Tier |
|---------|------|
| API | CRITICAL |
| PostgreSQL | CRITICAL |
| Redis | CRITICAL se `REDIS_CRITICAL` / OPTIONAL caso contrário |
| WhatsApp Gateway | OPTIONAL |
| Provider IA | OPTIONAL |
| Mail | OPTIONAL |

Status: `operational` | `degraded` | `down` | `not_configured`.
