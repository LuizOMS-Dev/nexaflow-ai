# Agent Memory

## Status: PRESERVADO

`ContactMemory`:

- `confirmed` — dados afirmáveis
- `inferred` — insights da IA (não são fato da empresa)
- summary + content JSON

Truth policy: memória confirmada > inferida; cliente não reescreve política da empresa.

## Uso no runtime

- WhatsApp: summary curto no profile
- Chat: via analyze/persist
- Learning: CSAT e gaps separados

## Não é

- Memória de longo prazo multi-agente com embedding
- Cross-tenant memory
