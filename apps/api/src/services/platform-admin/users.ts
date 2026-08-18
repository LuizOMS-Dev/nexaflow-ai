import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { testUserEmailFilter } from "./fixtures";

export type ListUsersQuery = {
  search?: string;
  scope?: "all" | "companies" | "platform";
  status?: string;
  role?: string;
  tenantId?: string;
  mfa?: "all" | "enabled" | "disabled";
  page: number;
  limit: number;
};

export async function getUsersKpis() {
  const baseWhere: Prisma.UserWhereInput = {
    NOT: testUserEmailFilter(),
  };

  const [totalUsers, activeUsers, superadmins, usersWithMfa, activeMemberships, tenantsWithUsers] =
    await Promise.all([
      prisma.user.count({ where: baseWhere }),
      prisma.user.count({ where: { ...baseWhere, status: "ACTIVE" } }),
      prisma.user.count({ where: { ...baseWhere, platformRole: "SUPERADMIN" } }),
      prisma.user.count({ where: { ...baseWhere, twoFactorEnabled: true } }),
      prisma.membership.count({
        where: {
          isActive: true,
          status: "ACTIVE",
          user: { NOT: testUserEmailFilter() },
        },
      }),
      prisma.tenant.count({
        where: {
          members: {
            some: {
              isActive: true,
              status: "ACTIVE",
              user: { NOT: testUserEmailFilter() },
            },
          },
        },
      }),
    ]);

  return {
    totalUsers,
    activeUsers,
    superadmins,
    usersWithMfa,
    activeMemberships,
    tenantsWithUsers,
  };
}

export async function listUsers(q: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    NOT: testUserEmailFilter(),
  };

  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { email: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
      { displayName: { contains: s, mode: "insensitive" } },
      { phone: { contains: s } },
    ];
  }

  if (q.status && q.status !== "ALL") {
    where.status = q.status as Prisma.EnumUserStatusFilter;
  }

  if (q.mfa === "enabled") {
    where.twoFactorEnabled = true;
  } else if (q.mfa === "disabled") {
    where.twoFactorEnabled = false;
  }

  if (q.scope === "platform") {
    where.platformRole = "SUPERADMIN";
  } else if (q.scope === "companies") {
    where.AND = [
      { memberships: { some: { isActive: true } } },
      { NOT: { platformRole: "SUPERADMIN" } },
    ];
  }

  const membershipSome: Prisma.MembershipWhereInput = { isActive: true };
  if (q.role && q.role !== "ALL") {
    membershipSome.role = q.role as Prisma.EnumMemberRoleFilter;
  }
  if (q.tenantId) {
    membershipSome.tenantId = q.tenantId;
  }
  if ((q.role && q.role !== "ALL") || q.tenantId) {
    where.memberships = { some: membershipSome };
  }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        phone: true,
        avatarUrl: true,
        avatarType: true,
        avatarPresetId: true,
        avatarColor: true,
        platformRole: true,
        status: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            isActive: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logoUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);

  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export async function getUserDetail(id: string) {
  const user = assertFound(
    await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        phone: true,
        avatarUrl: true,
        avatarType: true,
        avatarPresetId: true,
        avatarColor: true,
        platformRole: true,
        status: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            isActive: true,
            createdAt: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                logoUrl: true,
                plan: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    })
  );

  return user;
}

