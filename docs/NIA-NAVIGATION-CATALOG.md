# NIA Navigation Catalog

Fonte única de verdade para **localização na UI** nas respostas da NIA.

**Hierarquia**

1. `NEXAFLOW_NAVIGATION_CATALOG` + `FEATURE_NAV` (`nia-navigation-catalog.ts`)
2. Help Knowledge (conceito / procedimento) — **não** vence em path de menu

Implementação: `apps/api/src/services/nexaflow-assistant/nia-navigation-catalog.ts`

---

## Catálogo de rotas (tenant)

| FUNÇÃO (routeId) | NOME VISÍVEL | LOCALIZAÇÃO | ROTA REAL | MENU | RBAC | ENTITLEMENT | CTA LABEL |
|------------------|--------------|-------------|-----------|------|------|-------------|-----------|
| home | Início | Início | `/app` | sidebar | — | — | Abrir Início |
| conversations | Conversas | área de Conversas | `/app/inbox` | sidebar | conversations.read | inbox | Abrir Conversas |
| contacts | Contatos | área de Contatos | `/app/contacts` | sidebar | contacts.read | — | Abrir Contatos |
| funnel | Funil | área de Funil | `/app/crm` | sidebar | crm.read | crm | Abrir Funil |
| tasks | Tarefas | área de Tarefas | `/app/tasks` | sidebar | tasks.read | — | Abrir Tarefas |
| campaigns | Campanhas | área de Campanhas | `/app/campaigns` | sidebar | crm.read | campaigns | Abrir Campanhas |
| flows | Fluxos | área de Fluxos | `/app/automations` | sidebar | — | automations | Abrir Fluxos |
| agents | Agentes | área de Agentes | `/app/ai` | sidebar | ai.manage | ai | Abrir Agentes |
| learning | Aprendizado | Aprendizado (Agentes) | `/app/ai/learning` | sidebar | ai.manage | ai | Abrir Aprendizado |
| knowledge | Conhecimento | área de Conhecimento | `/app/knowledge` | sidebar | ai.manage | ai | Abrir Conhecimento |
| team | Equipe | área de Equipe | `/app/team` | sidebar | team.manage | — | Abrir Equipe |
| channels | Canais | área de Canais | `/app/integrations` | sidebar | channels.manage | — | Abrir Canais |
| reports | Relatórios | área de Relatórios | `/app/reports` | sidebar | reports.read | reports | Abrir Relatórios |
| settings | Configurações | Configurações da **empresa** | `/app/settings` | sidebar | settings.read | — | Abrir Configurações |
| api | API | Configurações → API | `/app/settings/api` | settings_sub | settings.read | api | Abrir API |
| webhooks | Webhooks | Configurações → Webhooks | `/app/settings/webhooks` | settings_sub | settings.read | api | Abrir Webhooks |
| account | Minha Conta | menu do perfil | `/app/account` | profile | — | — | Abrir Minha Conta |
| security | Segurança | Minha Conta → Segurança | `/app/account/security` | profile | — | — | Abrir Segurança |
| sessions | Sessões | Minha Conta → Sessões | `/app/account/sessions` | profile | — | — | Abrir Sessões |
| preferences | Preferências | Minha Conta → Preferências | `/app/account/preferences` | profile | — | — | Abrir Preferências |
| companies | Empresas | Minha Conta → Empresas | `/app/account/companies` | profile | — | — | Abrir Empresas |
| novelties | Novidades | menu do perfil | `/app/whats-new` | profile | — | — | Abrir Novidades |
| docs_api | Documentação da API | docs | `/docs/api` | docs | — | api | — |

### Abas reais do editor de Agente

Geral · Comportamento · Handoff · Ferramentas · Conhecimento

### Tour da plataforma

**Preferências → Ajuda e aprendizado → Tour da plataforma**  
(`PLATFORM_TOUR` → `preferences`)

---

## Feature map (intent → destino)

| Feature | routeId | Seção (se houver) |
|---------|---------|-------------------|
| AGENT_CREATE / EDIT / MODE | agents | Geral (modo) |
| AGENT_HANDOFF | agents | Handoff |
| AGENT_TOOLS | agents | Ferramentas |
| AGENT_KNOWLEDGE_LINK | agents | Conhecimento |
| KNOWLEDGE_CREATE | knowledge | — |
| CONTINUOUS_LEARNING | learning | — |
| WHATSAPP_CONNECT | channels | — |
| FUNNEL_MANAGE | funnel | — |
| AUTO_CLOSE | settings | Atendimento |
| PUBLIC_API | api | — |
| WEBHOOKS | webhooks | — |
| MFA_PASSWORD | security | — |
| ACTIVE_SESSIONS | sessions | — |
| PLATFORM_TOUR | preferences | Ajuda e aprendizado |
| NOVELTIES | novelties | — |
| META_HELP | — | sem CTA |

---

## Regras absolutas

- Usuário vê **nomes de UI**, nunca `/app/...`
- **Minha Conta** ≠ **Configurações da empresa**
- Agentes / Conhecimento / Canais **não** ficam em Configurações
- Help Knowledge antiga **não** sobrescreve o catálogo
- Sem permissão / entitlement: sem CTA enganoso
- Sem destino conhecido: não inventar path
- NIA tenant **nunca** orienta Superadmin / admin global / health / logs

---

## Fluxo

```
PERGUNTA
  → searchPlatformNavigation (índice derivado do catálogo/app)
  → RBAC / entitlements / Access Gate
  → (se operacional) account tools read-only da sessão
  → searchHelpKnowledge (conceito — não path)
  → NAV_TARGET (locationText + CTA)
  → prompt + alignContentWithNavigationTarget
  → resposta (texto + actions estruturadas)
```

### Tools (read-only)

| Tool | Papel |
|------|--------|
| `searchPlatformNavigation` | ONDE FICA |
| `buildSecureAccountDiagnostic` / probes | ESTADO da conta (tenant da sessão) |
| `searchHelpKnowledge` | COMO FUNCIONA |

Implementação pesquisa: `nia-platform-search.ts`  
Auditoria de rotas: `app-shell.tsx`, `account-shell.tsx`, `settings/page.tsx`, `ai/page.tsx` (tabs).
