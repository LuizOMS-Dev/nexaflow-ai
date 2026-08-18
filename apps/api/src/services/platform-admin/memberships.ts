import type { MemberRole, MembershipStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";

export async function listTenantMembers(tenantId: string) {
  assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));

  const members = await prisma.membership.findMany({
    where: { tenantId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      role: true,
      status: true,
      isActive: true,
      settings: true,
      createdAt: true,
      updatedAt: true,
      user: {
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
          status: true,
          isActive: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return { items: members };
}

export async function addTenantMember(
  tenantId: string,
  body: {
    userId?: string;
    email?: string;
    role?: MemberRole;
  },
  actor: { sub: string; ip?: string }
) {
  assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));

  let targetUserId = body.userId;
  if (!targetUserId && body.email) {
    const u = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (!u) {
      throw new AppError(
        "Usuário não encontrado com o e-mail informado. O usuário precisa possuir conta na plataforma antes de ser adicionado.",
        404,
        "USER_NOT_FOUND"
      );
    }
    targetUserId = u.id;
  }

  if (!targetUserId) {
    throw new AppError("Informe o ID ou e-mail do usuário a ser adicionado.", 400, "MISSING_USER");
  }

  // Verifica se a membership já existe
  const existing = await prisma.membership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: targetUserId,
      },
    },
  });

  if (existing) {
    if (existing.status === "SUSPENDED" || !existing.isActive) {
      // Reativa membership existente
      const reхиted = await prisma.membership.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          isActive: true,
          role: body.role || existing.role,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await audit({
        userId: actor.sub,
        tenantId,
        action: "admin.membership.reactivated",
        entity: "membership",
        entityId: existing.id,
        metadata: { userId: targetUserId, role: reхиted.role },
        ip: actor.ip,
      });

      return reхиted;
    }

    throw new AppError(
      "Este usuário já é membro ativo desta empresa.",
      409,
      "MEMBERSHIP_ALREADY_EXISTS"
    );
  }

  const role: MemberRole = body.role || "AGENT";
  let created;
  try {
    created = await prisma.membership.create({
      data: {
        tenantId,
        userId: targetUserId,
        role,
        status: "ACTIVE",
        isActive: true,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      throw new AppError(
        "Este usuário já é membro desta empresa.",
        409,
        "MEMBERSHIP_ALREADY_EXISTS"
      );
    }
    throw err;
  }

  await audit({
    userId: actor.sub,
    tenantId,
    action: "admin.membership.created",
    entity: "membership",
    entityId: created.id,
    metadata: { userId: targetUserId, role },
    ip: actor.ip,
  });

  return created;
}

export async function updateTenantMemberRole(
  tenantId: string,
  membershipId: string,
  role: MemberRole,
  actor: { sub: string; ip?: string }
) {
  return prisma.$transaction(async (tx) => {
    const membership = assertFound(
      await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
      })
    );

    // Se o membro for ADMIN e estiver sendo rebaixado para outro papel:
    if (membership.role === "ADMIN" && role !== "ADMIN") {
      const activeAdmins = await tx.membership.count({
        where: {
          tenantId,
          role: "ADMIN",
          status: "ACTIVE",
          isActive: true,
          NOT: { id: membership.id },
        },
      });

      if (activeAdmins === 0) {
        throw new AppError(
          "Operação recusada: Não é possível rebaixar o único administrador ativo desta empresa.",
          400,
          "LAST_TENANT_ADMIN_PROTECTED"
        );
      }
    }

    const updated = await tx.membership.update({
      where: { id: membership.id },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.sub,
        tenantId,
        action: "admin.membership.role_changed",
        entity: "membership",
        entityId: membership.id,
        metadata: {
          targetUserId: membership.userId,
          previousRole: membership.role,
          nextRole: role,
        },
        ip: actor.ip || null,
      },
    });

    return updated;
  });
}

export async function toggleTenantMemberStatus(
  tenantId: string,
  membershipId: string,
  status: MembershipStatus,
  actor: { sub: string; ip?: string }
) {
  return prisma.$transaction(async (tx) => {
    const membership = assertFound(
      await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
      })
    );

    // Se o membro for ADMIN e estiver sendo suspenso:
    if (membership.role === "ADMIN" && status === "SUSPENDED") {
      const activeAdmins = await tx.membership.count({
        where: {
          tenantId,
          role: "ADMIN",
          status: "ACTIVE",
          isActive: true,
          NOT: { id: membership.id },
        },
      });

      if (activeAdmins === 0) {
        throw new AppError(
          "Operação recusada: Não é possível suspender o único administrador ativo desta empresa.",
          400,
          "LAST_TENANT_ADMIN_PROTECTED"
        );
      }
    }

    const isActive = status === "ACTIVE";
    const updated = await tx.membership.update({
      where: { id: membership.id },
      data: { status, isActive },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.sub,
        tenantId,
        action:
          status === "SUSPENDED"
            ? "admin.membership.suspended"
            : "admin.membership.reactivated",
        entity: "membership",
        entityId: membership.id,
        metadata: {
          targetUserId: membership.userId,
          status,
        },
        ip: actor.ip || null,
      },
    });

    return updated;
  });
}

export async function removeTenantMember(
  tenantId: string,
  membershipId: string,
  actor: { sub: string; ip?: string }
) {
  return prisma.$transaction(async (tx) => {
    const membership = assertFound(
      await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
      })
    );

    // Proteção concorrente: não permitir remover o último ADMIN ativo do tenant
    if (membership.role === "ADMIN" && (membership.status === "ACTIVE" && membership.isActive)) {
      const activeAdmins = await tx.membership.count({
        where: {
          tenantId,
          role: "ADMIN",
          status: "ACTIVE",
          isActive: true,
          NOT: { id: membership.id },
        },
      });

      if (activeAdmins === 0) {
        throw new AppError(
          "Operação recusada: Não é possível remover o único administrador ativo desta empresa.",
          400,
          "LAST_TENANT_ADMIN_PROTECTED"
        );
      }
    }

    // Exclui APENAS o vínculo Membership (NUNCA a conta User)
    await tx.membership.delete({ where: { id: membership.id } });

    await tx.auditLog.create({
      data: {
        userId: actor.sub,
        tenantId,
        action: "admin.membership.remove",
        entity: "membership",
        entityId: membership.id,
        metadata: {
          targetUserId: membership.userId,
          note: "Vínculo de membro removido da empresa. Conta de usuário global preservada intacta.",
        },
        ip: actor.ip || null,
      },
    });

    return {
      ok: true,
      message: "Vínculo removido com sucesso. A conta do usuário foi preservada.",
    };
  });
}
