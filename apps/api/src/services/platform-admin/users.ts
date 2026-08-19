import { randomBytes } from "crypto";
import type { MemberRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { hashOpaqueToken, hashPassword } from "../security/password";
import { appPublicUrl, sendMail } from "../security/mail";
import { testUserEmailFilter } from "./fixtures";

const MEMBER_ROLES: MemberRole[] = ["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function prismaErrorCode(err: unknown): string {
  return typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
}

/**
 * Interactive tx retry: unique-constraint conflicts abort the Postgres tx.
 * Callers must throw AppError for business conflicts so those are not retried.
 */
async function runSerializableProvision<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await prisma.$transaction(fn);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (prismaErrorCode(err) === "P2002") {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

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

  const [
    totalUsers,
    activeUsers,
    superadmins,
    usersWithMfa,
    activeMemberships,
    tenantsWithUsers,
    platformActive,
    platformWithMfa,
    platformActiveSessions,
  ] =
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
      prisma.user.count({
        where: { ...baseWhere, platformRole: "SUPERADMIN", status: "ACTIVE" },
      }),
      prisma.user.count({
        where: { ...baseWhere, platformRole: "SUPERADMIN", twoFactorEnabled: true },
      }),
      prisma.authSession.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { platformRole: "SUPERADMIN", NOT: testUserEmailFilter() },
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
    platformActive,
    platformWithMfa,
    platformActiveSessions,
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
        _count: {
          select: {
            authSessions: true,
            refreshTokens: true,
          },
        },
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

  const activeSessions = await prisma.authSession.count({
    where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  return { ...user, activeSessions };
}

async function sendFirstAccessMail(email: string, userId: string, kind: "company" | "platform") {
  const raw = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashOpaqueToken(raw),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const link = `${appPublicUrl()}/login?reset=${encodeURIComponent(raw)}`;
  const subject =
    kind === "platform"
      ? "Acesso de administrador — NexaFlow"
      : "Defina sua senha — NexaFlow";
  const text =
    kind === "platform"
      ? `Olá,\n\nSua conta de administrador da plataforma NexaFlow foi criada.\nDefina sua senha neste link (válido por 7 dias):\n${link}\n`
      : `Olá,\n\nVocê foi adicionado a uma empresa no NexaFlow.\nDefina sua senha neste link (válido por 7 dias):\n${link}\n`;
  await sendMail({ to: email, subject, text, tags: ["admin-user-provision"] });
}

export async function provisionCompanyUser(
  input: {
    name: string;
    email: string;
    tenantId: string;
    role?: MemberRole;
  },
  actor: { sub: string; ip?: string }
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const role: MemberRole = input.role && MEMBER_ROLES.includes(input.role) ? input.role : "AGENT";
  if (name.length < 2) {
    throw new AppError("Informe o nome completo.", 400, "INVALID_NAME");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("E-mail inválido.", 400, "INVALID_EMAIL");
  }

  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id: input.tenantId } }));

  // Unique(email) / Unique(tenantId,userId) are the source of truth.
  // After P2002 Postgres aborts the current tx (25P02) — never query it again.
  // Retry the whole transaction so the loser re-reads committed rows.
  const result = await runSerializableProvision(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    let createdUser = false;

    if (!user) {
      user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash: await hashPassword(randomBytes(32).toString("base64url") + "Aa1!"),
          status: "ACTIVE",
          isActive: true,
        },
      });
      createdUser = true;
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          tenantId: tenant.id,
          action: "user.created",
          entity: "user",
          entityId: user.id,
          metadata: { email, targetUserId: user.id },
          ip: actor.ip || null,
        },
      });
    }

    const existing = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    });
    if (existing) {
      throw new AppError("Este usuário já faz parte desta empresa.", 409, "MEMBERSHIP_ALREADY_EXISTS");
    }

    let membership;
    try {
      membership = await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role,
          status: "ACTIVE",
          isActive: true,
        },
      });
    } catch (err: unknown) {
      if (prismaErrorCode(err) === "P2002") {
        throw new AppError("Este usuário já faz parte desta empresa.", 409, "MEMBERSHIP_ALREADY_EXISTS");
      }
      throw err;
    }

    await tx.auditLog.create({
      data: {
        userId: actor.sub,
        tenantId: tenant.id,
        action: "membership.created",
        entity: "membership",
        entityId: membership.id,
        metadata: { targetUserId: user.id, role, reusedUser: !createdUser },
        ip: actor.ip || null,
      },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, status: user.status },
      membership: { id: membership.id, tenantId: membership.tenantId, role: membership.role },
      createdUser,
      reusedUser: !createdUser,
    };
  });

  if (result.createdUser) {
    await sendFirstAccessMail(email, result.user.id, "company").catch(() => null);
  }

  return result;
}

export async function provisionPlatformAdmin(
  input: { name: string; email: string },
  actor: { sub: string; ip?: string }
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (name.length < 2) {
    throw new AppError("Informe o nome completo.", 400, "INVALID_NAME");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("E-mail inválido.", 400, "INVALID_EMAIL");
  }

  const result = await runSerializableProvision(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    let createdUser = false;
    let promoted = false;

    if (!user) {
      user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash: await hashPassword(randomBytes(32).toString("base64url") + "Aa1!"),
          status: "ACTIVE",
          isActive: true,
          platformRole: "SUPERADMIN",
        },
      });
      createdUser = true;
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          action: "user.created",
          entity: "user",
          entityId: user.id,
          metadata: { email, targetUserId: user.id, platformRole: "SUPERADMIN" },
          ip: actor.ip || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          action: "user.superadmin_granted",
          entity: "user",
          entityId: user.id,
          metadata: { targetUserId: user.id, previousRole: null, nextRole: "SUPERADMIN" },
          ip: actor.ip || null,
        },
      });
    } else if (user.platformRole === "SUPERADMIN") {
      throw new AppError("Este usuário já é administrador da plataforma.", 409, "ALREADY_SUPERADMIN");
    } else {
      const previous = user.platformRole;
      user = await tx.user.update({
        where: { id: user.id },
        data: { platformRole: "SUPERADMIN" },
      });
      promoted = true;
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          action: "user.superadmin_granted",
          entity: "user",
          entityId: user.id,
          metadata: { targetUserId: user.id, previousRole: previous, nextRole: "SUPERADMIN" },
          ip: actor.ip || null,
        },
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        status: user.status,
      },
      createdUser,
      promoted,
    };
  });

  if (result.createdUser) {
    await sendFirstAccessMail(email, result.user.id, "platform").catch(() => null);
  }

  return result;
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
