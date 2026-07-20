# Access Gate NexaFlow

Fonte única de decisão de acesso: `apps/api/src/services/access-gate.ts`.

## Camadas (separadas)

| Camada | Campo | Exemplos |
|--------|--------|----------|
| Usuário | `User.status` | ACTIVE, SUSPENDED, DISABLED (bloqueado) |
| Empresa operacional | `Tenant.status` | ACTIVE, BLOCKED, SUSPENDED, CANCELLED, PENDING_DELETION |
| Financeiro | derivado de `Subscription` + `currentPeriodEnd` + política | CURRENT, GRACE_PERIOD, OVERDUE, SUSPENDED_FOR_NONPAYMENT, CANCELED |

## Precedência

1. Usuário bloqueado/suspenso/inativo  
2. Empresa BLOCKED / PENDING_DELETION  
3. Empresa SUSPENDED / CANCELLED (restrito para admins)  
4. Inadimplência após tolerância  
5. Grace / overdue com aviso  
6. Acesso total  

## Política global

`PlatformSetting` key `nexaflow.access.policy`:

- `graceDays` (default 7)
- `autoSuspendNonpayment` (default true)
- `companySuspendMode` LIMITED | TOTAL

Superadmin: `GET/PUT /admin/access-policy`

## Superfícies

| Superfície | Comportamento |
|------------|----------------|
| JWT / `authenticate` | Access Gate em toda request |
| Frontend | `/auth/access-state` + `AccessGateShell` |
| API keys | `assertTenantCanUsePublicApi` |
| Webhooks | skip se paused |
| Automações | skip se paused |
| Campanhas | 403 se paused |
| IA AUTO WhatsApp | skip se paused |
| Impersonation | permitida em qualquer status; `operationalPaused` |

## Reativação

- Pagamento registrado → `billingStatus=ACTIVE` + `recomputeTenantFinancialAccess`
- Não reativa `Tenant.status` BLOCKED/SUSPENDED operacional sozinho
