# Agent Runtime

## Entrada

- Conversa + agente (`tenantId` obrigatório)
- Mode: `SUGGEST` | `APPROVE` | `AUTO` (+ `isActive=false` = desligado)

## Comportamento por modo

| Mode | Gera texto | Envia ao cliente | Tools |
|------|------------|------------------|-------|
| Desativado (`!isActive`) | Não | Não | Não auto |
| SUGGEST | Sim (copiloto) | Não | Suggest only |
| APPROVE | Sim → draft | Após humano | Com regras |
| AUTO | Sim | Sim (WA se mode AUTO) | Allowlist |

WhatsApp: `maybeAutoReplyAi` só se `agent.mode === "AUTO"`.

## Compilação de prompt

Funções em `ai.ts` + `agent-security.ts`:

- `buildAgentSecurityPolicy` / `Compact`
- `buildGlobalTruthPolicy`
- `buildPlatformContextGuardrails`
- `buildAgentIdentityBlock`
- `sanitizeAgentInstructions`

## Saídas

- Texto outbound (`sanitizeAgentOutbound`)
- JSON estruturado (analyze: score, status, actions)
- Tool calls estruturadas → `executeAgentToolCalls`
- Handoff flags (`needsHumanHandoff` só intencional)

## Degradação

- Rate limit: mensagem soft, **sem** fila Assumir
- Sem API: heurística / mensagem amigável
- Access gate: bloqueia AUTO/tools se tenant restrito
