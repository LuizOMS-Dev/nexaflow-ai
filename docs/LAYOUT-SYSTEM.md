# NexaFlow AI — Sistema de layout interno

## Estrutura

```
.nf-app-shell                    height: 100dvh; overflow: hidden
├── .nf-shell-banner             (opcional, no fluxo — nunca fixed sobre conteúdo)
└── .nf-shell-body               flex:1; min-height:0
    ├── .nf-sidebar-rail         desktop: largura --nf-sidebar-current
    │   └── .nf-sidebar
    │       ├── logo/empresa     shrink-0
    │       ├── .nf-sidebar-nav  flex:1; overflow-y: auto
    │       └── user footer      shrink-0
    └── .nf-main                 flex:1; min-width:0; overflow:hidden
        ├── .nf-mobile-header    só < lg
        └── .nf-main-scroll      overflow-y: auto  ← único scroll principal
            └── .page.nf-cq      max-width: 1600px; container-type: inline-size
```

## Variáveis CSS (`:root`)

| Variável | Valor | Uso |
|----------|-------|-----|
| `--nf-sidebar-expanded` | 252px | Sidebar aberta |
| `--nf-sidebar-collapsed` | 76px | Sidebar recolhida |
| `--nf-sidebar-current` | dinâmica | Rail width |
| `--nf-banner-height` | 0 / 2.5rem | Impersonação |
| `--nf-page-max-width` | 1600px | Container |
| `--nf-page-pad-x/y` | 1.5–2rem | Padding main |
| `--nf-sidebar-duration` | 220ms | Transição |
| `--z-*` | escala 0–90 | Z-index oficial |

## Comportamento

| Contexto | Sidebar | Conteúdo |
|----------|---------|----------|
| Desktop ≥1024px | No fluxo flex (reflow) | `flex:1; min-width:0` |
| Mobile <1024px | Drawer overlay | Full width |
| Impersonação | Banner acima do body | Sem cobertura |

## Container queries

`.nf-cq` no page container:

- `< 520px` → 1 coluna (stats / onboarding)
- `≥ 520px` → 2 colunas
- `≥ 960px` → 4 colunas

Reage ao **espaço real após a sidebar**, não só à viewport.

## Fonte de verdade React

`AppShell`:

- `collapsed` → `data-collapsed` + localStorage
- `impersonating` → `data-impersonating` + sessionStorage
- Nunca recarrega página ao recolher menu

## Z-index

| Camada | Token |
|--------|--------|
| content | `--z-content` (10) |
| sticky header | `--z-sticky` (20) |
| sidebar | `--z-sidebar` (30) |
| dropdown | `--z-dropdown` (40) |
| drawer | `--z-drawer` (45) |
| modal | `--z-modal` (60) |
| banner | `--z-banner` (70) |
| command | `--z-command` (75) |
| toast | `--z-toast` (80) |
