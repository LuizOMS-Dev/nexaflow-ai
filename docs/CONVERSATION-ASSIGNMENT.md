# Conversation Assignment

| Ação | API | Motor |
|------|-----|-------|
| Assumir (self) | `POST /conversations/:id/assign` `{}` | `assumeConversationAtomic` |
| Transferir | `POST .../assign` `{ userId }` | `transferConversationToUser` |
| Devolver fila | `POST .../assign` `{ userId: null }` | status PENDING |
| Retomar IA | `POST .../resume-ai` | `resumeAiAttendance` |

Valida membership do destino no tenant.  
409 se já assumido por outro.  
Timeline: `human_takeover` / `human_transfer` / `ai_resumed_by_human`.
