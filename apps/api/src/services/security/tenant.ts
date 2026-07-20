import { AppError } from "../../lib/errors";

/**
 * Isolamento multi-tenant: o tenant da sessão prevalece.
 * Nunca confiar em tenantId do body/query do cliente.
 *
 * Superadmin fora de impersonação pode operar cross-tenant em rotas admin.
 * Em impersonação (`imp: true`), o escopo do tenant é obrigatório.
 */
export function sessionTenantId(user: {
  tenantId?: string | null;
  platformRole?: string | null;
}): string | null {
  return user.tenantId || null;
}

export function requireSessionTenantId(user: {
  tenantId?: string | null;
  platformRole?: string | null;
  imp?: boolean;
}): string {
  const id = sessionTenantId(user);
  if (!id) {
    if (user.platformRole === "SUPERADMIN" && !user.imp) {
      throw new AppError("Selecione uma empresa (tenant) para esta operação", 400, "TENANT_REQUIRED");
    }
    throw new AppError("Empresa não selecionada", 400, "TENANT_REQUIRED");
  }
  return id;
}

/** Garante que o recurso pertence ao tenant da sessão */
export function assertTenantScope(
  user: { tenantId?: string | null; platformRole?: string | null; imp?: boolean },
  resourceTenantId: string | null | undefined
) {
  // Superadmin só ignora tenant se NÃO estiver impersonando
  if (user.platformRole === "SUPERADMIN" && !user.imp) return;
  const tid = requireSessionTenantId(user);
  if (!resourceTenantId || resourceTenantId !== tid) {
    throw new AppError("Recurso não encontrado", 404, "NOT_FOUND");
  }
}
