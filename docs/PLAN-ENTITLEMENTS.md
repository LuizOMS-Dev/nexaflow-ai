# Entitlements e limites

**Módulo:** `apps/api/src/services/entitlements.ts`

## API

| Função | Uso |
|--------|-----|
| `getTenantLimits` | Limites do plano + extras da assinatura |
| `assertCanAddUser` | Convidar / adicionar membro |
| `assertCanAddContact` | Criar / importar contatos |
| `assertCanAddChannel` | Criar canal / conectar WhatsApp |
| `assertCanAddAgent` | Criar agente IA |
| `assertCanActivateAutomation` | Ativar fluxo (status ACTIVE) |
| `assertFeatureEnabled` | Campanhas e flags |
| `assertAiCreditsAvailable` | Auto-resposta IA |
| `recordAiUsage` | Ledger `AiUsageLog` |
| `getUsageSnapshot` | UI Plano e uso |
| `ensureTenantSubscription` | Sincroniza contrato ao atribuir plano |

## Campos do plano

| Coluna | Significado |
|--------|-------------|
| `maxUsers` | Membros ativos |
| `maxChannels` | Conexões WhatsApp |
| `maxContacts` | Contatos |
| `maxConversations` | Conversas (soft) |
| `maxAiMessages` | Créditos IA/mês (compat) |
| `features.maxAgents` | Agentes |
| `features.maxActiveFlows` | Fluxos ACTIVE |
| `features.monthlyAiCredits` | Créditos IA/mês |
| `features.*Enabled` | Flags de produto |

## Validações no backend

Bloqueios com `AppError` 403 e códigos:

- `PLAN_LIMIT_USERS`
- `PLAN_LIMIT_CONTACTS`
- `PLAN_LIMIT_CHANNELS`
- `PLAN_LIMIT_AGENTS`
- `PLAN_LIMIT_ACTIVE_FLOWS`
- `PLAN_LIMIT_AI_CREDITS`
- `PLAN_FEATURE_DISABLED`
- `PLAN_DOWNGRADE_BLOCKED`

Frontend apenas reflete; **não** é fonte de verdade.

## Créditos de IA

- Unidade inicial: **1 crédito = 1 resposta auto WhatsApp** (rastreável em `AiUsageLog`).
- Contagem mensal UTC.
- Cap = `monthlyAiCredits + Subscription.extraAiCredits`.
- Esgotado: **não** bloqueia atendimento humano; só auto-IA.
