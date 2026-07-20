# Ciclo de vida da assinatura

## Estados da **empresa** (`Tenant.status`) — operacional

| Código | UI |
|--------|-----|
| ACTIVE | Ativa |
| TRIAL | Trial |
| BLOCKED | Bloqueada (login temporário) |
| SUSPENDED | Suspensa (comercial/admin) |
| CANCELLED | Cancelada |
| PENDING_DELETION | Exclusão agendada |

## Estados da **assinatura** (`billingStatus`) — financeiro

| Código | UI (snapshot) |
|--------|---------------|
| TRIAL | Trial |
| ACTIVE | (base para “em dia”) |
| PAST_DUE | Pagamento pendente |
| SUSPENDED | Suspensa |
| CANCELLED | Cancelada |
| EXPIRED | Expirada |

**Não misturar:** uma empresa pode estar **Ativa** + **Pagamento atrasado**.

Status financeiro exibido é calculado (`computeBillingSnapshot`): Em dia / Vence hoje / Vence em breve / Atrasada / etc., com base em `currentPeriodEnd` e `billingDueDay` reais.

## Ações Superadmin

| Ação | Efeito |
|------|--------|
| Criar empresa | Plano default + `Subscription` (preço contratado, due day 10) |
| Alterar plano | Valida downgrade; preço contratado atualizado se não override |
| Alterar vencimento | `billingDueDay` + recalcula `currentPeriodEnd` |
| Registrar pagamento | `Payment` + avança próximo vencimento; **não** reativa bloqueio/suspensão sozinho |
| Bloquear | `BLOCKED` — dados intactos; login negado |
| Suspender | `SUSPENDED` — dados intactos |
| Reativar / Desbloquear | `ACTIVE` |
| Cancelar assinatura | `CANCELLED` — dados preservados |
| Solicitar exclusão | `PENDING_DELETION` — sem hard delete automático |

## Regras críticas

- **Nunca** excluir automaticamente por atraso.
- Bloquear/suspender **não apagam** dados.
- Cancelar ≠ excluir.
- Automações futuras (aviso D-3, bloqueio D+10…) **desligadas** por padrão.

## Cobrança

Manual (`Payment`). Sem gateway na v1. Ver também `docs/COMPANY-ADMIN-MANAGEMENT.md`.

## Financeiro (MRR / ARR / Ticket)

- **MRR estimado** = soma de `Subscription.priceMonthly` (ou catálogo) das empresas **ACTIVE**.
- **ARR estimado** = MRR × 12.
- **Ticket médio** = MRR ÷ assinaturas pagas.
- Não é receita liquidada / caixa.
