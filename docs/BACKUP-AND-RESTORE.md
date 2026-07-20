# Backup e restore

## Estratégia mínima (obrigatória antes de PRODUCTION_READY)

### 1. PostgreSQL

```bash
# Backup
docker compose exec -T postgres pg_dump -U nexaflow nexaflow > backup-$(date +%Y%m%d).sql

# Restore
cat backup-YYYYMMDD.sql | docker compose exec -T postgres psql -U nexaflow -d nexaflow
```

Agendar: diário, retenção ≥ 7 dias, off-site se possível.

### 2. Volumes de arquivo

```bash
# Exemplo (Docker volumes)
docker run --rm -v nexaflowaiprojeto_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads.tgz -C /data .
docker run --rm -v nexaflowaiprojeto_wa_sessions:/data -v $(pwd):/backup alpine \
  tar czf /backup/wa-sessions.tgz -C /data .
```

### 3. Evolution

Backup do volume `evolution_data` junto com dump do schema evolution no Postgres.

## Restore (teste obrigatório)

1. Ambiente limpo
2. Restore Postgres
3. Restore volumes
4. `docker compose up`
5. Login Superadmin
6. Confirmar tenant/dados
7. WhatsApp: sessão restaura **ou** documentar novo QR

## Status atual

| Item | Status |
|------|--------|
| Script documentado | IMPLEMENTADO (este doc) |
| Automação em CI/prod | PENDENTE (ops) |
| Restore testado em drill | **PASS local 2026-07-17** (ver `PRODUCTION-OPS-CLOSEOUT.md`) |

**Não** marcar PRODUCTION_READY sem backup **automático** em produção + drill em ambiente prod-like.
