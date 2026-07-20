# Assistente NexaFlow — Arquitetura

## Conceito

O **Assistente NexaFlow** é a IA nativa de **ajuda e navegação da plataforma**.  
Ele atende o **usuário da NexaFlow**, não o cliente final da empresa.

| | Agentes de IA (tenant) | Assistente NexaFlow |
|--|------------------------|---------------------|
| Público | Clientes da empresa | Usuários do painel |
| Knowledge | `KnowledgeDoc` do tenant | `HelpKnowledgeDoc` (plataforma) |
| Tools | CRM, handoff, tarefas… | Leitura + navegação allowlisted |
| Créditos | Créditos de atendimento | `purpose: platform_help` (crédito 0) |
| UI | `/app/ai`, Inbox | Drawer no shell do tenant |

## Fluxo

```
Usuário → abre drawer → pergunta
  → Auth (tenant da sessão)
  → Help Knowledge (published)
  → Estado operacional (WhatsApp, plano, entitlements)
  → RBAC / permissões
  → Contexto de tela (path)
  → GLOBAL TRUTH POLICY
  → Resposta + action chips (navigate | tour | docs | support)
```

## Componentes

- **API:** `apps/api/src/routes/nexaflow-assistant.ts`
- **Service:** `apps/api/src/services/nexaflow-assistant/`
- **Web:** `apps/web/src/components/nexaflow-assistant/nexaflow-assistant-drawer.tsx`
- **Models:** `HelpKnowledgeDoc`, `HelpAssistantThread`, `HelpAssistantMessage`, `HelpKnowledgeGap`

## Regras

1. `tenantId` sempre da sessão — nunca da pergunta.
2. Sem tools destrutivas no MVP.
3. Admin global (`/admin`) não monta o assistente do tenant.
4. Impersonation: funciona, com flag `impersonation: true`; sem gravar preferências do cliente indevidamente.
