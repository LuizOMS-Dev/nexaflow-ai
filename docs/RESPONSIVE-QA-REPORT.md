# NexaFlow AI — Relatório de Homologação Visual e Responsiva

**Data:** 2026-07-15  
**Fase:** QA final de UI/UX (sem redesign)  
**Stack sob teste:** Docker `localhost:3000` + API healthy  

---

## STATUS UI/UX

**UI_UX_RESPONSIVE_READY**

Com ressalva explícita:

```
NOT_TESTED_ON_PHYSICAL_DEVICE
```

Navegador automatizado: **Chromium (Playwright)** apenas.

---

## Método de teste

| Método | Escopo |
|--------|--------|
| Playwright headless | 11 viewports × 8 rotas = **88 combinações** |
| Screenshots | 1920×1080, 1366×768, 390×844 (+ zoom 125%) |
| Análise estática de CSS/JS | inbox, shell, modais, toasts, funil, settings |
| Correções de causa raiz | apenas bugs reais |
| Device físico Android/iPhone | **não testado neste ambiente** |
| Edge / Safari / Firefox | **não testados** nesta rodada |

Script: `scripts/responsive-qa.mjs`  
Raw: `docs/responsive-qa-raw.json`  
Shots: `docs/qa-screenshots/`

---

## Resoluções testadas (automatizado)

| Resolução | Status |
|-----------|--------|
| 1920×1080 | OK |
| 1600×900 | OK |
| 1440×900 | OK |
| 1366×768 | OK |
| 1280×720 | OK |
| 1024×768 | OK |
| 768×1024 (tablet) | OK |
| 430×932 | OK |
| 412×915 | *(matriz cobre 430/390/360)* |
| 390×844 | OK |
| 375×812 | OK |
| 360×800 | OK |

**Zoom:** 125% em 1366×768 → sem overflow horizontal global.

---

## Rotas exercitadas

| Rota | Papel |
|------|--------|
| `/admin` | SUPERADMIN + gate MFA |
| `/admin/companies` | Admin |
| `/admin/users` | Admin |
| `/admin/finance` | Admin |
| `/admin/plans` | Admin |
| `/admin/audit` | Admin |
| `/app/account` | Minha Conta |
| `/app/account/security` | MFA / Segurança |

Contexto do seed: **SUPERADMIN global** (sem empresa demo) → rotas tenant (`/app/inbox`, funil, etc.) validadas por **análise estática** + correção de bug mobile no inbox.

---

## Resultados automáticos

| Métrica | Valor |
|---------|------:|
| Combinações navegadas | 88 |
| Crashes de aplicação | **0** |
| Overflow horizontal global (>2px) | **0** |
| Max overflowX | **0** |
| Gate “Proteja sua conta” | **visível** (MFA pendente no superadmin) |

### Findings brutos

| Severidade | Item | Reclassificação |
|------------|------|-----------------|
| ALTO (script) | 401 Unauthorized no console no login | **Não é bug de UI** — refresh/me sem sessão antes do login (esperado) → **BAIXO / esperado** |

---

## Bugs encontrados e classificação

### CRÍTICOS

*Nenhum.*

### ALTOS

| ID | Descrição | Status |
|----|-----------|--------|
| R1 | **Conversas (mobile):** 3 colunas empilhadas + auto-select da 1ª conversa escondia a lista e esmagava o chat | **CORRIGIDO** |

### MÉDIOS

| ID | Descrição | Status |
|----|-----------|--------|
| R2 | Toast no topo-direito em telas estreitas sem safe-area | **CORRIGIDO** |
| R3 | Gate MFA com CTA menos confortável em mobile | **CORRIGIDO** (largura/padding) |
| R4 | Padding de página 1.5rem em mobile (menos área útil) | **CORRIGIDO** (1rem base; 2rem ≥1024px) |

### BAIXOS

| ID | Descrição | Status |
|----|-----------|--------|
| R5 | 401 no console pré-login | Esperado — **PRESERVADO** |
| R6 | Warnings Next `themeColor` em metadata | Não bloqueia UX — pendência P3 |
| R7 | Mojibake residual em **comentários** CSS | Não afeta UI — pendência P3 |

---

## Correções aplicadas (causa raiz)

1. **`apps/web/src/app/app/inbox/page.tsx`**
   - Mobile: lista **ou** thread (não as três colunas juntas)
   - Botão **Voltar** no thread
   - Painel de contexto oculto `< lg`
   - Auto-seleção da 1ª conversa **somente ≥1024px**

2. **`apps/web/src/app/globals.css`**
   - Toast com `safe-area-inset` e layout full-width ≤420px
   - Padding de página base 1rem (mobile)

3. **`apps/web/src/components/superadmin-mfa-gate.tsx`**
   - Tipografia/CTA adaptados a mobile sem redesenho

---

## PRESERVADO

- Identidade visual (cores, dark, brand)
- Design System (btn, card, Select portal, Modal, Dropdown)
- Sidebar expandida/recolhida + drawer mobile
- Settings com seletor de seção no mobile (`lg:hidden` Select)
- Funil com scroll horizontal contido
- MFA gate conceitual e bloqueio admin
- Z-index oficial e portals
- Sem redesign de páginas

---

## Checklist (esta rodada)

| Item | Resultado |
|------|-----------|
| 1920×1080 | OK (auto) |
| 1440×900 | OK (auto) |
| 1366×768 | OK (auto) |
| 1280×720 | OK (auto) |
| tablet | OK (auto 768×1024) |
| mobile | OK (auto 360–430) |
| zoom 125% | OK (auto 1366) |
| sidebar / shell CSS | OK (estático + rotas admin) |
| chat mobile | CORRIGIDO + estática |
| funil | PRESERVADO (estático; não exercitado com dados) |
| modais / dropdowns / selects | PRESERVADO (portal; sem regressão detectada) |
| tenant vs superadmin | OK superadmin; tenant só estático |
| impersonação | não exercitada nesta rodada |
| MFA gate | OK |
| overflow horizontal global | 0 |
| device físico | **NOT_TESTED** |
| Safari/Edge/Firefox | **NOT_TESTED** |

---

## Pendências

| # | Item | Prioridade |
|---|------|------------|
| 1 | Spot-check em **Android físico** (chat, funil, teclado virtual) | P1 ops |
| 2 | Spot-check **iPhone/Safari** se disponível | P1 ops |
| 3 | Exercitar com **usuário tenant** (inbox, funil, settings com dados) | P1 ops |
| 4 | Impersonação em 1366 e mobile | P2 |
| 5 | Edge desktop smoke | P2 |
| 6 | Warnings `themeColor` → viewport | P3 |

---

## Classificação final

| Classificação | Aplicável? |
|--------------|------------|
| UI_UX_NOT_READY | Não |
| UI_UX_DESKTOP_READY | Superado |
| **UI_UX_RESPONSIVE_READY** | **Sim** (Chromium multi-viewport + fixes) |
| UI_UX_PRODUCTION_READY | **Condicional** — sem bug crítico/alto residual no código; **falta device físico + smoke tenant real** para carimbo final de produção |

**Carimbo recomendado desta entrega:**

```
UI_UX_RESPONSIVE_READY
+ NOT_TESTED_ON_PHYSICAL_DEVICE
```

Após 1 smoke em telefone real (login → MFA ou admin → conta → uma tela tenant se existir), pode promover para:

```
UI_UX_PRODUCTION_READY
```

---

## Como reexecutar

```bash
# stack up
docker compose up -d

# homologação
node scripts/responsive-qa.mjs
```

Variáveis opcionais: `QA_BASE_URL`, `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`.
