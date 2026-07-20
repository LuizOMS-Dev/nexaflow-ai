# Modal Migration Audit — NexaFlow AI

Auditoria completa dos overlays após o redesign shell v2.

**Data:** 2026-07-15  
**Escopo:** todos os `<Modal>` do monorepo web.

## Totais

| Métrica | Valor |
|---------|------:|
| TOTAL DE MODAIS ENCONTRADOS | **43** |
| TOTAL REDESENHADOS (shell v2) | **43** |
| TOTAL COM COMPOSIÇÃO REFEITA | **18** |
| TOTAL DE DRAWERS REDESENHADOS | **1** (sidebar mobile = shell existente, não form-drawer) |
| TOTAL DE CONFIRMAÇÕES REDESENHADAS | **14** |
| TOTAL DE WIZARDS REDESENHADOS | **2** (import conhecimento + criar agente assistente) |
| TOTAL DE BUILDERS REFINADOS | **1** (Novo fluxo) |
| TOTAL DE SANDBOXES REFINADOS | **1** (Testar agente) |
| NÃO MIGRADOS | **0** |
| MOTIVO | — |

> Todos os 43 usam o shell `Modal` v2 (superfície, backdrop, sheet mobile, footer, header, animações).  
> “Composição refeita” = seções/EntitySummary/MoneyInput/danger/wizard steps além do shell.

---

## Administração

| Modal | Arquivo | Status | Padrão |
|-------|---------|--------|--------|
| Nova empresa | `admin/companies` | **MIGRADO** (seções Empresa/Admin/Plano) | Form |
| Impersonar | `admin/companies` | **MIGRADO** | Confirm |
| Registrar pagamento | `admin/companies` | **MIGRADO** (EntitySummary + MoneyInput) | Form |
| Alterar vencimento | `admin/companies` | **MIGRADO** | Quick |
| Alterar plano | `admin/companies` | **MIGRADO** (atual → novo) | Form |
| Bloquear / Suspender / Cancelar / Reativar | `admin/companies` | **MIGRADO** (danger + consequence) | Danger/Confirm |
| Excluir empresa | `admin/companies` | **MIGRADO** | Danger |
| Editar plano | `admin/plans` | **MIGRADO** (4 seções + currency + switch) | Contextual |
| Detalhe auditoria | `admin/audit` | **MIGRADO** | Detail |
| Suspender (tenant detail) | `admin/tenants/[id]` | **MIGRADO** | Confirm |
| Excluir (tenant detail) | `admin/tenants/[id]` | **MIGRADO** | Danger |
| Confirmar plano | `admin/tenants/[id]` | **MIGRADO** | Confirm |
| Registrar pagamento | `admin/tenants/[id]` | **MIGRADO** (shell) | Form |
| Impersonar | `admin/tenants/[id]` | **MIGRADO** | Confirm |

## Tenant — CRM / operação

| Modal | Arquivo | Status | Padrão |
|-------|---------|--------|--------|
| Novo contato | `app/contacts` | **MIGRADO** (ContextZone) | Contextual |
| Importar contatos | `app/contacts` | **MIGRADO** | Form |
| Histórico score | `app/contacts` | **MIGRADO** | Quick |
| Nova oportunidade | `app/crm` | **MIGRADO** (Context + Money) | Contextual |
| Nova tarefa | `app/tasks` | **MIGRADO** | Contextual |
| Nova campanha | `app/campaigns` | **MIGRADO** | Contextual |
| Finalizar atendimento | `app/inbox` | **MIGRADO** | Confirm |
| Convidar membro | `app/team` | **MIGRADO** | Contextual |
| Alterações não salvas | `app/settings` | **MIGRADO** | Confirm |

## IA / conhecimento / fluxos

| Modal | Arquivo | Status | Padrão |
|-------|---------|--------|--------|
| Novo agente (escolha) | `app/ai` | **MIGRADO** (ActionChoiceCard) | Form |
| Criar agente manual | `app/ai` | **MIGRADO** | Contextual |
| Criar com assistente | `app/ai` | **MIGRADO** | Wizard |
| Editar agente | `app/ai` | **MIGRADO** | Contextual |
| Testar agente | `app/ai` | **SANDBOX PRESERVADO E REFINADO** | Sandbox |
| Novo fluxo | `app/automations` | **BUILDER PRESERVADO E REFINADO** | Builder |
| Histórico execuções | `app/automations` | **MIGRADO** | Detail |
| Excluir fluxo | `app/automations` | **MIGRADO** | Danger |
| Adicionar conhecimento (escolha) | `app/knowledge` | **MIGRADO** | Form |
| Escrever conhecimento | `app/knowledge` | **MIGRADO** | Contextual |
| Visualizar conhecimento | `app/knowledge` | **MIGRADO** | Detail |
| Editar conhecimento | `app/knowledge` | **MIGRADO** | Contextual |
| Excluir conhecimento | `app/knowledge` | **MIGRADO** | Danger |
| Importar conhecimento (wizard) | `knowledge-import-wizard` | **WIZARD REFINADO** (+ WizardSteps) | Wizard |
| Importação concluída | `knowledge-import-wizard` | **MIGRADO** | Confirm |
| Editar item import | `knowledge-import-wizard` | **MIGRADO** | Contextual |

## Conta / segurança

| Modal | Arquivo | Status | Padrão |
|-------|---------|--------|--------|
| Escolher avatar | `app/account` | **MIGRADO** | Form |
| Códigos de recuperação MFA | `app/account/security` | **MIGRADO** | Form (bloqueante) |
| Ativar / gerenciar MFA | `app/account/security` | **MIGRADO** | Form |
| Desativar MFA | `app/account/security` | **MIGRADO** | Danger |

## Overlays relacionados (não-Modal class)

| Overlay | Status |
|---------|--------|
| Sidebar drawer mobile | PRESERVADO (shell app) |
| Command palette | PRESERVADO (overlay próprio) |
| Notification panel | PRESERVADO |
| Select / Dropdown menus | PRESERVADO (portal DS) |

## NÃO MIGRADOS

Nenhum modal de formulário/confirmação ficou no shell antigo.

## Notas técnicas

- APIs e schemas: **preservados**.
- `variant="danger"` é novo; `confirm` permanece para avisos não-destrutivos.
- Pagamento em companies: `MoneyInput` + resumo de entidade.
- Enterprise/planos: sem mudança de entitlement.
- Drawer de formulário dedicado: **não existia** como primitivo separado; mobile sheet do Modal cobre o caso.

## Próximos refinamentos opcionais (fora do escopo crítico)

- `admin/tenants` pagamento com EntitySummary igual a companies.
- Checkbox customizado em multi-select de knowledge (já Switch).
- RadioGroup visual para tipo de preço (hoje Select).
