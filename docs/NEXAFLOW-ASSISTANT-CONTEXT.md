# Assistente NexaFlow — Contexto

## Hierarquia

1. NEXAFLOW SYSTEM POLICY (veracidade)
2. Help Knowledge publicada
3. Estado real da plataforma (estruturado)
4. Permissões do usuário
5. Entitlements do tenant
6. Contexto da tela atual
7. Pergunta do usuário

## Contexto de tela

Enviado pelo cliente como `path` (pathname).

Derivado no servidor:

- `currentRoute`
- `currentModule`
- `currentPageTitle`

Sugestões iniciais por módulo (`CONTEXT_SUGGESTIONS`).

## Estado operacional (exemplo)

```
whatsappStatus: CONNECTED | DISCONNECTED | NONE
agentCount / activeAgentCount
planName / planSlug
apiEnabled
features: { crm, inbox, ai, automations, campaigns, api, reports }
maxUsers / maxChannels / maxAgents / monthlyAiCredits
```

Sem objetos inteiros do banco nem conteúdo sensível de conversas.
