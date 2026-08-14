import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { testUserEmailFilter } from "./fixtures";

export async function listUsers(q: {
  search?: string;
  scope?: "all" | "companies" | "platform";
  status?: string;
  page: number;
  limit: number;
}) {
  const where: Prisma.UserWhereInput = {
    NOT: testUserEmailFilter(),
  };
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { email: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
    ];
  }
  if (q.status && q.status !== "ALL") {
    where.status = q.status as Prisma.EnumUserStatusFilter;
  }
  if (q.scope === "platform") {
    where.platformRole = "SUPERADMIN";
  } else if (q.scope === "companies") {
    where.AND = [{ memberships: { some: {} } }, { NOT: { platformRole: "SUPERADMIN" } }];
  }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
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
            isActive: true,
            tenant: { select: { id: true, name: true, slug: true } },
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

export async function updateUserStatus(
  id: string,
  body: {
    status: "ACTIVE" | "SUSPENDED" | "DISABLED" | "INVITED" | "PENDING_VERIFICATION";
    reason?: string;
  },
  actor: { sub: string; ip?: string }
) {
  const target = assertFound(await prisma.user.findUnique({ where: { id } }));
  if (target.platformRole === "SUPERADMIN" && target.id === actor.sub) {
    throw new AppError("Não é possível alterar o status da própria conta Superadmin.", 400);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: body.status,
      isActive: body.status === "ACTIVE" || body.status === "INVITED",
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

  await audit({
    userId: actor.sub,
    action:
      body.status === "DISABLED"
        ? "user.blocked"
        : body.status === "SUSPENDED"
          ? "user.suspended"
          : body.status === "ACTIVE"
            ? "user.reactivated"
            : "user.status_updated",
    entity: "user",
    entityId: id,
    metadata: { status: body.status, reason: body.reason || null, prev: target.status },
    ip: actor.ip,
  });

  return updated;
}
