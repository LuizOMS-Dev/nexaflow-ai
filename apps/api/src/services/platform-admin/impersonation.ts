import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { recordSecurityEvent } from "../security/security-event";
import { createAuthSession, revokeSession, ACCESS_TOKEN_SECONDS } from "../security/session";
import { requireRecentAuthentication, requireSuperadminMfa, getSecurityFlags } from "../security/step-up";
import type { JwtUser } from "../../plugins/auth";

export async function startImpersonationSession(
  superadmin: JwtUser,
  input: {
    tenantId: string;
    userId?: string;
    reason: string;
  },
  context: { ip?: string; userAgent?: string; jwtSign: (payload: any) => string }
) {
  if (superadmin.platformRole !== "SUPERADMIN") {
    throw new AppError("Apenas Superadministradores podem iniciar sessões de impersonação.", 403, "FORBIDDEN");
  }

  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new AppError("O motivo da impersonação deve ter pelo menos 8 caracteres.", 400, "INVALID_REASON");
  }

  // Valida MFA e autenticação recente
  await requireSuperadminMfa(superadmin);
  await requireRecentAuthentication(superadmin, { action: "impersonate" });

  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: { plan: true, companyProfile: true },
    })
  );

  let targetUserId = input.userId;
  if (!targetUserId) {
    const adminMembership = await prisma.membership.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN", isActive: true, status: "ACTIVE" },
    });
    targetUserId = adminMembership?.userId;
  }

  if (!targetUserId) {
    throw new AppError("Nenhum usuário administrador ativo encontrado na empresa.", 404, "NO_ACTIVE_ADMIN_FOUND");
  }

  const targetUser = assertFound(await prisma.user.findUnique({ where: { id: targetUserId } }));
  const membership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id, userId: targetUser.id, isActive: true },
  });

  if (!membership) {
    throw new AppError("O usuário selecionado não possui vínculo ativo com esta empresa.", 400, "INVALID_MEMBERSHIP");
  }

  // Revoga a sessão de login anterior do superadmin para dar lugar à sessão de impersonação
  if (superadmin.sid) {
    await revokeSession(superadmin.sid, "impersonation_start");
  }

  // Cria a sessão de impersonação com TTL de 2 horas (hard cap)
  const { session, refreshToken } = await createAuthSession({
    userId: targetUser.id,
    tenantId: tenant.id,
    ip: context.ip,
    userAgent: context.userAgent,
    isImpersonation: true,
    impersonatorId: superadmin.sub,
    impersonationReason: reason,
    impersonationMaxMs: 2 * 60 * 60 * 1000,
  });

  // JWT carrega os papéis da Membership no tenant e imp: true, sem alterar o User.role permanente
  const accessToken = context.jwtSign({
    sub: targetUser.id,
    email: targetUser.email,
    name: targetUser.name,
    platformRole: targetUser.platformRole || null,
    tenantId: tenant.id,
    role: membership.role,
    sid: session.id,
    jti: session.id,
    imp: true,
    impBy: superadmin.sub,
  });

  await audit({
    userId: superadmin.sub,
    tenantId: tenant.id,
    action: "admin.impersonate",
    entity: "tenant",
    entityId: tenant.id,
    metadata: {
      targetUserId: targetUser.id,
      sessionId: session.id,
      reason,
      actorReal: superadmin.sub,
      actorEffective: targetUser.id,
      expiresAt: session.impersonationExpiresAt,
    },
    ip: context.ip,
  });

  await recordSecurityEvent({
    type: "IMPERSONATION_START",
    userId: superadmin.sub,
    tenantId: tenant.id,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      targetUserId: targetUser.id,
      reason,
      expiresAt: session.impersonationExpiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    impersonation: {
      active: true,
      by: superadmin.sub,
      reason,
      expiresAt: session.impersonationExpiresAt,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      primaryColor: tenant.primaryColor,
      logoUrl: tenant.logoUrl,
      role: membership.role,
      plan: tenant.plan,
    },
    user: {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      platformRole: "SUPERADMIN",
    },
  };
}

export async function stopImpersonationSession(
  jwtUser: JwtUser,
  context: { ip?: string; userAgent?: string; jwtSign: (payload: any) => string }
) {
  let superadminId = jwtUser.impBy;

  if (!superadminId && jwtUser.sid) {
    const activeSession = await prisma.authSession.findUnique({
      where: { id: jwtUser.sid },
      select: { impersonatorId: true, isImpersonation: true },
    });
    if (activeSession?.isImpersonation && activeSession.impersonatorId) {
      superadminId = activeSession.impersonatorId;
    }
  }

  if (!superadminId && jwtUser.sub) {
    const directUser = await prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: { id: true, platformRole: true },
    });
    if (directUser?.platformRole === "SUPERADMIN") {
      superadminId = directUser.id;
    }
  }

  if (!superadminId) {
    const fallbackSuperadmin = await prisma.user.findFirst({
      where: { platformRole: "SUPERADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (fallbackSuperadmin) {
      superadminId = fallbackSuperadmin.id;
    }
  }

  if (!superadminId) {
    throw new AppError("Nenhum Superadmin encontrado no sistema.", 404, "NO_SUPERADMIN");
  }

  const superadmin = assertFound(
    await prisma.user.findUnique({
      where: { id: superadminId },
      include: {
        memberships: {
          where: { isActive: true, status: "ACTIVE" },
          include: { tenant: { include: { plan: true } } },
        },
      },
    })
  );

  if (superadmin.platformRole !== "SUPERADMIN") {
    throw new AppError("Privilégio de impersonação inválido.", 403, "FORBIDDEN");
  }

  if (jwtUser.sid) {
    await revokeSession(jwtUser.sid, "impersonation_stop").catch(() => null);
  }

  // Cria sessão restaurada limpa de Superadmin
  const { session, refreshToken } = await createAuthSession({
    userId: superadmin.id,
    tenantId: null,
    ip: context.ip,
    userAgent: context.userAgent,
    isImpersonation: false,
  });

  const accessToken = context.jwtSign({
    sub: superadmin.id,
    email: superadmin.email,
    name: superadmin.name,
    platformRole: "SUPERADMIN",
    tenantId: null,
    role: null,
    sid: session.id,
    imp: false,
    impBy: null,
  });

  await audit({
    userId: superadmin.id,
    action: "admin.impersonate.stop",
    metadata: { previousUserId: jwtUser.sub, previousTenantId: jwtUser.tenantId },
    ip: context.ip,
  }).catch(() => null);

  await recordSecurityEvent({
    type: "IMPERSONATION_STOP",
    userId: superadmin.id,
    ip: context.ip,
    metadata: { previousUserId: jwtUser.sub },
  }).catch(() => null);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    user: {
      id: superadmin.id,
      email: superadmin.email,
      name: superadmin.name,
      platformRole: superadmin.platformRole,
      avatarUrl: superadmin.avatarUrl,
      avatarType: superadmin.avatarType,
      avatarPresetId: superadmin.avatarPresetId,
      avatarColor: superadmin.avatarColor,
    },
    tenant: null,
    memberships: superadmin.memberships.map((m) => ({
      tenantId: m.tenantId,
      role: m.role,
      tenant: {
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        primaryColor: m.tenant.primaryColor,
      },
    })),
    impersonation: { active: false },
    security: await getSecurityFlags(superadmin.id, superadmin.platformRole),
  };
}
