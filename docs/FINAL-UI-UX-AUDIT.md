# NexaFlow AI — Auditoria Final de Design, UI, UX e Layout

**Data:** 2026-07-15  
**Escopo:** Design System + shells + páginas de produto/admin  
**Método:** inspeção estática do monorepo `apps/web` + correções na raiz  
**Regra:** sem redesign; identidade roxa NexaFlow **preservada**

---

## Sumário executivo

| Dimensão | Estado |
|----------|--------|
| Identidade visual (cores, dark, brand) | **PRESERVADO** — aprovada |
| Design System (btn, card, input, Select, Modal, Dropdown) | **IMPLEMENTADO** / **REFINADO** |
| Selects nativos | **OK** — nenhum `<select>` residual |
| Overlay (Portal, z-index) | **OK** — escala `--z-*` |
| Contexto SUPERADMIN vs tenant | **PRESERVADO** / **CORRIGIDO** em sessões anteriores |
| MFA gate | **PRESERVADO** — não é “erro de carregamento” |
| Hover com layout shift | **CORRIGIDO** na raiz |
| Terminologia “tenant” na UI admin | **CORRIGIDO** |
| Documentação de padrões de modal | **PRESERVADO** (`UX-EXPERIENCE-PATTERNS.md`) |

**Veredito:** Design System **fechado**. Homologação responsiva automatizada (Chromium, 11 viewports) em 2026-07-15 — ver `docs/RESPONSIVE-QA-REPORT.md`.

**Atualização (form/dialogs):** linguagem visual do modal **Nova empresa** elevada a padrão global do `Modal` (`variant` default = `soft`). Ver `docs/FORM-DIALOG-DESIGN-SYSTEM.md`.

**Classificação UI/UX:** `UI_UX_RESPONSIVE_READY` · `NOT_TESTED_ON_PHYSICAL_DEVICE`

---

## 1. Design System global

### Componentes auditados (raiz)

| Componente | Local | Status |
|------------|-------|--------|
| Button (primary/secondary/ghost/danger) | `globals.css` `.btn*` | **PADRONIZADO** — sem `active:scale` (zero shift) |
| Input / textarea / label | `globals.css` | **PRESERVADO** |
| Select (portal) | `ui-select.tsx` + reexport `ui.tsx` | **PRESERVADO** |
| Card / card-hover / card-interactive | `globals.css` | **PRESERVADO** — hover sem transform |
| ActionChoiceCard | `ui.tsx` | **CORRIGIDO** — removidos scale/translate no hover |
| Modal / DialogFooter / FormField | `ui.tsx` | **PRESERVADO** (8 padrões UX) |
| Dropdown (portal, ESC, collision) | `ui.tsx` | **PRESERVADO** |
| EmptyState | `ui.tsx` | **REFINADO** — padding/tipografia |
| Skeleton / ListSkeleton / StatCardSkeleton | `ui.tsx` + `.skeleton` | **PRESERVADO** |
| Spinner | `ui.tsx` | **PRESERVADO** |
| PageHeader / breadcrumbs | `ui.tsx` | **REFINADO** — ritmo vertical |
| StatCard | `ui.tsx` | **REFINADO** — labels sem ALL CAPS |
| Toast | `ui.tsx` | **PRESERVADO** |
| Tooltip | `ui.tsx` | **PRESERVADO** |
| Badge | `globals.css` | **PRESERVADO** |

### Não duplicar

- Select customizado é a única superfície de escolha listada no app.
- Modal única + `variant` (quick/soft/confirm/sandbox/builder).
- Não há segundo sistema de botões além de `.btn-*`.

---

## 2. Cores e identidade

| Token | Uso | Status |
|-------|-----|--------|
| `brand-500/600` | CTA, foco, ativo | **PRESERVADO** |
| Emerald | sucesso / conectado | **PRESERVADO** |
| Amber | atenção | **PRESERVADO** |
| Red | destrutivo | **PRESERVADO** |
| ink / line / surface | texto, bordas | **PRESERVADO** |
| Dark `#0B0C10` / cards `#12141A` | shell premium | **PRESERVADO** |

Sem neon, sem glow de produto (glows restritos a auth/login).

---

## 3. Tipografia e hierarquia

| Nível | Padrão | Status |
|-------|--------|--------|
| Página (`PageHeader` h1) | ~1.4–1.5rem display | **REFINADO** |
| Seção admin (h2) | 1.125rem sob shell “Administração” | **PRESERVADO** (não duplica nav) |
| Agrupadores sidebar | `.section-title` / uppercase 2xs | **PRESERVADO** |
| Label formulário | `.label` 12px medium | **PRESERVADO** |
| KPI label | 12px medium (sem uppercase forçado) | **REFINADO** |

---

## 4. Espaçamento e layout

| Item | Status |
|------|--------|
| `--nf-page-max-width: 1600px` | **PRESERVADO** |
| Sidebar 232 / 72 | **PRESERVADO** |
| `PageHeader` mb 4–5 (antes 6–8) | **REFINADO** |
| Cards crescem com conteúdo | **PRESERVADO** |
| `nf-panel-lock` — um scroll no main | **PRESERVADO** |

