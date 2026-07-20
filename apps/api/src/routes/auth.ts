import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";
import { env } from "../lib/env";
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  hashOpaqueToken,
} from "../services/security/password";
import {
  checkLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "../services/security/login-rate-limit";
import {
  createAuthSession,
  rotateAuthSession,
  revokeSession,
  revokeAllUserSessions,
  ACCESS_TOKEN_SECONDS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SEC,
  getValidSessionById,
} from "../services/security/session";
import { recordLoginAttempt, recordSecurityEvent } from "../services/security/security-event";
import type { JwtUser } from "../plugins/auth";
import { randomBytes } from "crypto";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  generateBackupCodes,
  createMfaChallenge,
  getValidMfaChallenge,
  registerMfaFailure,
  consumeMfaChallengeSuccess,
  consumeBackupCode,
  secretFingerprint,
  storeTotpSecret,
  loadTotpSecret,
} from "../services/security/mfa";
import { markStrongAuth, getSecurityFlags } from "../services/security/step-up";
import { sendMail, appPublicUrl } from "../services/security/mail";
import QRCode from "qrcode";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  tenantSlug: z.string().optional(),
});

function cookieSecure() {
  return env.nodeEnv === "production";
}

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE_SEC,
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: "/" });
}

function setAccessCookie(reply: FastifyReply, token: string) {
  reply.setCookie("nexa_access", token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_SECONDS,
  });
}

function clearAccessCookie(reply: FastifyReply) {
  reply.clearCookie("nexa_access", { path: "/" });
}

function clientMeta(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers["user-agent"] || null,
  };
}

