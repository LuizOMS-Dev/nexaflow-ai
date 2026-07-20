# Disaster Recovery — NexaFlow (mínimo operacional)

**Classificação:** DOCUMENTADO — drills reais **PENDENTE** para PRODUCTION_READY

---

## Cenários

| Cenário | Impacto | Resposta |
|---------|---------|----------|
| **Postgres down** | API not_ready | Restaurar último backup SQL; validar migrations; subir API |
| **Redis down** | Rate-limit/session degradados | Em prod Redis CRITICAL → not_ready; em staging OPTIONAL → degrada |
| **Volume uploads lost** | Avatars/logos | Restaurar volume; re-upload se necessário |
| **WA session volume lost** | Canais desconectados | Re-pair QR; restaurar volume Evolution se disponível |
| **Bad deploy** | Quebra app | Rollback imagem Docker; `migrate` só forward — não reset DB |
| **AI provider outage** | NIA/agents soft-fail | Fallback provider tenant; degradação WA sem inventar sucesso |
| **WhatsApp gateway outage** | Mensagens param | Status canal ERROR; fila humana se configurada |

---

## RPO / RTO (alvo staging)

| | Alvo |
|--|------|
| RPO (perda de dados) | ≤ 24h (backup diário) até automação |
| RTO (retorno serviço) | ≤ 4h single-node EasyPanel |

Produção deve documentar RPO/RTO contratual após backup automático + drill.

---

## Restore checklist

1. Provisionar Postgres vazio  
2. Restaurar dump (`pg_restore` / SQL)  
3. Confirmar `DATABASE_URL`  
4. Subir API com `migrate deploy`  
5. Validar `/health/ready`  
6. Smoke: login, tenant, um agente, um canal WA status  
7. Registrar data/hora do drill  

Ver também: `BACKUP-AND-RESTORE.md`

---

## O que **não** fazer

- `prisma migrate reset` em produção  
- Restaurar backup de staging em prod sem isolamento  
- Assumir que Redis vazio “só limpa cache” se sessões dependem dele  