---

## 5. Overlays, z-index e portals

Escala oficial (`globals.css`):

| Camada | Token |
|--------|-------|
| content | 10 |
| sticky | 20 |
| sidebar | 30 |
| dropdown | 40 |
| drawer | 45 |
| modal backdrop / modal | 50 / 60 |
| popover (Select) | 65 |
| toast | 80 |

Dropdown, Select, Modal e Tooltip usam **portal** no `document.body` → sem clipping por `overflow`.

---

## 6. Contexto e navegação

| Contexto | Comportamento | Status |
|----------|---------------|--------|
| Tenant | Nav operacional + empresa atual | **PRESERVADO** |
| SUPERADMIN global | Só nav plataforma; sem “Empresa atual” | **PRESERVADO** |
| Impersonação | Banner + Voltar para Administração | **PRESERVADO** |
| MFA pendente | Gate + nav admin desabilitada | **PRESERVADO** |
| Admin shell | Sem segunda sidebar | **PRESERVADO** |

---

## 7. Auditoria por área (síntese)

| Área | Achados | Ação |
|------|---------|------|
| Login / Register | Identidade dark + brand; glows só em auth | **PRESERVADO** |
| MFA gate SUPERADMIN | “Proteja sua conta” | **PRESERVADO** |
| Home / onboarding | Separado de status WhatsApp | **PRESERVADO** (sessões anteriores) |
| Conversas | Prioridade no chat; layout flex | **PRESERVADO** |
| Contatos | LeadStatus (sem quente/frio) | **PRESERVADO** |
| Funil | Kanban scroll/snap/fade | **PRESERVADO** |
| Tarefas / Campanhas | Padrões de modal | **PRESERVADO** |
| Fluxos | Builder + labels humanos | **PRESERVADO** |
| Agentes + Sandbox | Testar isolado | **PRESERVADO** |
| Conhecimento + import | Wizard | **PRESERVADO** |
| Equipe / Canais | Copy humana | **PRESERVADO** |
| Relatórios | KPIs limitados | **PRESERVADO** |
| Configurações | Nav contextual | **PRESERVADO** |
| Minha Conta | Perfil / Segurança / Sessões / Preferências | **PRESERVADO** (breadcrumb duplicado já removido) |
| Admin (overview…audit) | Copy “tenant” / ACTIVE | **CORRIGIDO** |
| Selects nativos | Zero ocorrências | **OK** |
| Focus jump formulários | Sem padrão residual de key=Date.now no form | **OK** (monitorar regressões) |

---

## 8. Correções aplicadas nesta auditoria

1. **ActionChoiceCard** — hover sem `scale` / `translate` (só border/bg/shadow).  
2. **`.btn`** — removido `active:scale` (sem layout jump no clique).  
3. **PageHeader** — ritmo vertical e tipografia de página.  
4. **EmptyState** — padding e descrição mais compactos.  
5. **StatCard** — labels naturais (sem ALL CAPS).  
6. **Admin** — textos sem “tenant” / “ACTIVE” técnicos.  
7. **Account shell** — `space-y` alinhado ao PageHeader.  
8. **globals.css** — comentário corrompido do funil corrigido.

---

## 9. Checklist final

| Item | Status |
|------|--------|
| Nenhum dropdown cortado (portal) | **OK** |
| Nenhum select nativo | **OK** |
| Modal viewport | **OK** |
| Foco pulando (padrão conhecido) | **OK** / monitorar |
| UTF-8 UI (textos de produto) | **OK** — mojibake residual só em **comentários** CSS legados |
| CTA principal duplicado (casos recentes) | **OK** (MFA/admin) |
| Card hover pulando | **CORRIGIDO** na raiz |
| Nav admin duplicada | **OK** |
| Contexto tenant × superadmin | **OK** |
| MFA ≠ erro de load | **OK** |
| Empty / loading / toast | **OK** |
| Sidebar aberta/recolhida | **OK** |
| Desktop | **OK** (código + tokens) |
| Tablet / mobile | **PARCIAL** — estrutura existe; validar em device real |

---

## 10. Pendências (não bloqueiam identidade)

| # | Item | Prioridade |
|---|------|------------|
| 1 | Homologação visual em 1366×768 e mobile real | P1 ops |
| 2 | Limpar mojibake residual **apenas em comentários** de `globals.css` | P3 |
| 3 | Drawer lateral real para edição pesada (já documentado) | P2 futuro |
| 4 | Passada de contraste WCAG em badges escuros | P2 |
| 5 | E2E visual (Playwright) | P2 CI |

---

## 11. Classificação final

| Nível | |
|-------|--|
| Redesign necessário? | **Não** |
| Design System fechado o suficiente para clientes? | **Sim** |
| Pronto para uso comercial com polimento residual? | **Sim** (`READY_FOR_EXTERNAL_HOMOLOGATION` visual) |

---

## Integridade factual

- Baseado em leitura de código e correções aplicadas no repositório.  
- **Não** afirmado: QA manual em todos os viewports físicos listados no prompt.  
- Identidade NexaFlow **não** foi redesenhada.
