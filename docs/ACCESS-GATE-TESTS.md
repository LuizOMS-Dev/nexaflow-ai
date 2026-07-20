# Access Gate — testes

## Unitários

`apps/api/src/services/access-gate.test.ts`

- CURRENT / GRACE / SUSPENDED_FOR_NONPAYMENT
- autoSuspend off → OVERDUE
- paths restricted vs blocked

## Manual / staging

1. Suspender usuário → login ou request → USER_SUSPENDED  
2. Bloquear usuário (DISABLED) → USER_BLOCKED  
3. Suspender empresa → admin RESTRICTED / user BLOCKED  
4. Bloquear empresa → COMPANY_BLOCKED; API/webhooks/automations/AI auto param  
5. Atrasar `currentPeriodEnd` + grace → banner  
6. Atraso > grace + autoSuspend → PAYMENT_SUSPENDED  
7. Registrar pagamento → financeiro CURRENT (empresa operacional intacta)  
8. Impersonar empresa bloqueada → shell restrito + banner suporte  

## Matriz resumida

| User | Company | Finance | Resultado |
|------|---------|---------|-----------|
| BLOCKED | * | * | BLOCKED |
| ACTIVE | BLOCKED | * | BLOCKED (imp: RESTRICTED) |
| ACTIVE | ACTIVE | GRACE | WARNING + banner |
| ACTIVE | ACTIVE | NONPAY SUSPEND | RESTRICTED/BLOCKED |
| ACTIVE | ACTIVE | CURRENT | FULL |
