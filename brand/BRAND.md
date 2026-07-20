# NexaFlow AI — Identidade de marca

## Conceito

**Nexa** (nexus / conexão) + **Flow** (fluxo de conversas e vendas).

O símbolo representa **canais conectados em fluxo contínuo**, com um **spark de IA** (cian) indicando inteligência sobre o atendimento.

## Personalidade

| Atributo | Descrição |
|----------|-----------|
| Clara | Interface limpa, textos objetivos |
| Confiável | SaaS B2B para PMEs |
| Inteligente | IA como copiloto, não mágica |
| Humana | Tom brasileiro, acessível |
| Moderna | Visual tech sem exagero |

## Cores

### Primária (Indigo Brand)

| Token | Hex | Uso |
|-------|-----|-----|
| brand-600 | `#4F46E5` | Botões primários, links |
| brand-500 | `#6366F1` | Destaques, ícones |
| brand-700 | `#4338CA` | Hover |
| brand-50 | `#EEF2FF` | Fundos suaves |

### Acento (IA)

| Token | Hex | Uso |
|-------|-----|-----|
| cyan | `#22D3EE` | Spark de IA, badges AI |
| violet | `#7C3AED` | Gradiente do logo |

### Neutros

| Token | Hex |
|-------|-----|
| slate-950 | `#020617` sidebar / dark |
| slate-900 | `#0F172A` texto forte |
| slate-500 | `#64748B` texto secundário |
| slate-50 | `#F8FAFC` fundo app |

### Semânticas

- Sucesso `#10B981` · Alerta `#F59E0B` · Erro `#EF4444` · Info `#3B82F6`

## Tipografia

- **UI:** Inter / system UI
- **Pesos:** 400 body · 500 labels · 600 títulos · 700 logo
- **Tracking:** levemente negativo em títulos (`tracking-tight`)

## Logo

### Arquivos

| Arquivo | Uso |
|---------|-----|
| `logo-mark.svg` | Ícone / app / avatar de marca |
| `logo-mark-mono.svg` | Monocromático (currentColor) |
| `logo-full.svg` | Lockup claro |
| `logo-full-white.svg` | Lockup em fundo escuro |
| `favicon.svg` | Favicon |
| `icon-192.svg` / `icon-512.svg` | PWA |

Caminho no app: `/brand/*` e raiz de `public/`.

### Regras de uso

1. Área de respiro mínima = 1/4 da altura do mark ao redor.
2. Não distorcer, não recolorir o gradiente oficial.
3. Em fundos claros: logo full escuro ou mark colorido.
4. Em fundos escuros: logo full white ou mark colorido.
5. Tamanho mínimo do mark: 24px (tela) / 12mm (impressão).
6. Preferir SVG; PNG/JPG só para mockups.

### Simbolismo

- **Curvas em fluxo** → conversas omnichannel
- **Nós conectados** → canais e contatos
- **Spark ciano** → inteligência artificial
- **Cantos arredondados** → acessibilidade e modernidade

## Componentes de UI

- Raio padrão: `rounded-xl` / `rounded-2xl` em cards
- Botão primário: brand-600, texto branco, hover brand-700
- Cards: borda slate-200, sombra soft
- Sidebar: slate-950 com texto slate-100
- Badge AI: fundo brand-50 + texto brand-700 (claro) ou brand-500/15 (escuro)

## Tom de voz

**Faça:** “Como posso ajudar a fechar essa venda?”  
**Evite:** “Nossa IA revolucionária multi-agentic pipeline…”

## White-label

A arquitetura permite trocar:

- Nome da plataforma  
- Logomarca  
- Cor primária (`tenant.primaryColor`)  
- Favicon e domínio  

A marca **NexaFlow AI** é o padrão do produto; clientes Enterprise podem sobrescrever.

## Previews gerados

- `brand/logo-icon-preview.jpg` — conceito de app icon  
- `brand/logo-lockup-preview.jpg` — mockup horizontal  
- `brand/logo-dark-preview.jpg` — hero dark mode  

Os SVGs em `apps/web/public/brand/` são a **fonte oficial de produção**.
