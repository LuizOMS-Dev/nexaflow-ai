import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { env } from "../../lib/env";
import type { JwtUser } from "../../plugins/auth";

/** Janela padrão de autenticação recente (15 min) */
export const STEP_UP_WINDOW_MS = 15 * 60 * 1000;
/**
 * Superadmin: 60 min após login/MFA/step-up.
 * Antes era 10 min e bloqueava impersonação no uso normal do painel.
 */
export const SUPERADMIN_STEP_UP_MS = 60 * 60 * 1000;

/**
 * Exige autenticação recente (login/MFA/step-up) para ações sensíveis.
 */
export async function requireRecentAuthentication(
  user: JwtUser,
  opts?: { maxAgeMs?: number; action?: string }
) {
  const maxAge =
    opts?.maxAgeMs ??
    (user.platformRole === "SUPERADMIN" ? SUPERADMIN_STEP_UP_MS : STEP_UP_WINDOW_MS);

  const row = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { lastStrongAuthAt: true, lastLoginAt: true, twoFactorEnabled: true },
  });

  const ts = row?.lastStrongAuthAt || row?.lastLoginAt;
  if (!ts || Date.now() - ts.getTime() > maxAge) {
    throw new AppError(
      "Confirme sua identidade novamente (autenticação recente necessária).",
      403,
      "STEP_UP_REQUIRED"
    );
  }
}

export async function markStrongAuth(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastStrongAuthAt: new Date() },
  });
}

/** Superadmin sem MFA não acessa painel admin completo (quando a política exige MFA). */
export async function requireSuperadminMfa(user: JwtUser) {
  if (user.platformRole !== "SUPERADMIN") return;
  if (!env.superadminMfaRequired) return;
  const row = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { twoFactorEnabled: true },
  });
  if (!row?.twoFactorEnabled) {
    throw new AppError(
      "Autenticação em duas etapas obrigatória para acesso administrativo à plataforma.",
      403,
      "MFA_REQUIRED_SUPERADMIN"
    );
  }
}

export async function getSecurityFlags(userId: string, platformRole?: string | null) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  const mfaEnabled = Boolean(row?.twoFactorEnabled);
  const isSuper = platformRole === "SUPERADMIN";
  /** Em dev (ou SUPERADMIN_MFA_REQUIRED=0) não bloqueia admin sem MFA */
  const enforce = env.superadminMfaRequired;
  const blocked = isSuper && enforce && !mfaEnabled;
  return {
    mfaEnabled,
    /** Superadmin ainda no bootstrap: pode usar o app, mas /admin fica bloqueado */
    mfaRequiredForAdmin: blocked,
    mfaBootstrap: blocked,
    /** Política atual: se false, UI/API liberam /admin sem 2FA */
    mfaPolicyRequired: isSuper ? enforce : false,
  };
}
