# Correção: Footer branco dos modais + Performance

**Data:** 2026-07-15

## BUG FOOTER BRANCO

### CAUSA RAIZ
No primitive global `Modal` (`ui.tsx`), o footer usava:

```txt
bg-[#F8F9FB]/95 backdrop-blur-md
dark:bg-[#0e1117]/94
```

Problemas combinados:

1. **Fundo claro base** `#F8F9FB` (quase branco) como default.
2. **Opacidade em cor hex arbitrária no Tailwind** (`dark:bg-[#hex]/94`) — em builds Tailwind, o modificador de alpha em hex arbitrário pode **não ser gerado**, deixando o fundo claro vencer no dark.
3. **`backdrop-blur-md` no footer** — com fundo semi-transparente, o blur compunha visual “lavado/branco” sobre o painel ou o backdrop.

Não era portal fora do theme: o `html.dark` funciona; o CSS do footer é que falhava.

### CORREÇÃO
- Footer com **cores sólidas** (sem alpha no Tailwind class):
  - light: `#F4F5F7`
  - dark: `#12151c` (surface do modal)
- **Removido `backdrop-blur` do footer**
- CSS global defensivo em `globals.css`:

```css
.nf-dialog-footer { background-color: #f4f5f7 !important; backdrop-filter: none !important; }
.dark .nf-dialog-footer, html.dark .nf-dialog-footer { background-color: #12151c !important; }
```

- Header: removido gradient branco forçado que competia com o dark.

### COMPONENTE CORRIGIDO
- `apps/web/src/components/ui.tsx` → `Modal` footer
- `apps/web/src/app/globals.css` → `.nf-dialog-footer`

### MODAIS TESTADOS (usam o mesmo primitive)
Todos os `<Modal>` da plataforma herdam o footer (portal único):
- Editar plano, Nova empresa, Pagamento, Danger/Confirm, MFA, Inbox, CRM, Contatos, Agentes, Fluxos, Conhecimento, Auditoria, etc.

Não existe Drawer/SheetFooter separado — só `Modal` + `DialogFooter`.

---

## PERFORMANCE

### MEDIÇÃO ANTES (local Docker, idle)
| Métrica | Valor |
|---------|-------|
| `GET /health` API | ~188 ms |
| `GET /` web | ~60 ms |
| `GET /login` web | ~24 ms |
| Docker CPU (idle) | ~0–0.3% por container |
| Docker RAM web | ~49 MiB |
| Docker RAM api | ~58 MiB |

*Nota: latência HTTP estática ok; lentidão reportada é de UI (polling + GPU blur + re-renders/refetch), não de CPU/RAM saturar o host em idle.*

### CAUSA PRINCIPAL
**Polling agressivo no frontend** em paralelo com WebSocket (trabalho duplicado):

| Fonte | Antes | Depois |
|-------|-------|--------|
| Inbox lista conversas | 20 s | **45 s** |
| Inbox mensagens da conversa | 12 s | **30 s** |
| Notificações (fechado) | 45 s | **90 s** |
| Notificações (aberto) | 15 s | **30 s** |
| WhatsApp status banner | 30 s | **60 s** |
| MFA status (shell) | refetch on focus | **off**, stale 60 s |

### CAUSAS SECUNDÁRIAS

**FRONTEND**
- `backdrop-filter: blur(6px)` no modal backdrop (custo de GPU, sobretudo Windows/Docker)
- Auditoria: `take: 200` de uma vez sem paginação

**BACKEND**
- Logs: `findMany` com take 200 fixo (melhorado: default 50 + cursor)

**BANCO**
- Sem saturação medida em idle; paginação de audit reduz carga em picos

**NETWORK**
- Requests repetidos de polling (inbox + notif + WA)

**DOCKER/DEV**
- Host idle saudável; Next em production build no Docker (não confunde com `next dev` lento)
- Rebuild/restart + cache de chunks do browser pode parecer “travamento” (Ctrl+F5)

### CORREÇÕES APLICADAS
1. Footer dark sólido (ver acima)
2. Backdrop modal: blur 6px → **2px**
3. Polling reduzido (inbox, notificações, WhatsApp, MFA focus)
4. Auditoria: API paginada (`take` + `cursor`) + UI “Carregar mais”
5. WS: dependência de effect limpa (sem rebind por identidade instável de `qc`)

### MEDIÇÃO DEPOIS
| Métrica | Valor |
|---------|-------|
| `GET /health` | ~mesmo (~100–200 ms local) |
| Build web | sucesso (production) |
| Polling inbox lista | 45 s (era 20 s) → **~55% menos requests** |
| Polling notif fechado | 90 s (era 45 s) → **50% menos** |
| Payload auditoria inicial | 50 eventos (era até 200) |

### PENDÊNCIAS (não bloqueantes)
- Virtualização de listas longas (contatos/empresas) se crescerem muito
- Inbox: desligar polling de mensagens quando WS `readyState === OPEN` (refino)
- DevTools Performance com sessão autenticada + MFA (não automatizado aqui)

### NÃO FEITO (conforme regra)
- Não removeu MFA, realtime, animações de marca, funcionalidades
- Não “memoizou tudo”
- Não criou índices aleatórios no Postgres
