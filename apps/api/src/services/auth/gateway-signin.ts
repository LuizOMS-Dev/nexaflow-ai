import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { env } from "../../lib/env";
import { hashPassword, verifyPassword, validatePasswordPolicy, hashOpaqueToken } from "../security/password";
import {
  checkLoginAllowed,
  recordLoginFailure,
} from "../security/login-rate-limit";
import { recordLoginAttempt, recordSecurityEvent } from "../security/security-event";
import { isTrueSuperadmin } from "../security/rbac";
import {
  createMfaChallenge,
  getValidMfaChallenge,
  consumeMfaChallengeSuccess,
  registerMfaFailure,
  verifyTotpCode,
  consumeBackupCode,
  loadTotpSecret,
} from "../security/mfa";
import { sendMail, appPublicUrl } from "../security/mail";
import { revokeAllUserSessions } from "../security/session";
import { audit } from "../audit";
import { randomBytes } from "crypto";
import { clientMeta, issueSession } from "./issue-session";

export function gatewayPublicState() {
  return {
    maintenance: env.authLoginMaintenance,
    product: "NexaFlow",
    message: env.authLoginMaintenance
      ? "Estamos atualizando o acesso à plataforma. Volte em instantes."
      : null,
  };
}

async function loadUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true },
        include: { tenant: { include: { plan: true } } },
      },
    },
  });
}

export async function gatewaySignIn(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  input: { email: string; password: string; tenantSlug?: string }
) {
  const email = input.email.toLowerCase().trim();
  const { ip, userAgent } = clientMeta(request);

  const allowed = await checkLoginAllowed(email, ip);
  if (!allowed.ok) {
    reply.header("Retry-After", String(allowed.retryAfterSec));
    throw new AppError("Muitas tentativas. Aguarde e tente novamente.", 429, "AUTH_RATE_LIMITED");
  }

  const user = await loadUserByEmail(email);

  const fail = async (reason: string) => {
    await recordLoginFailure(email, ip);
    await recordLoginAttempt({
      email,
      userId: user?.id,
      ip,
      userAgent,
      success: false,
      reason,
    });
    await recordSecurityEvent({
      type: "LOGIN_FAILED",
      userId: user?.id,
      ip,
      userAgent,
      metadata: { reason, email },
    });
    throw new AppError("E-mail ou senha inválidos.", 401, "AUTH_INVALID_CREDENTIALS");
  };

  if (!user || !user.isActive || user.status === "SUSPENDED" || user.status === "DISABLED") {
    await fail("user_invalid");
    return;
  }

  const verified = await verifyPassword(user.passwordHash, input.password);
  if (!verified.ok) {
    await fail("bad_password");
    return;
  }
  if (verified.needsRehash) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() },
    });
  }

  let membership = isTrueSuperadmin(user) ? null : user.memberships[0] || null;
  if (input.tenantSlug && !isTrueSuperadmin(user)) {
    membership = user.memberships.find((m) => m.tenant.slug === input.tenantSlug) || membership;
  }
  if (!membership && !isTrueSuperadmin(user)) {
    await fail("no_tenant");
    return;
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challenge = await createMfaChallenge({
      userId: user.id,
      tenantId: membership?.tenantId || null,
      ip,
    });
    await recordSecurityEvent({
      type: "MFA_CHALLENGE_ISSUED",
      userId: user.id,
      tenantId: membership?.tenantId,
      ip,
      userAgent,
    });
    return {
      status: "challenge" as const,
      challengeId: challenge,
      message: "Confirme o código do autenticador.",
    };
  }

  return issueSession(app, reply, {
    user,
    membership,
    ip,
    userAgent,
    email,
  });
}

