# Handoff Test Matrix

| # | Cenário | Esperado | Cobertura |
|---|---------|----------|-----------|
| 1 | Cliente pede humano | 1 handoff, IA pausa, fila | unit triggers + runtime |
| 2 | Dois Assumir simultâneos | 1 vence, outro 409 | código atomic; live pendente |
| 3 | 3 msgs pedindo humano | 1 notice (dedupe) | runtime dedupeMinutes |
| 4 | Humano assume + inbound | IA não AUTO | whatsapp skip assignedToId |
| 5 | Retomar IA | assigned null, timeline | API resume-ai |
| 6 | Transfer Fernando→Maria | Maria responsável, IA pausada | transferConversationToUser |
| 7 | Restart API | estado DB persiste | schema Conversation |
| 8 | Tenant B assume A | 404/403 | tenant filter |
| 9 | Dismiss banner | fila permanece | sessionStorage only |
| 10 | Inatividade em PENDING | não fecha | blockers waiting_human |

```bash
npx vitest run apps/api/src/services/human-handoff.test.ts apps/api/src/services/whatsapp/resume-guard.test.ts
```
