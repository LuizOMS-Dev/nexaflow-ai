# Form UX Refinement — NexaFlow AI

Documento de auditoria e padronização visual de formulários, modais e diálogos.

**Escopo:** Design System + UX  
**Fora de escopo:** backend, APIs, schemas, validações de negócio, dados enviados

---

## 1. Padrão global criado

### Modal (refinado)

Arquivo: `apps/web/src/components/ui.tsx`

Novas props:

| Prop | Uso |
|------|-----|
| `icon` | Ícone contextual no header |
| `footer` | Ações fixas (Cancelar / Confirmar) |
| `size` | `sm` · `md` · `lg` · `xl` |
| `wide` | Mantido (alias legado → `lg`) |

Preservado:

- focus trap (Tab)
- auto-focus **somente** na abertura
- restauração de foco ao fechar
- sem re-focus em `onChange` (bug global corrigido)

### Helpers de layout

| Componente | Função |
|------------|--------|
| `DialogFooter` | Ações alinhadas à direita no desktop |
| `FormSection` | Agrupa campos com título/descrição |
| `FormField` | Label natural + hint + erro |
| `InlineHelp` | Texto auxiliar discreto |
| `WizardSteps` | Indicador de etapas |
| `FlowStep` | Bloco QUANDO → ENTÃO (automações) |

### Tokens visuais

- Labels: **sentence case** (sem caixa alta agressiva) — `.label`
- Inputs dark: fundo `#12141A` (menos contraste “preto puro”)
- Footer de modal: borda superior + ações à direita
- Mobile: modal full-width com cantos superiores arredondados

---

## 2. Modais auditados

| Tela | Modal | Tipo | Padrão aplicado |
|------|-------|------|-----------------|
| Fluxos | Novo fluxo | Médio/complexo | `size=lg` + `FlowStep` + footer |
| Fluxos | Ver execuções | Large | `wide` / lista + debugger |
| Agentes | Criar manualmente | Médio | `FormField` + footer + ícone |
| Agentes | Criar com assistente | Wizard | `WizardSteps` + `size=xl` |
| Agentes | Testar agente | Sandbox | Mantido (refinado antes) |
| Agentes | Editar | Médio | Mantido (lógica) |
| Conhecimento | Adicionar | Médio | footer + ícone + FormField |
| Conhecimento | Editar | Médio | footer + FormField |
| Conhecimento | Excluir | Confirmação | `size=sm` + footer |
| Conhecimento | Visualizar | Leitura | Mantido |
| Equipe | Convidar | Compacto | `size=sm` + footer |
| Tarefas | Nova tarefa | Compacto | `size=sm` + footer |
| Campanhas | Nova campanha | Médio | footer + FormField |
| CRM | Nova oportunidade | Médio | grid + footer |
| Contatos | Novo contato | Médio | `FormSection` + footer |
| Contatos | Importar CSV | Large | footer |
| Contatos | Histórico score | Compacto | legado (ok) |
| Settings | Alterações não salvas | Confirmação | legado (ok) |
| Account | Avatar picker | Large | legado |
| Account/Security | MFA | Médio | legado |
| Admin | Nova empresa / confirmar | Vários | legado (mesmo Modal) |

---

## 3. Componentes reutilizados / refinados

| Item | Status |
|------|--------|
| `Modal` | **REFINADO** (icon, footer, size) |
| `Select` | **PRESERVADO** (já global) |
| `.label` / `.input` | **REFINADO** |
| `DialogFooter` | **IMPLEMENTADO** |
| `FormField` / `FormSection` | **IMPLEMENTADO** |
| `WizardSteps` / `FlowStep` | **IMPLEMENTADO** |
| Focus trap | **PRESERVADO** |

---

## 4. Telas alteradas nesta etapa

1. `automations/page.tsx` — Novo fluxo visual QUANDO/ENTÃO  
2. `ai/page.tsx` — Criar agente manual + wizard steps  
3. `knowledge/page.tsx` — Criar / Editar / Excluir  
4. `team/page.tsx` — Convidar membro  
5. `tasks/page.tsx` — Nova tarefa  
6. `campaigns/page.tsx` — Nova campanha  
7. `crm/page.tsx` — Nova oportunidade  
8. `contacts/page.tsx` — Novo contato + Importar  
9. `ui.tsx` — Design System  
10. `globals.css` — labels e inputs  

---

## 5. Comportamento preservado

- Payloads de API idênticos  
- Validações de criação de agente  
- Test sandbox de agente  
- AutomationRun / run-test  
- PATCH knowledge  
- Invite team  
- Multi-tenant / RBAC  
- Select customizado (sem menu nativo do SO)  

---

## 6. Variações de dialog (guia)

| Variação | Quando usar | size |
|----------|-------------|------|
| Compact Dialog | Convidar, tarefa, confirmar | `sm` |
| Standard Form | Campanha, oportunidade, agente manual | `md` |
| Large Form | Conhecimento, fluxo | `lg` |
| Wizard | Assistente de agente | `xl` |
| Confirmation | Excluir, revogar | `sm` + footer destrutivo |

---

## 7. Próximos passos opcionais (não bloqueantes)

- Admin create tenant: adotar `DialogFooter`  
- Account MFA: FormField + footer  
- Campanhas: wizard multi-etapa se o produto expandir  
- Drawer lateral para builders avançados de fluxo  

---

## 8. Classificação final

| Categoria | Itens |
|-----------|--------|
| **PRESERVADO** | APIs, lógica, focus trap, Select, debugger de fluxos |
| **REFINADO** | Modal, labels, inputs, hierarquia de formulários prioritários |
| **IMPLEMENTADO** | DialogFooter, FormField, FormSection, WizardSteps, FlowStep |
| **CORRIGIDO** | Botões full-width genéricos nos modais prioritários; labels em caixa alta |
