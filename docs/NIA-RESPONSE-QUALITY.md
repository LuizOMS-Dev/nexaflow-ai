# NIA — Qualidade, profundidade adaptativa e CTAs

**Data:** 2026-07-17  
**Veredito:** `NIA_RESPONSE_QUALITY_STAGING_READY`

## Princípio

> Responder **melhor** — não mais, nem menos.  
> Menor volume de texto que **resolve completamente** a necessidade **atual**.

## Profundidade

| Depth | Uso | CTA típico |
|-------|-----|------------|
| simple | oi, meta-ajuda | nenhum |
| explanation | como funciona X | módulo se agregar |
| comparison | diferença entre modos | Agentes |
| procedure | como faço/crio | módulo alvo |
| diagnostic | não funciona | causa real |
| follow_up | e depois? | contexto |

## CTAs

1. Intenção da **pergunta** > página atual  
2. Allowlist RBAC/entitlement (`ALLOWED_NAV`)  
3. `filterActionsByIntent` remove CTA errado (ex.: Segurança em pergunta de Agentes)  
4. `ensureContextualCta` / `suggestContextualCta` — se a orientação não trouxe ACTIONS, sugere **1** CTA allowlisted (como/configurar/corrigir)  
5. Sem links Markdown `/app` no texto — só botões estruturados  
6. Finding de conta só vira CTA se a pergunta for diagnóstica  
7. Sem CTA em oi / obrigado / “como você pode me ajudar?”  

## Consulta de conta (já existente)

`buildSecureAccountDiagnostic` / probes (WhatsApp, agentes, knowledge, inbox, billing, Access Gate) — **sem** acesso irrestrito ao banco. Dados mascarados e redigidos.

## Markdown

UI: `NiaMarkdown` — negrito, listas, links externos seguros. Internos viram texto.

## Scroll “Novas mensagens”

Threshold 140px; só aparece se não estiver perto do fim; clique faz scroll suave e oculta.

## Testes

```bash
npx vitest run apps/api/src/services/nexaflow-assistant/nia-response-quality.test.ts
```

## STATUS

`NIA_RESPONSE_QUALITY_STAGING_READY` — validar ao vivo: Agentes, meta-ajuda, senha, WA, scroll.