export async function gatewayVerifyChallenge(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  input: { challengeId: string; code: string }
) {
  const { ip, userAgent } = clientMeta(request);
  const challengeRow = await getValidMfaChallenge(input.challengeId);
  const user = await prisma.user.findUnique({
    where: { id: challengeRow.userId },
    include: {
      memberships: {
        where: { isActive: true },
        include: { tenant: { include: { plan: true } } },
      },
    },
  });
  if (!user) throw new AppError("Desafio inválido.", 400, "AUTH_CHALLENGE_INVALID");

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError("MFA não está ativo nesta conta.", 400, "MFA_NOT_ENABLED");
  }
  const secret = loadTotpSecret(user.twoFactorSecret);
  if (!secret) throw new AppError("MFA corrompido. Reconfigure o autenticador.", 400, "MFA_CORRUPT");

  let ok = false;
  let totpStep: number | null = null;
  const totp = verifyTotpCode(secret, input.code, user.lastTotpStep);
  if (totp.ok) {
    ok = true;
    totpStep = totp.step;
  } else {
    const backup = consumeBackupCode(user.twoFactorBackupCodes, input.code);
    if (backup.ok) {
      ok = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorBackupCodes: backup.remainingJson },
      });
    }
  }
  if (!ok) {
    await registerMfaFailure(challengeRow.id);
    throw new AppError("Código inválido.", 401, "AUTH_CHALLENGE_DENIED");
  }

  await consumeMfaChallengeSuccess(challengeRow.id);
  if (totpStep != null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastTotpStep: totpStep },
    });
  }

  const membership = isTrueSuperadmin(user) ? null : user.memberships[0] || null;
  return issueSession(app, reply, {
    user,
    membership,
    ip,
    userAgent,
    email: user.email,
    reason: "mfa",
  });
}

export async function gatewayRecover(request: FastifyRequest, emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.isActive && user.status === "ACTIVE") {
    const raw = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(raw),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        ip: request.ip,
      },
    });
    const link = `${appPublicUrl()}/login?reset=${encodeURIComponent(raw)}`;
    await sendMail({
      to: email,
      subject: "Redefinição de senha — NexaFlow",
      text: `Use este link (30 minutos):\n${link}\n\nSe não foi você, ignore.`,
      tags: ["password-reset"],
    });
    await recordSecurityEvent({
      type: "PASSWORD_RESET_REQUESTED",
      userId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }
  return {
    ok: true,
    message: "Se existir uma conta neste e-mail, enviaremos as instruções.",
  };
}

export async function gatewayRecoverConfirm(request: FastifyRequest, token: string, password: string) {
  const policy = validatePasswordPolicy(password);
  if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");
  const tokenHash = hashOpaqueToken(token);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new AppError("Link inválido ou expirado.", 400, "RESET_INVALID");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  await revokeAllUserSessions(row.userId, "password_reset");
  await recordSecurityEvent({
    type: "PASSWORD_RESET_COMPLETED",
    userId: row.userId,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  });
  await audit({
    userId: row.userId,
    action: "auth.password_reset",
    ip: request.ip,
  });
  return { ok: true, message: "Senha atualizada. Entre com a nova senha." };
}

export async function gatewayAcceptInvite(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  input: { token: string; password: string; name?: string }
) {
  const policy = validatePasswordPolicy(input.password);
  if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");
  const tokenHash = hashOpaqueToken(input.token);
  const invite = await prisma.userInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new AppError("Convite inválido ou expirado.", 400, "INVITE_INVALID");
  }
  const email = invite.email.toLowerCase();
  let user = await loadUserByEmail(email);
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: input.name || invite.name || email.split("@")[0],
        passwordHash: await hashPassword(input.password),
        memberships: { create: { tenantId: invite.tenantId, role: invite.role, isActive: true } },
      },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: { include: { plan: true } } },
        },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name || user.name || invite.name,
        passwordHash: await hashPassword(input.password),
        passwordChangedAt: new Date(),
      },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
      update: { role: invite.role, isActive: true },
      create: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
    });
    user = await loadUserByEmail(email);
  }
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });
  if (!user) throw new AppError("Não foi possível ativar o convite.", 500);
  await revokeAllUserSessions(user.id, "invite_accepted");
  const membership = user.memberships.find((m) => m.tenantId === invite.tenantId) || user.memberships[0];
  const { ip, userAgent } = clientMeta(request);
  return issueSession(app, reply, {
    user,
    membership,
    ip,
    userAgent,
    email: user.email,
    reason: "invite",
  });
}
