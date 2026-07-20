# Inventário completo de overlays — NexaFlow AI

**Atualizado:** 2026-07-16  
**Fonte:** `leia/leia.txt` + varredura de `apps/web/src`  
**Escopo:** todos os `Modal` e fluxos de overlay (wizard/page).

| Contagem | Valor |
|----------|------:|
| **TOTAL DE OVERLAYS** | **50** |
| **MODAIS (`Modal`)** | **46** |
| **DRAWERS dedicados** | **0** (mobile = bottom sheet do `Modal`) |
| **WIZARDS** | **3** (agente, import conhecimento, onboarding page) |
| **CONFIRMATIONS** | **8** |
| **DANGER** | **8** |
| **SANDBOX** | **1** |
| **BUILDER** | **1** |
| **CONNECTION FLOW (página)** | **2** (WhatsApp, MFA) |
| **COMMAND PALETTE** | **1** (Ctrl+K, não form) |

---

## Padrões

1. QUICK ACTION · 2. STANDARD FORM · 3. CONTEXTUAL FORM · 4. FINANCIAL ACTION  
5. WIZARD · 6. DRAWER · 7. DETAIL VIEW · 8. CONFIRMATION · 9. DANGER ACTION  
10. SANDBOX · 11. BUILDER · 12. CONNECTION FLOW

---

## Superadmin

| # | Nome | Rota | Tipo | Padrão | Status |
|---|------|------|------|--------|--------|
| 1 | Nova empresa | `/admin/companies` | Modal | STANDARD FORM (Empresa / Admin / Plano) | **Reconstruído** |
| 2 | Acessar como empresa | `/admin/companies` | Modal | CONFIRMATION | **Reconstruído** |
| 3 | Step-up identidade | `/admin/companies` | Modal | QUICK ACTION | **Reconstruído** |
| 4 | Registrar pagamento | `/admin/companies` | Modal | FINANCIAL ACTION + EntitySummary | **Reconstruído** |
| 5 | Alterar vencimento | `/admin/companies` | Modal | QUICK ACTION + resumo | **Reconstruído** |
| 6 | Alterar plano | `/admin/companies` | Modal | FINANCIAL + impacto limites | **Reconstruído** |
| 7 | Bloquear/Suspender/Cancelar/Reativar | `/admin/companies` | Modal | DANGER / CONFIRMATION | **Reconstruído** |
| 8 | Excluir empresa | `/admin/companies` | Modal | DANGER (digite nome) | **Reconstruído** |
| 9 | Editar informações | `/admin/tenants/[id]` | Modal | CONTEXTUAL (Info/Contato/Local) | **Reconstruído** |
| 10 | Suspender | `/admin/tenants/[id]` | Modal | DANGER | **Reconstruído** |
| 11 | Excluir | `/admin/tenants/[id]` | Modal | DANGER | **Reconstruído** |
| 12 | Confirmar plano | `/admin/tenants/[id]` | Modal | CONFIRMATION | Revisado |
| 13 | Registrar pagamento | `/admin/tenants/[id]` | Modal | FINANCIAL + DateInput | **Reconstruído** |
| 14 | Acessar empresa | `/admin/tenants/[id]` | Modal | CONFIRMATION | Revisado |
| 15 | Step-up | `/admin/tenants/[id]` | Modal | QUICK ACTION | Revisado |
| 16 | Limpar logs empresa | `/admin/tenants/[id]` | Modal | DANGER | Revisado |
| 17 | Editar plano catálogo | `/admin/plans` | Modal | CONTEXTUAL (Info/Preço/Limites/Exibição) | **Reconstruído** |
| 18 | Detalhe evento | `/admin/audit` | Modal | DETAIL VIEW + técnicos expansíveis | **Reconstruído** |
| 19 | Limpar logs globais | `/admin/audit` | Modal | DANGER | Revisado |

## App (tenant)

