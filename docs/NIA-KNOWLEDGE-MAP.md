# NIA — Mapa de Conhecimento

Mapa da Help Knowledge da plataforma (não é KnowledgeDoc do tenant).  
Seed: `apps/api/src/services/nexaflow-assistant/help-knowledge-seed.ts`  
Upsert por `seedKey`. Só `published` entra no contexto da NIA.

Versão de conteúdo do seed: **1.9.0** (alinhar ao changelog ao mudar módulos).

## Princípios

| Fonte | Uso |
|--------|-----|
| Help Knowledge publicada | Explicações de produto |
| Estado operacional (sessão) | WhatsApp, agentes, plano, features |
| Access Gate | Bloqueios / suspensões / cobrança |
| RBAC + ALLOWED_NAV | O que o usuário pode abrir |
| Contexto de rota | “O que faço aqui?” |
| Changelog publicado | “O que mudou?” |

A NIA **não** deve depender de system prompt gigante com o manual inteiro.

---

## Módulos → artigos (seedKey)

### Início
| seedKey | Título | Rota principal |
|---------|--------|----------------|
| `inicio-guia` | Guia de início | `/app` |
| `inicio-vocabulario` | Vocabulário NexaFlow | — |

### Conversas
| seedKey | Título | Rota |
|---------|--------|------|
| `conversas-inbox` | Conversas (Inbox) | `/app/inbox` |
| `conversas-handoff` | Handoff e assumir atendimento | `/app/inbox` |
| `conversas-faq` | FAQ — Conversas | `/app/inbox` |

### Contatos / Funil / Tarefas
| seedKey | Título | Rota |
|---------|--------|------|
| `contatos` | Contatos | `/app/contacts` |
| `funil-crm` | Funil (CRM) | `/app/crm` |
| `tarefas` | Tarefas | `/app/tasks` |

### Agentes & Aprendizado
| seedKey | Título | Rota |
|---------|--------|------|
| `agentes-geral` | Agentes de IA | `/app/ai` |
| `agentes-modos` | Modos do agente | `/app/ai` |
| `agentes-nao-responde` | Diagnóstico — agente não responde | `/app/ai` |
| `agentes-import-config` | Importar configuração do agente | `/app/ai` |
| `agentes-faq` | FAQ — Agentes | `/app/ai` |
| `aprendizado` | Aprendizado contínuo | `/app/ai/learning` |

### Conhecimento
| seedKey | Título | Rota |
|---------|--------|------|
| `conhecimento-base` | Base de Conhecimento | `/app/knowledge` |
| `conhecimento-vs-nia` | Conhecimento da empresa vs NIA | `/app/knowledge` |

### Canais / WhatsApp
| seedKey | Título | Rota |
|---------|--------|------|
| `whatsapp-estados` | WhatsApp — estados e conexão | `/app/integrations` |
| `whatsapp-faq` | FAQ — WhatsApp | `/app/integrations` |

### Automações / Campanhas
| seedKey | Título | Rota |
|---------|--------|------|
| `automacoes` | Automações (Fluxos) | `/app/automations` |
| `campanhas` | Campanhas | `/app/campaigns` |

### Equipe
| seedKey | Título | Rota |
|---------|--------|------|
| `equipe` | Equipe e permissões | `/app/team` |

### API / Webhooks
| seedKey | Título | Rota |
|---------|--------|------|
| `api` | API e chaves | `/app/settings/api` |
| `webhooks` | Webhooks | `/app/settings/webhooks` |

### Planos / Access Gate
| seedKey | Título | Rota |
|---------|--------|------|
| `planos-cobranca` | Planos e cobrança NexaFlow | settings / billing |
| `access-gate` | Access Gate — bloqueios e suspensões | — |

### Conta / Segurança
| seedKey | Título | Rota |
|---------|--------|------|
| `configuracoes` | Configurações e Minha Conta | `/app/settings`, `/app/account` |
| `seguranca-mfa` | Segurança, MFA e sessões | `/app/account/security` |

### Relatórios / Ajuda / NIA
| seedKey | Título | Rota |
|---------|--------|------|
| `relatorios` | Relatórios | `/app/reports` |
| `tour` | Tour da plataforma | preferências |
| `nia-assistente` | NIA — Assistente NexaFlow | drawer NIA |
| `novidades` | Novidades e atualizações | `/app/whats-new` |
| `suporte-escalonamento` | Quando escalar para suporte | — |
| `faq-geral` | FAQ geral da plataforma | — |
| `diagnostico-camadas` | Ordem de diagnóstico da NIA | — |

---

## Permissões e entitlements (resumo real)

| Área | Permission (típica) | Entitlement |
|------|---------------------|--------------|
| Conversas | `conversations.read` | `inbox` |
| Contatos | `contacts.read` | — |
| Funil | `crm.read` | `crm` |
| Tarefas | `tasks.read` | — |
| Agentes / Knowledge / Learning | `ai.manage` | `ai` |
| Equipe | `team.manage` | — |
| Canais | `channels.manage` | — |
| Relatórios | `reports.read` | `reports` |
| Settings / API / Webhooks | `settings.*` | `api` (API/webhooks) |
| Campanhas | `crm.read` (nav) | `campaigns` |
| Fluxos | — | `automations` |

Nunca oferecer navegação fora de `ASSISTANT_NAV_REGISTRY` + filtro RBAC/plano.

---

## Estados críticos que a NIA deve conhecer

### WhatsApp (canônico)
`NOT_CONFIGURED` · `CONNECTING` · `QR_REQUIRED` · `CONNECTED` · `RECONNECTING` · `DISCONNECTED` · `LOGGED_OUT` · `ERROR`

Sempre traduzir para linguagem humana no atendimento.

### Agente
- Ativo / inativo  
- Modos: `SUGGEST` (Copiloto), `APPROVE` (Aprovação), `AUTO` (Automático)

### Knowledge (tenant)
`draft` (Rascunho) · `ready` (Pronto) · `archived`

### Access Gate (níveis)
`FULL` · `WARNING` · `RESTRICTED` · `BLOCKED`  
Códigos: usuário bloqueado/suspenso; empresa bloqueada/suspensa/cancelada; grace/overdue; suspensão por inadimplência.

---

## Separações obrigatórias

1. **NIA** ≠ **Agente** do tenant  
2. **Help Knowledge** ≠ **KnowledgeDoc** comercial  
3. **Planos NexaFlow** ≠ **Planos e preços** da empresa  
4. **Import config do agente** ≠ **Import conhecimento**  
5. **Novidades (changelog)** ≠ **logs técnicos / Superadmin diagnostics**  
6. **Handoff cliente** ≠ **suporte humano NexaFlow**

---

## Freshness

| Campo | Uso |
|-------|-----|
| `seedKey` | Identidade estável do artigo de seed |
| `productVersion` | Versão de produto do conteúdo |
| `lastReviewedAt` | Última revisão no upsert do seed |
| `needsReview` | Marcar no Superadmin quando o produto mudar e o artigo ficar obsoleto |

Pipeline de gaps: pergunta não resolvida → `HelpKnowledgeGap` → revisão humana → novo artigo → publish.  
Sem auto-publicação a partir de feedback 👎.

---

## Manutenção

1. Validar comportamento real (rota + API + UI) antes de editar artigo.  
2. Atualizar seed + `productVersion` se o módulo mudar.  
3. Rodar API (seed upsert no bootstrap / primeiro chat / admin list).  
4. Não arquivar seed sem substituir cobertura no mapa.  
5. Superadmin: `/admin/assistant/help-knowledge`.
