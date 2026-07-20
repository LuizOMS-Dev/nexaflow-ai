# Agent Tools

Ver também `AGENT-TOOLS-RUNTIME.md`.

## Status: PRESERVADO

- Allowlist de tools CRM leves + handoff
- Blocklist destrutiva
- Persistência `AgentToolExecution`
- Permissões por agente (lista; vazio = defaults seguros)
- AUTO vs APPROVE_ACTION

## Não é

- OpenAPI/MCP genérico externo
- Execução de código arbitrário
- Tools de pagamento/contratos

## Testes

Integração via agent-tools + handoff unit tests. Battery multi-provider com tools reais = PENDENTE live.
