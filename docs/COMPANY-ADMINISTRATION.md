# Administração de empresas (Superadmin)

Ver também: `docs/COMPANY-ADMIN-MANAGEMENT.md`, `docs/SUBSCRIPTION-LIFECYCLE.md`.

## Rotas

- Lista: `/admin/companies`
- Detalhe: `/admin/tenants/:id`

## Ações (estado-aware)

Gerenciar · Editar · Alterar plano · Alterar vencimento · Registrar pagamento · Bloquear · Desbloquear · Suspender · Reativar · Cancelar assinatura · Solicitar exclusão (zona de perigo).

## Regras

- Bloquear / suspender **não apagam** dados.
- Cancelar assinatura ≠ excluir empresa.
- Exclusão: confirmação por nome → `PENDING_DELETION` (sem hard delete automático).
- Nunca excluir por atraso de pagamento.
- Só SUPERADMIN global (não ADMIN de tenant).
