# Agent Tools Runtime

## Fluxo

1. IA devolve `actions: [{ tool, args }]` (JSON estruturado)
2. `executeAgentTool` / `executeAgentToolCalls`
3. Valida tenant, agente, allow-list, block-list
4. Persiste `AgentToolExecution`
5. Executa via Prisma (CRM, tasks, notes, handoff)

## Tools seguras

get_contact, update_contact, update_commercial_status, update_priority, set_next_action, update_score, create_opportunity, update_opportunity, move_opportunity, create_task, create_note, transfer_conversation, request_human

## Bloqueadas

delete_*, manage_users, cancel_subscription, register_payment, change_contract, grant_discount

## API

- `GET /ai-agents/tools/catalog`
- `POST /ai-agents/:id/tools/execute`
