# Form & Dialog Design System — NexaFlow

**Referência visual aprovada:** modal **Nova empresa** (`variant="soft"`, header com ícone, footer Cancelar + ação específica).

**Escopo:** UI/UX de overlays e formulários.  
**Fora de escopo:** backend, APIs, RBAC, validações de negócio.

---

## Princípios

1. **Mesma identidade** em todos os overlays (superfície, borda, sombra, tipografia, roxo).
2. **Composição por tarefa** — Quick / Standard / Contextual / Wizard / Builder / Sandbox / Confirm / Drawer.
3. **Não copiar o layout de Nova empresa mecanicamente** em builders e sandboxes.
4. **Trigger compacto · conteúdo legível** (Select global com menu independente do trigger).

---

## Componente base

Arquivo: `apps/web/src/components/ui.tsx` → `Modal`

| Prop | Uso |
|------|-----|
| `title` | Título forte (sentence case) |
| `description` | 1 linha, curta |
| `icon` | Ícone contextual (lucide) |
| `footer` | Preferir `DialogFooter` |
| `size` | `sm` · `md` · `lg` · `xl` |
| `variant` | ver abaixo |
| `preventClose` | Loading / step-up |

**Default `variant` = `soft`** (acabamento Nova empresa).

### Variantes

| Variant | Quando usar |
|---------|-------------|
| `soft` / `default` | Formulários curtos–médios (criar/editar) |
| `contextual` | Formulários com zonas (Contato, Negócio…) |
| `quick` | Ajuste rápido, header mínimo |
| `confirm` | Excluir, suspender, sair sem salvar (ícone alerta se sem icon) |
| `builder` | Fluxos Quando → Então |
| `sandbox` | Testar agente |
| `soft` + wizard steps | Assistente multi-etapa |

### Tamanhos

| Size | Uso |
|------|-----|
| `sm` | Confirmações |
| `md` | Nova empresa, convite, pagamento |
| `lg` | Oportunidade, formulários mais densos |
| `xl` | Wizard / importação |

---

## Helpers de formulário

| Componente | Função |
|------------|--------|
| `DialogFooter` | Ações à direita (Cancelar → Primário) |
| `FormField` | Label + campo + hint + erro |
| `FormGrid` | 1→2 colunas responsivas |
| `FormStack` | Espaçamento vertical padrão |
| `FormSection` | Grupo com título opcional |
| `WizardSteps` | Etapas |
| `ContextZone` / `ContextDivider` | Contextual form |
| `Select` | Dropdown DS (portal, largura do menu ≠ trigger) |

---

## Header

```
[ícone]  Título                         [X]
         Descrição curta
```

- Sem ALL CAPS no título.
- Um ícone basta.
- Confirmações: ícone de alerta automático se `icon` omitido.

## Footer

```
                    [Cancelar]  [Ação específica]
```

- Primário **não** full-width no desktop.
- Labels: “Criar empresa”, “Salvar alterações”, “Registrar pagamento”…
- Loading: desabilitar + “Criando…”, “Salvando…”

## Inputs

- Classe `.input` global.
- Dentro do modal: fundo integrado (`#0e1117` dark).
- Focus ring roxo sutil.
- Label `.label` acima (sentence case + `*` se required).

## Selects

- Sempre `Select` customizado.
- Portal + z-index de popover.
- Menu com largura própria (texto completo).

## Confirmações destrutivas

- `variant="confirm"`
- Botão `btn-danger` na ação principal.
- Descrever consequências; preferir digitar nome quando irreversível.

## Drawers / páginas

Formulários longos (detalhe de empresa, billing avançado) permanecem em **página** ou drawer — não forçar modal único.

---

## Checklist de consistência

- [x] Superfície dark premium unificada no `Modal`
- [x] Header sem divisor pesado
- [x] Footer blur + borda sutil
- [x] Default `soft`
- [x] FormField / FormGrid
- [x] Select no modal alinhado ao input
- [x] Botões de footer não 100% no desktop

---

## Telas que herdam automaticamente

Qualquer uso de `<Modal>` + `FormField` + `DialogFooter` + `Select`:

Admin Empresas, Planos, Auditoria, detalhe tenant · Contatos · CRM · Tarefas · Campanhas · Fluxos · Agentes · Conhecimento · Equipe · Conta/Segurança · Inbox (confirmações).
