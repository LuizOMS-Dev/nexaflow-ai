# AI ↔ Human Handoff

Motor central: `apps/api/src/services/human-handoff.ts`.

- **request_human / regras / tom da IA** → `handoffToHumanQueue`
- **Pausa IA:** `assignedToId` set **ou** fila `PENDING` + flags `waitingHuman`/`requiresAssume`
- **Assumir:** `assumeConversationAtomic` (race-safe)
- **Retomar IA:** `resumeAiAttendance` + `POST .../resume-ai`
- **Transferir:** `transferConversationToUser`
- **Resume automático** (config): só se `resumeOnCustomerReturn` e mensagem **não** trivial (`resume-guard`)

Ver certificação: [HANDOFF-FINAL-CERTIFICATION.md](./HANDOFF-FINAL-CERTIFICATION.md)
