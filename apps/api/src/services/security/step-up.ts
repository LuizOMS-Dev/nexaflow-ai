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

/**
 * Verifica se uma conta de superadmin possui isenção específica de MFA para testes/desenvolvimento.
 * Libera a conta do superadmin "Luiz Otávio", mantendo a exigência normal para as demais contas.
 */
export function isSuperadminMfaExempt(user?: {
  name?: string | null;
  email?: string | null;
  id?: string;
}): boolean {
  if (!user) return false;
  const nameNorm = (user.name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const emailNorm = (user.email || "").toLowerCase();

  // Conta de teste "Luiz Otávio" / "Luiz Otavio" ou e-mail com "luiz"
  if (nameNorm.includes("luiz otavio") || nameNorm.includes("luiz otavio medeiros")) {
    return true;
  }
  if (emailNorm.includes("luiz") || emailNorm.startsWith("luiz")) {
    return true;
  }
  return false;
}

/** Superadmin sem MFA não acessa painel admin completo (quando a política exige MFA). */
export async function requireSuperadminMfa(user: JwtUser) {
  if (user.platformRole !== "SUPERADMIN") return;
  if (isSuperadminMfaExempt(user)) return;
  if (!env.superadminMfaRequired) return;

  const row = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { twoFactorEnabled: true, name: true, email: true },
  });
  if (isSuperadminMfaExempt({ name: row?.name, email: row?.email, id: user.sub })) return;

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
    select: { twoFactorEnabled: true, name: true, email: true },
  });
  const mfaEnabled = Boolean(row?.twoFactorEnabled);
  const isSuper = platformRole === "SUPERADMIN";
  const isExempt = isSuper && isSuperadminMfaExempt({ name: row?.name, email: row?.email, id: userId });

  /** Em produção: enforce = env.superadminMfaRequired para demais superadmins; isento para Luiz Otávio */
  const enforce = env.superadminMfaRequired && !isExempt;
  const blocked = isSuper && enforce && !mfaEnabled;
  return {
    mfaEnabled,
    /** Superadmin ainda no bootstrap: pode usar o app, mas /admin fica bloqueado */
    mfaRequiredForAdmin: blocked,
    mfaBootstrap: blocked,
    /** Política atual: se false, UI/API liberam /admin sem 2FA */
    mfaPolicyRequired: isSuper && !isExempt ? env.superadminMfaRequired : false,
    mfaExempt: isExempt,
  };
}
