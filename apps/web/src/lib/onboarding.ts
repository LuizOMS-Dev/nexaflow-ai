import type { TenantInfo } from "@/store/auth";

/**
 * Wizard de 1ª configuração da empresa.
 * Não exibir quando:
 * - onboarding já concluído, ou
 * - empresa provisionada pelo Superadmin (já tem nome/perfil definidos no admin).
 */
export function needsCompanyOnboarding(tenant: TenantInfo | null | undefined): boolean {
  if (!tenant) return false;
  if (tenant.onboardingCompleted === true) return false;
  const s = (tenant.settings || {}) as {
    onboardingCompleted?: boolean;
    adminProvisioned?: boolean;
  };
  if (s.onboardingCompleted === true) return false;
  if (s.adminProvisioned === true) return false;
  return true;
}
