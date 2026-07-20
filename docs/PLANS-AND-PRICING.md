# NexaFlow AI — Planos e preços

**Data:** 2026-07-15 (atualizado)  
**Fonte de verdade em runtime:** tabela `Plan` no PostgreSQL (API).  
**Catálogo seed/reset:** `packages/db/src/official-plans.ts` (upsert idempotente por `slug`).  
**Contrato por empresa:** `Subscription.priceMonthly` (não sobrescrito ao mudar catálogo).

---

## Planos oficiais

| Slug | Nome | Mensal | Anual (−15%) | Status |
|------|------|--------|--------------|--------|
| `starter` | Inicial | R$ 99 | R$ 1.009,80 | Ativo |
| `pro` | Profissional | R$ 299 | R$ 3.049,80 | Ativo · **Mais popular** |
| `business` | Empresa | R$ 699 | R$ 7.129,80 | Ativo |
| `enterprise` | Enterprise | Sob consulta | — | Ativo |
| `free` | Gratuito | R$ 0 | — | **Inativo** (legado) |

Enterprise: referência comercial interna a partir de R$ 1.490/mês (`features.listFromPriceMonthly`) — não exibido como preço fixo.

---

## Limites principais

| | Inicial | Profissional | Empresa | Enterprise* |
|--|---------|--------------|---------|--------------|
| Usuários | 2 | 5 | 15 | personalizado |
| WhatsApp | 1 | 1 | 1** | 1** |
| Agentes IA | 1 | 3 | 10 | personalizado |
| Contatos | 2.000 | 10.000 | 50.000 | personalizado |
| Fluxos ativos | 5 | 25 | 100 | personalizado |
| Créditos IA/mês | 1.000 | 5.000 | 20.000 | personalizado |
| Campanhas | não | sim | sim | sim |
| Relatórios avançados | não | sim | sim | sim |

\* limites configuráveis pelo Superadmin  
\** arquitetura atual: 1 conexão WhatsApp por empresa (múltiplos canais = evolução futura)

---

## Preço contratado vs catálogo

- **Catálogo** (`Plan.priceMonthly` / `priceAnnual`): preço oficial de lista.
- **Contrato** (`Subscription.priceMonthly`): valor acordado com a empresa (fundador, desconto).
- Alterar o plano no catálogo **não** muda o preço contratado de assinaturas existentes, salvo alteração explícita (`updateContractedPrice: true` no upgrade/downgrade manual).

---

## Cobrança

- **Manual** no lançamento (sem gateway).
- Superadmin atribui plano, status e valor via Administração.
- Preparado para provider futuro: `Subscription.provider` (`manual` | `stripe` | …).

## Trial

- Campo `Subscription.trialEndsAt` + `billingStatus=TRIAL`.
- Superadmin configura por empresa (sem trial global automático no seed).

## Anual

- Desconto comercial padrão: **15%** (`mensal × 12 × 0,85`).
- Persistido em `priceAnnual` no catálogo e no contrato quando aplicável.
