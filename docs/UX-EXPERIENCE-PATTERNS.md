# Padrões de Experiência — Modais e Formulários NexaFlow

**Data:** 2026-07-15  
**Escopo:** composição de UX (não lógica de negócio)  
**Status:** migração aplicada nas seções do app (referências + restantes)

---

## 1. Totais

| Métrica | Valor |
|---------|------:|
| Dialogs/modais na plataforma | **~28** |
| Migrados com padrão de experiência | **todos os listados abaixo** |
| Lógica / APIs / schemas alterados | **não** (exceto DELETE fluxo já entregue antes) |

---

## 2. Os 8 padrões

| # | Padrão | `Modal` variant / helpers | Uso |
|---|--------|---------------------------|-----|
| 1 | **QUICK** | `variant="quick"` | Poucos campos, header mínimo |
| 2 | **STANDARD** | `variant="soft"` + `FormSection` / grid | Cadastros e edição |
| 3 | **CONTEXTUAL** | `variant="contextual"` + `ContextZone` + `ContextSummary` | Negociação / tarefa com significado |
| 4 | **WIZARD** | `variant="soft"` + `WizardSteps` + footer de etapas | Assistente guiado |
| 5 | **DRAWER** | *(reservado — lateral futura)* | Edição pesada com contexto da página |
| 6 | **CONFIRMATION** | `variant="confirm"` | Excluir / ações irreversíveis |
| 7 | **SANDBOX** | `variant="sandbox"` | Teste de agente / conversa |
| 8 | **BUILDER** | `variant="builder"` + `BuilderNode` | Fluxos / automação |

Primitive compartilhada: `Modal` (portal, trap, teclado) + `DialogFooter` + `FormField` + `Select` + tokens NexaFlow.

---

## 3. Inventário migrado

| Tela | Modal | Padrão |
|------|-------|--------|
| CRM | Nova oportunidade | **CONTEXTUAL** |
| Fluxos | Novo fluxo | **BUILDER** |
| Fluxos | Ver execuções | STANDARD (lista large) |
| Fluxos | Excluir fluxo | **CONFIRMATION** |
| Agentes | Criar manualmente | **STANDARD** (Identidade + Comportamento) |
| Agentes | Criar com assistente | **WIZARD** |
| Agentes | Editar | **STANDARD** large |
| Agentes | Testar | **SANDBOX** |
| Conhecimento | Adicionar / Editar | **STANDARD** |
| Conhecimento | Visualizar | STANDARD (read) |
| Conhecimento | Excluir | **CONFIRMATION** |
| Equipe | Convidar membro | **QUICK** |
| Tarefas | Nova tarefa | **QUICK** |
| Campanhas | Nova campanha | **STANDARD** |
| Contatos | Novo contato | **STANDARD** (Pessoa + Comercial) |
| Contatos | Importar | **STANDARD** |
| Contatos | Histórico score | **QUICK** |
| Settings | Alterações não salvas | **CONFIRMATION** |
| Conta | Avatar picker | **STANDARD** |
| Segurança | MFA gerenciar | **STANDARD** |
| Segurança | MFA desativar | **CONFIRMATION** |
| Admin | Nova empresa | **STANDARD** |
| Admin | Impersonar | **CONFIRMATION** |
| Admin tenant | Suspender / Arquivar / Plano / Impersonar | **CONFIRMATION** |

---

## 4. Critério de qualidade

Consistência: cores, tipografia, Select, inputs, botões compactos (`h-9`), espaçamento.  
Interação contextual: layout e hierarquia **diferentes** por padrão — sem clonar o mesmo FormDialog.

---

## 5. Evoluções futuras (opcional)

- Drawer real para edição complexa (contato completo, config de agente)
- Campanha como wizard multi-etapa quando o produto crescer
- Builder full-page para fluxos avançados
