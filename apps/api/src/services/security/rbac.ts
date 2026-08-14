/**
 * RBAC helpers — superadmin real vs impersonação.
 * Em impersonação, platformRole no JWT NÃO deve conceder privilégio de plataforma.
 */
export type RbacUserLike = {
  platformRole?: string | null;
  role?: string | null;
  imp?: boolean;
};

/** Superadmin de plataforma efetivo (nunca true sob impersonação). */
export function isTrueSuperadmin(user: RbacUserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.imp) return false;
  return user.platformRole === "SUPERADMIN";
}

/** Role efetiva de membership para decisões no tenant (ignora bypass de plataforma se imp). */
export function effectiveMemberRole(user: RbacUserLike | null | undefined): string | null {
  if (!user) return null;
  return user.role || null;
}

/** platformRole seguro para RBAC (null sob impersonação). */
export function effectivePlatformRole(
  user: RbacUserLike | null | undefined
): string | null {
  if (!user || user.imp) return null;
  return user.platformRole || null;
}