export async function updateUserStatus(
  id: string,
  body: {
    status: "ACTIVE" | "SUSPENDED" | "DISABLED";
    reason?: string;
  },
  actor: { sub: string; ip?: string }
) {
  const target = assertFound(await prisma.user.findUnique({ where: { id } }));

  // Proteção: não permitir alterar o status da própria conta Superadmin logada
  if (target.platformRole === "SUPERADMIN" && target.id === actor.sub) {
    throw new AppError("Não é possível alterar o status da própria conta Superadmin.", 400, "SELF_STATUS_CHANGE_FORBIDDEN");
  }

  // Proteção concorrente: não permitir suspender/bloquear o último SUPERADMIN ativo da plataforma
  if (target.platformRole === "SUPERADMIN" && body.status !== "ACTIVE") {
    const activeSuperadmins = await prisma.user.count({
      where: {
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
        NOT: { id: target.id },
      },
    });

    if (activeSuperadmins === 0) {
      throw new AppError(
        "Operação recusada: Não é possível suspender ou desativar o último Superadministrador ativo da plataforma.",
        400,
        "LAST_SUPERADMIN_PROTECTED"
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: body.status,
      isActive: body.status === "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      isActive: true,
      platformRole: true,
    },
  });

  // Se o usuário foi suspenso ou bloqueado, revoga fisicamente suas sessões ativas
  if (body.status !== "ACTIVE") {
    await prisma.authSession
      .updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: `user_status_${body.status.toLowerCase()}` },
      })
      .catch(() => null);

    await prisma.refreshToken.deleteMany({ where: { userId: id } }).catch(() => null);
  }

  await audit({
    userId: actor.sub,
    action:
      body.status === "DISABLED"
        ? "user.blocked"
        : body.status === "SUSPENDED"
          ? "user.suspended"
          : "user.reactivated",
    entity: "user",
    entityId: id,
    metadata: { status: body.status, reason: body.reason || null, prev: target.status },
    ip: actor.ip,
  });

  return updated;
}

export async function revokeUserSessions(
  userId: string,
  actor: { sub: string; ip?: string }
) {
  assertFound(await prisma.user.findUnique({ where: { id: userId } }));

  // 1. Marca todas as sessões como revogadas
  const sessionResult = await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokeReason: `admin_revoked_by_${actor.sub}`,
    },
  });

  // 2. Remove todos os refresh tokens ativos
  const tokenResult = await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  await audit({
    userId: actor.sub,
    action: "user.sessions_revoked",
    entity: "user",
    entityId: userId,
    metadata: {
      revokedSessions: sessionResult.count,
      revokedTokens: tokenResult.count,
    },
    ip: actor.ip,
  });

  return {
    ok: true,
    revokedSessions: sessionResult.count,
    revokedTokens: tokenResult.count,
  };
}

export async function resetUserMfa(
  userId: string,
  actor: { sub: string; ip?: string }
) {
  const target = assertFound(await prisma.user.findUnique({ where: { id: userId } }));

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      lastTotpStep: null,
    },
  });

  // Invalida desafios MFA pendentes
  await prisma.mfaChallenge.deleteMany({ where: { userId } }).catch(() => null);

  await audit({
    userId: actor.sub,
    action: "user.mfa_reset",
    entity: "user",
    entityId: userId,
    metadata: { previousMfaEnabled: target.twoFactorEnabled },
    ip: actor.ip,
  });

  return { ok: true };
}

export async function updateUserPlatformRole(
  userId: string,
  body: { platformRole: "SUPERADMIN" | null },
  actor: { sub: string; ip?: string }
) {
  const target = assertFound(await prisma.user.findUnique({ where: { id: userId } }));

  // Proteção: não permitir remover o próprio papel de Superadmin logado
  if (target.id === actor.sub && body.platformRole === null) {
    throw new AppError("Não é possível revogar o próprio privilégio de Superadministrador.", 400, "SELF_ROLE_REVOKE_FORBIDDEN");
  }

  // Proteção concorrente: não permitir revogar o último Superadmin ativo
  if (target.platformRole === "SUPERADMIN" && body.platformRole === null) {
    const activeSuperadmins = await prisma.user.count({
      where: {
        platformRole: "SUPERADMIN",
        status: "ACTIVE",
        NOT: { id: target.id },
      },
    });

    if (activeSuperadmins === 0) {
      throw new AppError(
        "Operação recusada: Não é possível remover o privilégio do último Superadministrador da plataforma.",
        400,
        "LAST_SUPERADMIN_PROTECTED"
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { platformRole: body.platformRole },
    select: { id: true, email: true, name: true, platformRole: true },
  });

  await audit({
    userId: actor.sub,
    action: body.platformRole === "SUPERADMIN" ? "user.platform_role_granted" : "user.platform_role_revoked",
    entity: "user",
    entityId: userId,
    metadata: { prevRole: target.platformRole, nextRole: body.platformRole },
    ip: actor.ip,
  });

  return updated;
}
