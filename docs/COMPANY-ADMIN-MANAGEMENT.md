# Gestão profissional de Empresas (Superadmin)

Área: **Administração → Empresas** (`/admin/companies` + detalhe `/admin/tenants/:id`).

## PRESERVADO

- Página `/admin/companies` (não duplicada)
- Detalhe `/admin/tenants/:id` com abas
- Criação de empresa, impersonação, troca de plano com validação de downgrade
- Soft-delete (sem cascata física)
- Rotas protegidas por `requireSuperadmin` + MFA superadmin
- Preço contratado `Subscription.priceMonthly` (fundador)

## CORRIGIDO

- Listagem usava apenas `recentTenants` (5 itens) — agora `GET /admin/tenants` completo
- DELETE soft passa a `PENDING_DELETION` (padrão) em vez de só arquivar como CANCELLED
- Mensagens de login para empresa bloqueada/suspensa (sem detalhes internos)

## REFINADO

- Status operacional ≠ status financeiro
- Labels amigáveis (ex.: PAST_DUE → “Pagamento atrasado” via snapshot)
- Alertas na Visão Geral: atraso, vence em 3 dias, suspensas, bloqueadas
- Zona de perigo com confirmação por nome

## IMPLEMENTADO

### Schema

- `TenantStatus`: `BLOCKED`, `PENDING_DELETION` (além de ACTIVE/TRIAL/SUSPENDED/CANCELLED)
- `Subscription.billingDueDay` (1–31)
- `Payment` (pagamento manual)

### API

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/admin/tenants` | Lista + filtros + summary financeiro |
| GET | `/admin/tenants/:id` | Detalhe + billing + payments |
| PATCH | `/admin/tenants/:id` | Plano, preço, vencimento, block/suspend/… |
| POST | `/admin/tenants/:id/payments` | Registrar pagamento |
| GET | `/admin/tenants/:id/payments` | Histórico |
| DELETE | `/admin/tenants/:id` | Soft-delete (PENDING_DELETION) |

Ações semânticas no PATCH (`action`):

- `block` / `unblock`
- `suspend` / `reactivate`
- `cancel_subscription`
- `request_deletion` / `cancel_deletion`

### Cálculos

- **Próximo vencimento**: `currentPeriodEnd` ou `computeNextDueDate(billingDueDay)`
- **Dias em atraso**: diferença civil UTC se `nextDue < hoje`
- **Não inventa** inadimplência sem data real
- Automações de bloqueio por atraso: **desligadas** (`BILLING_AUTOMATION_RULES.autoBlockEnabled = false`)

### Auditoria (exemplos)

- `company.blocked` / `company.unblocked`
- `company.suspended` / `company.reactivated`
- `company.subscription_canceled`
- `company.payment_registered`
- `company.due_date_changed` / `company.plan_changed`
- `company.deletion_requested`

### Segurança

- Apenas SUPERADMIN (hook global das rotas admin)
- Tenant users não acessam `/admin/*`
- Bloqueio/suspensão: dados intactos; login negado com mensagem clara
- Exclusão: confirmação por nome; sem hard delete automático; sem exclusão por atraso
