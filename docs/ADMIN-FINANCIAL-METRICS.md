# Métricas financeiras do Superadmin

## Fonte de verdade

| Conceito | Fonte |
|----------|--------|
| Preço de lista (catálogo) | `Plan.priceMonthly` / `priceAnnual` / `priceOnRequest` |
| Preço contratado | `Subscription.priceMonthly` |
| Status operacional da empresa | `Tenant.status` |
| Status financeiro da assinatura | `Subscription.billingStatus` + vencimento |

Catálogo oficial (seed/reset): `packages/db/src/official-plans.ts` → upsert no banco.  
**Runtime:** sempre ler do banco via API. Nunca hardcodar preços no dashboard.

## MRR estimado

Soma de valores mensais das **empresas ACTIVE** com assinatura elegível:

1. Preferir `Subscription.priceMonthly` (contratado).
2. Se ausente, usar catálogo do plano (exceto free / sob consulta sem valor).
3. **Não** inclui: trial operacional, free, canceladas, suspensas, bloqueadas, exclusão, Enterprise sem preço contratado.
4. `PAST_DUE` com valor contratado **entra** (assinatura devida).

**Não é** caixa / pagamento liquidado.

## ARR estimado

`MRR estimado × 12`

Sempre rotular **ARR estimado**.

## Ticket médio

`MRR estimado ÷ assinaturas pagas`  
Se zero assinaturas: `R$ 0,00`.

## Receita por plano

Lista planos do **banco** (mesma fonte de Admin → Planos):

- Nome, empresas no MRR, preço de catálogo (ou “Sob consulta”), MRR gerado (contratado).
- Gratuito inativo sem empresas: oculto.
- Enterprise: **Sob consulta**, nunca R$ 0,00/mês na UI.

## Lucro

Sem custos cadastrados: **Lucro indisponível**.  
Não inventar margem.

## Alteração de preço de catálogo

`PATCH /admin/plans/:id` atualiza `Plan` e **não** atualiza `Subscription.priceMonthly` existentes.