| # | Nome | Rota | Padrão | Status |
|---|------|------|--------|--------|
| 20 | Novo contato | `/app/contacts` | STANDARD (Identificação + Comercial) | **Reconstruído** |
| 21 | Importar contatos | `/app/contacts` | STANDARD | **Reconstruído** |
| 22 | Histórico score | `/app/contacts` | DETAIL VIEW | **Reconstruído** |
| 23 | Nova tarefa | `/app/tasks` | QUICK (Tarefa / Quando e quem / Prioridade) | **Reconstruído** |
| 24 | Nova campanha | `/app/campaigns` | STANDARD (Campanha + Mensagem) | **Reconstruído** |
| 25 | Nova oportunidade | `/app/crm` | CONTEXTUAL (contato + funil) | **Reconstruído** |
| 26 | Convidar membro | `/app/team` | QUICK (Identidade + Papel) | **Reconstruído** |
| 27 | Escolha criar agente | `/app/ai` | QUICK | Revisado |
| 28 | Criar agente manual | `/app/ai` | STANDARD (Identidade + Comportamento) | **Reconstruído** |
| 29 | Wizard agente | `/app/ai` | WIZARD | Preservado |
| 30 | Editar agente | `/app/ai` | STANDARD (Identidade / Instruções / Operação) | **Reconstruído** |
| 31 | Testar agente | `/app/ai` | SANDBOX | Preservado |
| 32 | Adicionar conhecimento | `/app/knowledge` | QUICK (cards) | Revisado |
| 33 | Escrever conhecimento | `/app/knowledge` | STANDARD | **Reconstruído** |
| 34 | Ver conhecimento | `/app/knowledge` | DETAIL | Revisado |
| 35 | Editar conhecimento | `/app/knowledge` | STANDARD | **Reconstruído** |
| 36 | Excluir conhecimento | `/app/knowledge` | DANGER | Revisado |
| 37a–c | Import conhecimento | wizard | WIZARD multi-step | Revisado |
| 38 | Histórico runs | `/app/automations` | DETAIL | Revisado |
| 39 | Novo fluxo | `/app/automations` | BUILDER (Quando → Então → ID) | Preservado / refinado |
| 40 | Excluir fluxo | `/app/automations` | DANGER | Revisado |
| 41 | Finalizar atendimento | `/app/inbox` | CONFIRMATION | **Reconstruído** |
| 42 | Sair sem salvar | `/app/settings` | CONFIRMATION | Revisado |
| 43 | Escolher avatar | `/app/account` | QUICK | **Reconstruído** |
| 44 | Alterar senha | `/app/account/security` | PAGE form (FormField) | **Reconstruído** |
| 45 | MFA setup | `/app/account/security` | CONNECTION FLOW | **Reconstruído** |
| 46 | Códigos recuperação | `/app/account/security` | CONTEXTUAL | Revisado |
| 47 | Desativar MFA | `/app/account/security` | DANGER | **Reconstruído** |

## Fora de Modal

| # | Nome | Rota | Tipo | Status |
|---|------|------|------|--------|
| 48 | WhatsApp conexão | `/app/integrations` | CONNECTION FLOW página | Preservar |
| 49 | Onboarding empresa | `/app/onboarding` | WIZARD page | Revisado copy |
| 50 | Command palette | global | Overlay busca | Não form |

---

## Primitivos do Design System

| Primitive | Status |
|-----------|--------|
| Modal (shell + variants + mobile sheet) | ✓ |
| DialogFooter (sólido light/dark) | ✓ |
| EntitySummary | ✓ |
| FormSection / FieldGrid / FormField | ✓ |
| MoneyInput / NumberInput / **DateInput** | ✓ |
| Select / Switch / ChoiceChip / ActionChoiceCard | ✓ |
| ConsequenceBanner / WizardSteps / BuilderNode | ✓ |
| DrawerShell dedicado | Não — sheet mobile via Modal |

---

## Legenda

- **Reconstruído** — composição com contexto + seções (não só CSS)
- **Revisado** — variant/copy/estrutura adequados ao padrão
- **Preservado** — identidade própria (builder/sandbox/connection)
