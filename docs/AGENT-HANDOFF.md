# Agent Handoff

## Status: HANDOFF_STAGING_READY (ver HANDOFF-FINAL-CERTIFICATION.md)

- Triggers: humano, reclamação, compra, custom, “IA não sabe”, tom da IA
- Motor único: `handoffToHumanQueue` + tool `request_human` / `transfer_conversation`
- **Assumir atômico** + transfer + **Retomar IA**
- Fila inbox FIFO; banner CTA honesto (Abrir conversa)
- Resume-on-return: acks **não** reabrem IA (`resume-guard`)
- Auto-close bloqueado em fila / humano ativo
- CSAT após close (configurável)

## Testes

`human-handoff.test.ts`, `resume-guard.test.ts`, `csat.test.ts`
