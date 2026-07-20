# Segurança Agentes 2.0

## Status: PRESERVADO (plataforma, não configurável)

Camada `agent-security.ts` — **sempre on**, acima de instruções/knowledge/cliente.

- Multi-tenant em toda query
- Pré-filtro determinístico: injection, jailbreak, secret extract, privilege, tool abuse
- Tools: allow-list + block-list server-side
- Args validados
- Outbound sanitize (redact secrets / policy echo)
- Config text strip de linhas que enfraquecem blindagem
- Sem chain-of-thought no storage
- APPROVE não envia WA sem humano
- Compact policy no WhatsApp (TPM) mantém obrigatoriedade

## Testes

`agent-security.test.ts` — PASS (2026-07-17)