async function signAccess(
  app: FastifyInstance,
  payload: {
    sub: string;
    email: string;
    name: string;
    platformRole?: string | null;
    tenantId?: string | null;
    role?: import("@prisma/client").MemberRole | null;
    sid: string;
    imp?: boolean;
    impBy?: string | null;
  }
) {
  return app.jwt.sign({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    platformRole: payload.platformRole || null,
    tenantId: payload.tenantId || null,
    role: payload.role || null,
    sid: payload.sid,
    jti: payload.sid, // jti = session id
    imp: payload.imp || false,
    impBy: payload.impBy || null,
  });
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarType?: string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
  preferences?: unknown;
  platformRole?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    avatarType: (user.avatarType as "UPLOAD" | "INITIALS" | "NEXA_AVATAR") || "INITIALS",
    avatarPresetId: user.avatarPresetId ?? null,
    avatarColor: user.avatarColor ?? null,
    preferences: user.preferences ?? null,
    platformRole: user.platformRole,
  };
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * Sonda pública e sem dados pessoais para o frontend decidir se precisa restaurar sessão.
   * Evita 401 esperados e refresh duplicado em páginas públicas.
   */
  app.get("/auth/session-status", async (request) => {
    const refreshAvailable = Boolean(request.cookies?.[REFRESH_COOKIE]);
    try {
      await request.jwtVerify({ onlyCookie: true });
      const payload = request.user as JwtUser;
      const sessionId = payload.sid || payload.jti;
      if (!sessionId) return { authenticated: false, refreshAvailable };
      const session = await getValidSessionById(sessionId);
      return { authenticated: Boolean(session), refreshAvailable };
    } catch {
      return { authenticated: false, refreshAvailable };
    }
  });

  /**
   * LOGIN — mensagem genérica, rate limit, sessão + cookies
   */
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const email = body.email.toLowerCase().trim();
    const { ip, userAgent } = clientMeta(request);

    const allowed = await checkLoginAllowed(email, ip);
    if (!allowed.ok) {
      reply.header("Retry-After", String(allowed.retryAfterSec));
      throw new AppError(
        "Muitas tentativas. Aguarde e tente novamente.",
        429,
        "AUTH_RATE_LIMITED"
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: { include: { plan: true } } },
        },
      },
    });

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

    const verified = await verifyPassword(user.passwordHash, body.password);
    if (!verified.ok) {
      await fail("bad_password");
      return;
    }

    if (verified.needsRehash) {
      const newHash = await hashPassword(body.password);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, passwordChangedAt: new Date() },
      });
    }

    /**
     * SUPERADMIN global: NUNCA entra automaticamente em tenant.
     * Memberships (se existirem) ficam listadas, mas o contexto de login é plataforma.
     * Entrada em empresa: impersonação (admin) ou ação explícita posterior.
     */
    let membership =
      user.platformRole === "SUPERADMIN"
        ? null
        : user.memberships[0] || null;
    if (body.tenantSlug && user.platformRole !== "SUPERADMIN") {
      membership =
        user.memberships.find((m) => m.tenant.slug === body.tenantSlug) || membership;
    }

    if (!membership && user.platformRole !== "SUPERADMIN") {
      await fail("no_tenant");
      return;
    }

    // Access Gate: login permitido mesmo com empresa restrita — a UI mostra a tela correta.
    // Usuário individual bloqueado/suspenso já foi barrado acima.
    // (decision completa em GET /auth/access-state após sessão)

    // MFA TOTP: senha ok → desafio de segundo fator
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const mfaToken = await createMfaChallenge({
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
        mfaRequired: true,
        mfaToken,
        message: "Informe o código do autenticador.",
      };
    }

    return completeLogin(app, reply, {
      user,
      membership,
      ip,
      userAgent,
      email,
    });
  });

  /** Completa login após MFA (ou usado internamente pós-senha sem MFA) */
  async function completeLogin(
    app: FastifyInstance,
    reply: FastifyReply,
    params: {
      user: {
        id: string;
        email: string;
        name: string;
        avatarUrl?: string | null;
        platformRole?: string | null;
        memberships: Array<{
          tenantId: string;
          role: import("@prisma/client").MemberRole;
          tenant: {
            id: string;
            name: string;
            slug: string;
            primaryColor: string;
            logoUrl?: string | null;
            plan?: unknown;
            settings?: unknown;
          };
        }>;
      };
      membership?: {
        tenantId: string;
        role: import("@prisma/client").MemberRole;
        tenant: {
          id: string;
          name: string;
          slug: string;
          primaryColor: string;
          logoUrl?: string | null;
          plan?: unknown;
          settings?: unknown;
        };
      } | null;
      ip: string | null;
      userAgent: string | null;
      email: string;
      imp?: boolean;
      impBy?: string | null;
    }
  ) {
    const { user, membership, ip, userAgent, email } = params;

    const { session, refreshToken } = await createAuthSession({
      userId: user.id,
      tenantId: membership?.tenantId || null,
      ip,
      userAgent,
      isImpersonation: Boolean(params.imp),
      impersonatorId: params.impBy || null,
    });

    const accessToken = await signAccess(app, {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      tenantId: membership?.tenantId || null,
      role: membership?.role || null,
      sid: session.id,
      imp: params.imp,
      impBy: params.impBy,
    });

    setRefreshCookie(reply, refreshToken);
    setAccessCookie(reply, accessToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastStrongAuthAt: new Date() },
    });

    await clearLoginFailures(email, ip || "");
    await recordLoginAttempt({
      email,
      userId: user.id,
      ip,
      userAgent,
      success: true,
      reason: params.imp ? "impersonation" : "ok",
    });
    await recordSecurityEvent({
      type: params.imp ? "IMPERSONATION_START" : "LOGIN_SUCCESS",
      userId: user.id,
      tenantId: membership?.tenantId,
      ip,
      userAgent,
      metadata: params.impBy ? { impBy: params.impBy } : undefined,
    });
    await audit({
      tenantId: membership?.tenantId,
      userId: user.id,
      action: params.imp ? "admin.impersonate.session" : "auth.login",
      ip: ip || undefined,
      metadata: { sessionId: session.id, impBy: params.impBy },
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      user: publicUser(user),
      tenant: membership
        ? {
            id: membership.tenant.id,
            name: membership.tenant.name,
            slug: membership.tenant.slug,
            primaryColor: membership.tenant.primaryColor,
            logoUrl: membership.tenant.logoUrl,
            role: membership.role,
            plan: membership.tenant.plan,
            settings: membership.tenant.settings,
            onboardingCompleted: Boolean(
              (membership.tenant.settings as { onboardingCompleted?: boolean } | null)
                ?.onboardingCompleted
            ),
          }
        : null,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          primaryColor: m.tenant.primaryColor,
        },
      })),
      security: await getSecurityFlags(user.id, user.platformRole),
      impersonation: params.imp
        ? { active: true, by: params.impBy }
        : { active: false },
    };
  }

  /** MFA verify no login */
  app.post(
    "/auth/mfa/verify",
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
    const body = z
      .object({
        mfaToken: z.string().min(20),
        code: z.string().min(6).max(16),
      })
      .parse(request.body);

    const { ip, userAgent } = clientMeta(request);
    const challengeRow = await getValidMfaChallenge(body.mfaToken);
    const user = assertFound(
      await prisma.user.findUnique({
        where: { id: challengeRow.userId },
        include: {
          memberships: {
            where: { isActive: true },
            include: { tenant: { include: { plan: true } } },
          },
        },
      })
    );

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppError("MFA não está ativo nesta conta.", 400, "MFA_NOT_ENABLED");
    }

    const secret = loadTotpSecret(user.twoFactorSecret);
    if (!secret) throw new AppError("MFA corrompido. Reconfigure o autenticador.", 400, "MFA_CORRUPT");

    let ok = false;
    let totpStep: number | null = null;
    const totp = verifyTotpCode(secret, body.code, user.lastTotpStep);
    if (totp.ok) {
      ok = true;
      totpStep = totp.step;
    } else {
      const backup = consumeBackupCode(user.twoFactorBackupCodes, body.code);
      if (backup.ok) {
        ok = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: backup.remainingJson },
        });
        await recordSecurityEvent({
          type: "MFA_BACKUP_USED",
          userId: user.id,
          ip,
          userAgent,
        });
      }
    }

    if (!ok) {
      await registerMfaFailure(challengeRow.id);
      await recordLoginFailure(user.email, ip);
      await recordSecurityEvent({
        type: "MFA_FAILED",
        userId: user.id,
        ip,
        userAgent,
      });
      throw new AppError("Código MFA inválido.", 401, "MFA_INVALID");
    }

    const challenge = await consumeMfaChallengeSuccess(challengeRow.id);
    if (totpStep != null) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastTotpStep: totpStep },
      });
    }

    // SUPERADMIN: MFA completa login global (sem tenant). Demais: membership do challenge ou a única.
    let membership =
      user.platformRole === "SUPERADMIN"
        ? null
        : user.memberships.find((m) => m.tenantId === challenge.tenantId) ||
          user.memberships[0] ||
          null;

    return completeLogin(app, reply, {
      user,
      membership,
      ip,
      userAgent,
      email: user.email,
    });
  });

  /** Status MFA */
  app.get("/auth/mfa/status", { preHandler: [app.authenticate] }, async (request) => {
    const user = assertFound(
      await prisma.user.findUnique({
        where: { id: (request.user as JwtUser).sub },
        select: {
          twoFactorEnabled: true,
          twoFactorBackupCodes: true,
        },
      })
    );
    const backups = user.twoFactorBackupCodes
      ? (JSON.parse(user.twoFactorBackupCodes) as unknown[])
      : [];
    const jwtUser = request.user as JwtUser;
    const flags = await getSecurityFlags(jwtUser.sub, jwtUser.platformRole);
    return {
      enabled: user.twoFactorEnabled,
      backupCodesRemaining: Array.isArray(backups) ? backups.length : 0,
      /** true = painel admin exige MFA e ainda não está ativo */
      requiredForAdmin: Boolean(flags.mfaRequiredForAdmin),
      policyRequired: Boolean(flags.mfaPolicyRequired),
    };
  });

  /** Inicia setup MFA (gera secret temporário no JWT curto em memória via response — secret só após enable no DB) */
  app.post("/auth/mfa/setup", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (user.twoFactorEnabled) {
      throw new AppError("MFA já está ativo. Desative antes de reconfigurar.", 409, "MFA_ALREADY_ON");
    }

    const secret = generateTotpSecret();
    // Secret cifrado em repouso; plaintext só na resposta de setup (uma vez)
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: storeTotpSecret(secret), twoFactorEnabled: false },
    });

    const otpauth = totpKeyUri(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });

    await recordSecurityEvent({
      type: "MFA_SETUP_STARTED",
      userId: user.id,
      ip: request.ip,
      metadata: { fp: secretFingerprint(secret) },
    });

    return {
      secret,
      otpauthUrl: otpauth,
      qrDataUrl,
      message: "Escaneie o QR no autenticador e confirme com um código.",
    };
  });

  /** Confirma e ativa MFA */
  app.post("/auth/mfa/enable", { preHandler: [app.authenticate] }, async (request) => {
    const body = z.object({ code: z.string().min(6).max(8) }).parse(request.body);
    const jwtUser = request.user as JwtUser;
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));

    if (!user.twoFactorSecret) {
      throw new AppError("Inicie o setup MFA primeiro.", 400, "MFA_SETUP_REQUIRED");
    }
    if (user.twoFactorEnabled) {
      throw new AppError("MFA já está ativo.", 409, "MFA_ALREADY_ON");
    }
    const secret = loadTotpSecret(user.twoFactorSecret);
    if (!secret) throw new AppError("Secret MFA inválido. Refaça o setup.", 400, "MFA_CORRUPT");
    const totp = verifyTotpCode(secret, body.code, user.lastTotpStep);
    if (!totp.ok) {
      throw new AppError("Código inválido. Confira o autenticador.", 400, "MFA_INVALID");
    }

    const { plain, hashed } = generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: JSON.stringify(hashed),
        lastTotpStep: totp.step,
        lastStrongAuthAt: new Date(),
      },
    });

    await recordSecurityEvent({
      type: "MFA_ENABLED",
      userId: user.id,
      ip: request.ip,
    });
    await audit({
      userId: user.id,
      tenantId: jwtUser.tenantId || undefined,
      action: "auth.mfa.enabled",
      ip: request.ip,
    });

    return {
      enabled: true,
      backupCodes: plain,
      message: "Guarde os códigos de recuperação. Eles só aparecem uma vez.",
    };
  });

  /** Desativa MFA (senha + código) — step-up implícito */
  app.post("/auth/mfa/disable", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        password: z.string().min(1),
        code: z.string().min(6).max(16),
      })
      .parse(request.body);

    const jwtUser = request.user as JwtUser;
    if (jwtUser.platformRole === "SUPERADMIN") {
      throw new AppError(
        "Superadmin não pode desativar MFA. Contate o time de plataforma.",
        403,
        "MFA_REQUIRED_SUPERADMIN"
      );
    }
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));

    const verified = await verifyPassword(user.passwordHash, body.password);
    if (!verified.ok) {
      throw new AppError("Senha incorreta.", 400, "BAD_PASSWORD");
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppError("MFA não está ativo.", 400, "MFA_NOT_ENABLED");
    }

    const secret = loadTotpSecret(user.twoFactorSecret);
    if (!secret) throw new AppError("MFA corrompido.", 400, "MFA_CORRUPT");

    let ok = false;
    const totp = verifyTotpCode(secret, body.code, user.lastTotpStep);
    if (totp.ok) {
      ok = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { lastTotpStep: totp.step },
      });
    } else {
      const backup = consumeBackupCode(user.twoFactorBackupCodes, body.code);
      ok = backup.ok;
      if (backup.ok) {
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: backup.remainingJson },
        });
      }
    }
    if (!ok) throw new AppError("Código MFA inválido.", 400, "MFA_INVALID");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        lastTotpStep: null,
      },
    });

    await recordSecurityEvent({
      type: "MFA_DISABLED",
      userId: user.id,
      ip: request.ip,
    });
    await audit({
      userId: user.id,
      tenantId: jwtUser.tenantId || undefined,
      action: "auth.mfa.disabled",
      ip: request.ip,
    });

    return { enabled: false, message: "MFA desativado." };
  });

  /** Confirma senha para step-up (ações sensíveis) */
  app.post("/auth/step-up", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        password: z.string().min(1),
        code: z.string().min(6).max(16).optional(),
      })
      .parse(request.body);
    const jwtUser = request.user as JwtUser;
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    const verified = await verifyPassword(user.passwordHash, body.password);
    if (!verified.ok) throw new AppError("Senha incorreta.", 400, "BAD_PASSWORD");
    if (user.twoFactorEnabled) {
      if (!body.code) throw new AppError("Código MFA obrigatório.", 400, "MFA_REQUIRED");
      const secret = loadTotpSecret(user.twoFactorSecret);
      if (!secret) throw new AppError("MFA corrompido.", 400, "MFA_CORRUPT");
      const totp = verifyTotpCode(secret, body.code, user.lastTotpStep);
      if (!totp.ok) throw new AppError("Código MFA inválido.", 401, "MFA_INVALID");
      await prisma.user.update({
        where: { id: user.id },
        data: { lastTotpStep: totp.step },
      });
    }
    await markStrongAuth(user.id);
    return { ok: true, strongAuthUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
  });

  /** REFRESH — rotação obrigatória */
  app.post("/auth/refresh", async (request, reply) => {
    const raw = request.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new AppError("Sessão expirada", 401, "UNAUTHORIZED");

    const { ip, userAgent } = clientMeta(request);
    const rotated = await rotateAuthSession({ rawRefresh: raw, ip, userAgent });

    if (!rotated.ok) {
      clearRefreshCookie(reply);
      clearAccessCookie(reply);
      if (rotated.reason === "REUSE") {
        await recordSecurityEvent({
          type: "REFRESH_REUSE",
          ip,
          userAgent,
          metadata: { reason: rotated.reason },
        });
      }
      throw new AppError("Sessão expirada. Faça login novamente.", 401, "SESSION_REVOKED");
    }

    const user = assertFound(
      await prisma.user.findUnique({
        where: { id: rotated.session.userId },
        include: {
          memberships: {
            where: { isActive: true },
            include: { tenant: true },
          },
        },
      })
    );

    if (!user.isActive || user.status === "SUSPENDED" || user.status === "DISABLED") {
      await revokeAllUserSessions(user.id, "user_disabled");
      clearRefreshCookie(reply);
      clearAccessCookie(reply);
      throw new AppError("Conta indisponível", 403, "USER_DISABLED");
    }

    /**
     * Contexto de tenant só vem da sessão (ou membership correspondente).
     * SUPERADMIN sem tenantId na sessão permanece global — não herda memberships[0].
     */
    const sessionTenantId = rotated.session.tenantId || null;
    const membership = sessionTenantId
      ? user.memberships.find((m) => m.tenantId === sessionTenantId) || null
      : null;
    // Impersonação: sessão guarda isImpersonation + impersonatorId
    const isImp = Boolean(rotated.session.isImpersonation);
    const impBy = rotated.session.impersonatorId || null;

    const accessToken = await signAccess(app, {
      sub: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      tenantId: sessionTenantId,
      role: membership?.role || null,
      sid: rotated.session.id,
      imp: isImp || undefined,
      impBy: isImp ? impBy : undefined,
    });

    setRefreshCookie(reply, rotated.refreshToken);
    setAccessCookie(reply, accessToken);

    return { accessToken, expiresIn: ACCESS_TOKEN_SECONDS };
  });

  /** LOGOUT */
  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as JwtUser;
    if (user.sid) {
      await revokeSession(user.sid, "logout");
    }
    clearRefreshCookie(reply);
    clearAccessCookie(reply);
    await recordSecurityEvent({
      type: "LOGOUT",
      userId: user.sub,
      tenantId: user.tenantId,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    await audit({
      tenantId: user.tenantId || undefined,
      userId: user.sub,
      action: "auth.logout",
      ip: request.ip,
    });
    return { ok: true };
  });

  /** LOGOUT ALL */
  app.post("/auth/logout-all", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as JwtUser;
    await revokeAllUserSessions(user.sub, "logout_all");
    clearRefreshCookie(reply);
    clearAccessCookie(reply);
    await recordSecurityEvent({
      type: "LOGOUT_ALL",
      userId: user.sub,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return { ok: true };
  });

  /**
   * Access Gate — estado resolvido para o frontend (fonte única no backend).
   * Sempre disponível em RESTRICTED (path /auth/access-state na allowlist).
   */
  app.get("/auth/access-state", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;
    const { evaluateAccessGate, toPublicAccessState } = await import(
      "../services/access-gate"
    );
    const decision = await evaluateAccessGate({
      userId: jwtUser.sub,
      tenantId: jwtUser.tenantId,
      role: jwtUser.role,
      platformRole: jwtUser.platformRole,
      impersonating: Boolean(jwtUser.imp),
    });
    return toPublicAccessState(decision);
  });

  /** ME */
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    const user = assertFound(
      await prisma.user.findUnique({
        where: { id: (request.user as JwtUser).sub },
        include: {
          memberships: {
            where: { isActive: true },
            include: { tenant: { include: { plan: true } } },
          },
        },
      })
    );

    if (!user.isActive || user.status === "SUSPENDED" || user.status === "DISABLED") {
      throw new AppError("Conta indisponível", 403, "USER_DISABLED");
    }

    const jwtUser = request.user as JwtUser;
    /**
     * Tenant atual = só o do JWT/sessão.
     * SUPERADMIN global (sem tenantId) NÃO herda a 1ª membership.
     */
    let tenantPayload: {
      id: string;
      name: string;
      slug: string;
      primaryColor: string;
      logoUrl?: string | null;
      role: string;
      plan?: unknown;
      settings?: unknown;
      onboardingCompleted: boolean;
    } | null = null;

    if (jwtUser.tenantId) {
      const membership = user.memberships.find((m) => m.tenantId === jwtUser.tenantId);
      if (membership) {
        tenantPayload = {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          primaryColor: membership.tenant.primaryColor,
          logoUrl: membership.tenant.logoUrl,
          role: membership.role,
          plan: membership.tenant.plan,
          settings: membership.tenant.settings,
          onboardingCompleted: Boolean(
            (membership.tenant.settings as { onboardingCompleted?: boolean } | null)
              ?.onboardingCompleted
          ),
        };
      } else if (jwtUser.imp || user.platformRole === "SUPERADMIN") {
        // Impersonação / superadmin no tenant sem membership própria
        const t = await prisma.tenant.findFirst({
          where: { id: jwtUser.tenantId },
          include: { plan: true },
        });
        if (t) {
          tenantPayload = {
            id: t.id,
            name: t.name,
            slug: t.slug,
            primaryColor: t.primaryColor,
            logoUrl: t.logoUrl,
            role: jwtUser.role || "ADMIN",
            plan: t.plan,
            settings: t.settings,
            onboardingCompleted: Boolean(
              (t.settings as { onboardingCompleted?: boolean } | null)?.onboardingCompleted
            ),
          };
        }
      }
    }

    return {
      user: publicUser(user),
      tenant: tenantPayload,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          primaryColor: m.tenant.primaryColor,
        },
      })),
      sessionId: jwtUser.sid || null,
      security: await getSecurityFlags(user.id, user.platformRole),
      impersonation: {
        active: Boolean(jwtUser.imp),
        by: jwtUser.impBy || null,
      },
    };
  });

  /** SWITCH TENANT — reemite JWT + atualiza sessão */
  app.post(
    "/auth/switch-tenant",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = z.object({ tenantId: z.string().min(1) }).parse(request.body);
      const jwtUser = request.user as JwtUser;

      const membership = await prisma.membership.findFirst({
        where: {
          userId: jwtUser.sub,
          tenantId: body.tenantId,
          isActive: true,
        },
        include: { tenant: { include: { plan: true } } },
      });
      // SUPERADMIN global: entrada em empresa é via /admin/impersonate (auditado), não switch-tenant
      if (jwtUser.platformRole === "SUPERADMIN" && !jwtUser.imp) {
        throw new AppError(
          "Superadministrador deve acessar empresas pela Administração (impersonação).",
          403,
          "USE_IMPERSONATION"
        );
      }

      if (!membership) {
        throw new AppError("Sem acesso a esta empresa", 403, "FORBIDDEN");
      }

      // Troca de tenant permitida mesmo com restrição — Access Gate + UI exibem a tela certa.

      if (jwtUser.sid) {
        await prisma.authSession.updateMany({
          where: { id: jwtUser.sid },
          data: { tenantId: body.tenantId, lastActivityAt: new Date() },
        });
      }

      const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
      const accessToken = await signAccess(app, {
        sub: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        tenantId: body.tenantId,
        role: membership.role,
        sid: jwtUser.sid || "none",
      });
      setAccessCookie(reply, accessToken);

      return {
        accessToken,
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          primaryColor: membership.tenant.primaryColor,
          logoUrl: membership.tenant.logoUrl,
          role: membership.role,
          plan: membership.tenant.plan,
          settings: membership.tenant.settings,
          onboardingCompleted: Boolean(
            (membership.tenant.settings as { onboardingCompleted?: boolean } | null)
              ?.onboardingCompleted
          ),
        },
      };
    }
  );

  /** SESSÕES */
  app.get("/auth/sessions", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;
    const sessions = await prisma.authSession.findMany({
      where: { userId: jwtUser.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
        ip: true,
        deviceLabel: true,
        userAgent: true,
        tenantId: true,
      },
    });
    return {
      currentSessionId: jwtUser.sid || null,
      sessions: sessions.map((s) => ({
        ...s,
        isCurrent: s.id === jwtUser.sid,
      })),
    };
  });

  app.delete("/auth/sessions/:id", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const jwtUser = request.user as JwtUser;
    const s = await prisma.authSession.findFirst({
      where: { id, userId: jwtUser.sub },
    });
    if (!s) throw new AppError("Sessão não encontrada", 404, "NOT_FOUND");
    await revokeSession(id, "user_revoked");
    await recordSecurityEvent({
      type: "SESSION_REVOKED",
      userId: jwtUser.sub,
      ip: request.ip,
      metadata: { sessionId: id },
    });
    return { ok: true };
  });

  app.post(
    "/auth/sessions/revoke-others",
    { preHandler: [app.authenticate] },
    async (request) => {
      const jwtUser = request.user as JwtUser;
      await revokeAllUserSessions(jwtUser.sub, "revoke_others", jwtUser.sid);
      return { ok: true };
    }
  );

  /** Cadastro público — sempre bloqueado por padrão */
  app.post("/auth/register", async () => {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: "public_registration_enabled" },
    });
    const enabled =
      setting?.value === true ||
      setting?.value === "true" ||
      (typeof setting?.value === "object" &&
        setting?.value !== null &&
        (setting.value as { enabled?: boolean }).enabled === true);

    if (!enabled) {
      throw new AppError(
        "Cadastro público indisponível. O acesso é liberado após a contratação.",
        403,
        "REGISTER_DISABLED"
      );
    }
    throw new AppError("Cadastro público ainda não implementado.", 501, "NOT_IMPLEMENTED");
  });

  /** FORGOT PASSWORD — anti-enumeração */
  app.post(
    "/auth/forgot-password",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 hour" },
      },
    },
    async (request) => {
      const body = z.object({ email: z.string().email() }).parse(request.body);
      const email = body.email.toLowerCase().trim();
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
        // NUNCA logar o token em production (sendMail redige)
        await sendMail({
          to: email,
          subject: "Redefinição de senha — NexaFlow AI",
          text: `Olá,\n\nUse o link abaixo para redefinir sua senha (válido por 30 minutos):\n${link}\n\nSe você não solicitou, ignore este e-mail.`,
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
        message:
          "Se existir uma conta vinculada a este e-mail, enviaremos as instruções.",
      };
    }
  );

  /** RESET PASSWORD */
  app.post("/auth/reset-password", async (request) => {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(10).max(128),
      })
      .parse(request.body);

    const policy = validatePasswordPolicy(body.password);
    if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");

    const tokenHash = hashOpaqueToken(body.token);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError("Link inválido ou expirado.", 400, "RESET_INVALID");
    }

    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
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

    // Notificação de segurança (sem a nova senha)
    await sendMail({
      to: row.user.email,
      subject: "Sua senha foi alterada — NexaFlow AI",
      text: `Olá ${row.user.name},\n\nSua senha foi redefinida com sucesso. Se não foi você, contate o suporte imediatamente.\n`,
      tags: ["password-changed"],
    });

    return { message: "Senha atualizada. Faça login com a nova senha." };
  });

  /**
   * Aceitar convite de equipe — usuário define a própria senha.
   * POST /auth/accept-invite { token, password, name? }
   */
  app.post(
    "/auth/accept-invite",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = z
        .object({
          token: z.string().min(20),
          password: z.string().min(10).max(128),
          name: z.string().min(2).max(120).optional(),
        })
        .parse(request.body);

      const policy = validatePasswordPolicy(body.password);
      if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");

      const tokenHash = hashOpaqueToken(body.token);
      const invite = await prisma.userInvite.findUnique({ where: { tokenHash } });
      if (
        !invite ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt.getTime() < Date.now()
      ) {
        throw new AppError("Convite inválido ou expirado.", 400, "INVITE_INVALID");
      }

      const email = invite.email.toLowerCase();
      const passwordHash = await hashPassword(body.password);

      const user = await prisma.$transaction(async (tx) => {
        let u = await tx.user.findUnique({ where: { email } });
        if (!u) {
          u = await tx.user.create({
            data: {
              email,
              name: body.name || invite.name,
              passwordHash,
              status: "ACTIVE",
              passwordChangedAt: new Date(),
            },
          });
        } else {
          u = await tx.user.update({
            where: { id: u.id },
            data: {
              passwordHash,
              passwordChangedAt: new Date(),
              name: body.name || u.name || invite.name,
              status: "ACTIVE",
              isActive: true,
            },
          });
        }

        await tx.membership.upsert({
          where: { tenantId_userId: { tenantId: invite.tenantId, userId: u.id } },
          update: { role: invite.role, isActive: true },
          create: { tenantId: invite.tenantId, userId: u.id, role: invite.role },
        });

        await tx.userInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });

        return u;
      });

      await revokeAllUserSessions(user.id, "invite_accepted");
      await recordSecurityEvent({
        type: "INVITE_ACCEPTED",
        userId: user.id,
        tenantId: invite.tenantId,
        ip: request.ip,
      });

      // Login automático após aceite
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, tenantId: invite.tenantId, isActive: true },
        include: { tenant: { include: { plan: true } } },
      });

      const { session, refreshToken } = await createAuthSession({
        userId: user.id,
        tenantId: invite.tenantId,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      const accessToken = await signAccess(app, {
        sub: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        tenantId: invite.tenantId,
        role: membership?.role || invite.role,
        sid: session.id,
      });
      setRefreshCookie(reply, refreshToken);
      setAccessCookie(reply, accessToken);
      await markStrongAuth(user.id);

      return {
        accessToken,
        expiresIn: ACCESS_TOKEN_SECONDS,
        user: publicUser(user),
        tenant: membership
          ? {
              id: membership.tenant.id,
              name: membership.tenant.name,
              slug: membership.tenant.slug,
              role: membership.role,
              plan: membership.tenant.plan,
            }
          : null,
        message: "Convite aceito. Bem-vindo à NexaFlow AI.",
      };
    }
  );

  /** PROFILE — atualiza dados pessoais (nome + preferências de avatar sem upload) */
  app.patch("/auth/profile", { preHandler: [app.authenticate], bodyLimit: 32_768 }, async (request) => {
    const body = z
      .object({
        name: z
          .string()
          .trim()
          .min(2, "Informe um nome com pelo menos 2 caracteres")
          .max(80, "Nome muito longo")
          .optional(),
        phone: z.string().max(40).optional().nullable(),
        avatarColor: z.string().max(32).optional().nullable(),
        preferences: z
          .object({
            theme: z.enum(["light", "dark", "system"]).optional(),
            language: z.string().max(16).optional(),
            notifyMentions: z.boolean().optional(),
            notifyAssigned: z.boolean().optional(),
            notifySecurity: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(request.body);

    const {
      normalizeAvatarColor,
      isValidAvatarColor,
    } = await import("../services/security/avatar");

    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.avatarColor !== undefined) {
      if (body.avatarColor === null || body.avatarColor === "") {
        data.avatarColor = null;
      } else if (!isValidAvatarColor(body.avatarColor)) {
        throw new AppError("Cor de avatar inválida.", 400, "AVATAR_COLOR_INVALID");
      } else {
        data.avatarColor = normalizeAvatarColor(body.avatarColor);
      }
    }
    if (body.preferences) {
      const prev =
        existing.preferences && typeof existing.preferences === "object"
          ? (existing.preferences as Record<string, unknown>)
          : {};
      data.preferences = { ...prev, ...body.preferences };
    }

    if (!Object.keys(data).length) {
      throw new AppError("Nada para atualizar.", 400, "EMPTY_PATCH");
    }

    const user = assertFound(
      await prisma.user.update({
        where: { id: jwtUser.sub },
        data,
      })
    );

    await recordSecurityEvent({
      type: "PROFILE_UPDATED",
      userId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      metadata: { fields: Object.keys(data) },
    });

    return {
      user: publicUser(user),
      message: "Perfil atualizado.",
    };
  });

  app.get("/me/profile", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    return { user: publicUser(user) };
  });

  /**
   * TOUR DA PLATAFORMA — estado por usuário (User.preferences.platformTour).
   * Não é onboarding da empresa. Bloqueado em impersonation (leitura ok, escrita não).
   */
  app.get("/auth/platform-tour", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;
    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    const {
      resolveTourState,
      mergeTourIntoPreferences,
      PLATFORM_TOUR_VERSION,
      shouldAutoOffer,
    } = await import("../services/platform-tour");
    const { asInputJson } = await import("../lib/json");

    let { state, needsBackfill } = resolveTourState(user.preferences, user.createdAt);

    // Legado: grava DISMISSED na primeira leitura (sem auto-invite).
    // Impersonation: NÃO grava no perfil do cliente.
    if (needsBackfill && !jwtUser.imp) {
      const prefs = mergeTourIntoPreferences(user.preferences, state);
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: asInputJson(prefs) },
      });
    }

    return {
      tour: state,
      version: PLATFORM_TOUR_VERSION,
      autoOffer: shouldAutoOffer(state) && !jwtUser.imp,
      impersonating: Boolean(jwtUser.imp),
    };
  });

  app.post("/auth/platform-tour", { preHandler: [app.authenticate] }, async (request) => {
    const jwtUser = request.user as JwtUser;

    // Impersonation: nunca altera estado do usuário impersonado
    if (jwtUser.imp) {
      throw new AppError(
        "Tour indisponível durante impersonação.",
        403,
        "TOUR_IMPERSONATION_BLOCKED"
      );
    }

    const body = z
      .object({
        action: z.enum(["offer", "dismiss", "start", "exit", "complete", "restart", "step"]),
        stepId: z.string().max(64).optional().nullable(),
      })
      .parse(request.body);

    const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    const {
      resolveTourState,
      applyTourAction,
      mergeTourIntoPreferences,
      auditActionForTour,
      PLATFORM_TOUR_VERSION,
      shouldAutoOffer,
    } = await import("../services/platform-tour");
    const { asInputJson } = await import("../lib/json");

    const { state: current } = resolveTourState(user.preferences, user.createdAt);
    const next = applyTourAction(current, body.action, { stepId: body.stepId });
    const prefs = mergeTourIntoPreferences(user.preferences, next);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { preferences: asInputJson(prefs) },
    });

    // Auditoria operacional (sem dados sensíveis)
    if (body.action !== "step") {
      await audit({
        tenantId: jwtUser.tenantId || null,
        userId: user.id,
        action: auditActionForTour(body.action),
        entity: "PlatformTour",
        entityId: user.id,
        metadata: {
          version: PLATFORM_TOUR_VERSION,
          status: next.status,
          stepId: body.stepId || null,
        },
        ip: request.ip,
      });
    }

    return {
      tour: next,
      version: PLATFORM_TOUR_VERSION,
      autoOffer: shouldAutoOffer(next),
      user: publicUser(updated),
    };
  });

  app.get("/auth/avatar/presets", { preHandler: [app.authenticate] }, async () => {
    const { NEXA_AVATAR_PRESETS, AVATAR_COLORS, presetPublicUrl } = await import(
      "../services/security/avatar"
    );
    return {
      presets: NEXA_AVATAR_PRESETS.map((p) => ({
        ...p,
        url: presetPublicUrl(p.id),
      })),
      colors: AVATAR_COLORS,
    };
  });

  /** Upload de foto — data URL validada → storage em disco */
  app.post(
    "/auth/avatar/upload",
    { preHandler: [app.authenticate], bodyLimit: 7_000_000 },
    async (request) => {
      const body = z
        .object({
          image: z.string().min(32).max(7_000_000),
        })
        .parse(request.body);

      const {
        parseAndValidateAvatarDataUrl,
        saveAvatarFile,
        deleteAvatarFile,
      } = await import("../services/security/avatar");

      const jwtUser = request.user as JwtUser;
      const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
      const { buffer, ext } = await parseAndValidateAvatarDataUrl(body.image);
      const url = await saveAvatarFile(jwtUser.sub, buffer, ext);

      if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
        await deleteAvatarFile(existing.avatarUrl);
      }

      const user = await prisma.user.update({
        where: { id: jwtUser.sub },
        data: {
          avatarType: "UPLOAD",
          avatarUrl: url,
          avatarPresetId: null,
        },
      });

      await recordSecurityEvent({
        type: "AVATAR_UPLOADED",
        userId: user.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
        metadata: { ext },
      });

      return { user: publicUser(user), message: "Foto do perfil atualizada." };
    }
  );

  app.post("/me/avatar/upload", { preHandler: [app.authenticate], bodyLimit: 7_000_000 }, async (request) => {
    // delega para o mesmo corpo (inline)
    const body = z.object({ image: z.string().min(32).max(7_000_000) }).parse(request.body);
    const {
      parseAndValidateAvatarDataUrl,
      saveAvatarFile,
      deleteAvatarFile,
    } = await import("../services/security/avatar");
    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    const { buffer, ext } = await parseAndValidateAvatarDataUrl(body.image);
    const url = await saveAvatarFile(jwtUser.sub, buffer, ext);
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }
    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: { avatarType: "UPLOAD", avatarUrl: url, avatarPresetId: null },
    });
    return { user: publicUser(user), message: "Foto do perfil atualizada." };
  });

  /** Remove foto → volta para iniciais */
  app.delete("/auth/avatar", { preHandler: [app.authenticate] }, async (request) => {
    const { deleteAvatarFile, normalizeAvatarColor } = await import("../services/security/avatar");
    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }
    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: {
        avatarType: "INITIALS",
        avatarUrl: null,
        avatarPresetId: null,
        avatarColor: existing.avatarColor || normalizeAvatarColor("violet"),
      },
    });
    await recordSecurityEvent({
      type: "AVATAR_REMOVED",
      userId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return { user: publicUser(user), message: "Foto removida. Usando iniciais." };
  });

  app.delete("/me/avatar", { preHandler: [app.authenticate] }, async (request) => {
    const { deleteAvatarFile, normalizeAvatarColor } = await import("../services/security/avatar");
    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }
    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: {
        avatarType: "INITIALS",
        avatarUrl: null,
        avatarPresetId: null,
        avatarColor: existing.avatarColor || normalizeAvatarColor("violet"),
      },
    });
    return { user: publicUser(user), message: "Foto removida. Usando iniciais." };
  });

  /** Escolher Nexa Avatar (preset) */
  app.post("/auth/avatar/preset", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        presetId: z.string().min(3).max(64),
      })
      .parse(request.body);

    const { isValidPresetId, deleteAvatarFile, presetPublicUrl } = await import(
      "../services/security/avatar"
    );
    if (!isValidPresetId(body.presetId)) {
      throw new AppError("Avatar inválido.", 400, "AVATAR_PRESET_INVALID");
    }

    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }

    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: {
        avatarType: "NEXA_AVATAR",
        avatarPresetId: body.presetId,
        avatarUrl: presetPublicUrl(body.presetId),
      },
    });

    await recordSecurityEvent({
      type: "AVATAR_PRESET",
      userId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      metadata: { presetId: body.presetId },
    });

    return { user: publicUser(user), message: "Avatar atualizado." };
  });

  app.post("/me/avatar/preset", { preHandler: [app.authenticate] }, async (request) => {
    const body = z.object({ presetId: z.string().min(3).max(64) }).parse(request.body);
    const { isValidPresetId, deleteAvatarFile, presetPublicUrl } = await import(
      "../services/security/avatar"
    );
    if (!isValidPresetId(body.presetId)) {
      throw new AppError("Avatar inválido.", 400, "AVATAR_PRESET_INVALID");
    }
    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }
    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: {
        avatarType: "NEXA_AVATAR",
        avatarPresetId: body.presetId,
        avatarUrl: presetPublicUrl(body.presetId),
      },
    });
    return { user: publicUser(user), message: "Avatar atualizado." };
  });

  /** Modo iniciais (com cor opcional) */
  app.post("/auth/avatar/initials", { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        color: z.string().max(32).optional(),
      })
      .parse(request.body || {});

    const { deleteAvatarFile, normalizeAvatarColor, isValidAvatarColor } = await import(
      "../services/security/avatar"
    );
    if (body.color && !isValidAvatarColor(body.color)) {
      throw new AppError("Cor inválida.", 400, "AVATAR_COLOR_INVALID");
    }

    const jwtUser = request.user as JwtUser;
    const existing = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
    if (existing.avatarUrl && existing.avatarType === "UPLOAD") {
      await deleteAvatarFile(existing.avatarUrl);
    }

    const user = await prisma.user.update({
      where: { id: jwtUser.sub },
      data: {
        avatarType: "INITIALS",
        avatarUrl: null,
        avatarPresetId: null,
        avatarColor: normalizeAvatarColor(body.color || existing.avatarColor || "violet"),
      },
    });

    return { user: publicUser(user), message: "Usando iniciais." };
  });

  /** CHANGE PASSWORD (autenticado) */
  app.post(
    "/auth/change-password",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(10).max(128),
        })
        .parse(request.body);

      const policy = validatePasswordPolicy(body.newPassword);
      if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");

      const jwtUser = request.user as JwtUser;
      const user = assertFound(await prisma.user.findUnique({ where: { id: jwtUser.sub } }));
      const verified = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!verified.ok) {
        throw new AppError("Senha atual incorreta.", 400, "BAD_PASSWORD");
      }

      const passwordHash = await hashPassword(body.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await revokeAllUserSessions(user.id, "password_changed", jwtUser.sid);
      await recordSecurityEvent({
        type: "PASSWORD_CHANGED",
        userId: user.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return { message: "Senha alterada. Outras sessões foram encerradas." };
    }
  );
}
