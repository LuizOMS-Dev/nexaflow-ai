# Modal Redesign System — NexaFlow AI

Sistema visual global de overlays (shell v2). Preserva backend, APIs, RBAC e fluxos; redefine UI/UX.

## Princípios

1. **Um Design System**, vários padrões de composição.
2. Mobile: bottom sheet com handle; desktop: painel central.
3. Header + body com scroll + footer fixo (quando há ações).
4. Sem checkbox/select/spinner nativos para estados de produto.
5. Focus trap estável (sem roubar foco em digitação).
6. Backdrop com blur discreto; animação 180–280ms, sem bounce.

## Primitives (`apps/web/src/components/ui.tsx`)

| Componente | Uso |
|------------|-----|
| `Modal` | Shell único (portal) |
| `DialogFooter` | Ações Cancelar / primária |
| `FormSection` | Título de seção sem card |
| `FieldGrid` | Grid 1–3 colunas |
| `EntitySummary` | Resumo de empresa/plano no topo |
| `ConsequenceBanner` | Aviso warning/danger/info |
| `ChoiceCard` / `ActionChoiceCard` | Escolha de caminho |
| `WizardSteps` | Progresso de wizard |
| `MoneyInput` / `CurrencyInput` | Moeda BRL |
| `NumberInput` | Inteiros sem spinner |
| `Switch` | Boolean on/off |
| `Select` | Dropdown com portal |
| `ContextZone` / `ContextSummary` | Formulários contextualizados |
| `BuilderNode` | Builder de fluxos |

## Variantes (`ModalVariant`)

| Variant | Padrão | Exemplo |
|---------|--------|---------|
| `soft` / `default` | Form dialog | Nova empresa, pagamento |
| `contextual` | Zonas semânticas | Contato, oportunidade, agente |
| `quick` | Poucos campos | Alterar vencimento |
| `confirm` | Confirmação | Impersonar, fechar conversa |
| `danger` | Destrutivo | Excluir empresa, fluxo, MFA off |
| `builder` | Quando → Então | Novo fluxo |
| `sandbox` | Chat de teste | Testar agente |
| `detail` | Leitura | Auditoria, histórico, view doc |

## Tamanhos

`sm` · `md` · `lg` · `xl` · `full`

## Tom do ícone (`tone`)

`default` · `brand` · `warning` · `danger` · `success` · `violet`

## Regras de composição

- Agrupar campos com `FormSection` + divisores sutis — **não** cards aninhados.
- Campos longos em largura total; pares em `FieldGrid`.
- Ações destrutivas: `variant="danger"` + `ConsequenceBanner` + confirmação forte.
- Financeiro: `EntitySummary` + `MoneyInput`.
- Booleanos de status: `Switch`, nunca checkbox nativo.

## Acessibilidade

- `role="dialog"` + `aria-modal`
- ESC fecha (se `!preventClose`)
- Tab trap no painel
- Auto-focus **somente** na abertura real do modal

## CSS

`globals.css` — classes `.nf-modal-*`, animações `nf-modal-in` / `nf-modal-sheet-in`, inputs no painel.
