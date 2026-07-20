# Volumes de produção

| Volume | Path container | Conteúdo | Perder = |
|--------|----------------|----------|----------|
| postgres_data | (imagem) | DB NexaFlow + Evolution schema | perda total de dados |
| redis_data | /data | cache RL | rate limit recomeça |
| uploads_data | `/app/uploads` | avatars, logos | mídia some |
| wa_sessions | `/app/data/wa-sessions` | Baileys auth | novo QR |
| evolution_data | `/evolution/instances` | sessões Evolution | novo QR |

## Env

```
STORAGE_LOCAL_PATH=/app/uploads
WA_SESSIONS_DIR=/app/data/wa-sessions
```

## Backup

Incluir **postgres** + **uploads** + **wa_sessions** + **evolution_data**.
