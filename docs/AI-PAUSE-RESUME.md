# AI Pause / Resume

## Pausa (automática)
- Humano assume (`assignedToId`)
- Handoff fila (`PENDING` + flags)
- Access Gate / créditos (degradação)

`maybeAutoReplyAi` **não** envia se humano ou fila ativa (salvo resume config).

## Resume
1. **Explícito:** botão “Retomar IA” → `POST /conversations/:id/resume-ai`
2. **Config empresa:** cliente volta com mensagem significativa + `resumeOnCustomerReturn` + sem assigned
3. **Nunca** só por tempo após humano assumir

Acks (`ok`, `obrigado`) → `resume-guard` → **não** reassumem.
