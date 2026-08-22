import type { Prisma } from "@prisma/client";

type AccessUser = {
  tenantId?: string | null;
  role?: string | null;
  sub: string;
};

export type ConversationNavigationBucket =
  | "inbox"
  | "mine"
  | "waiting"
  | "ai"
  | "closed";

/**
 * Escopo de conversa do tenant.
 * AGENT só acessa as atribuídas a ele ou a fila (sem responsável).
 */
export function conversationAccessWhere(
  user: AccessUser,
  id?: string
): Prisma.ConversationWhereInput {
  const tenantId = user.tenantId!;
  if (user.role === "AGENT") {
    return {
      ...(id ? { id } : {}),
      tenantId,
      OR: [{ assignedToId: user.sub }, { assignedToId: null }],
    };
  }
  return {
    ...(id ? { id } : {}),
    tenantId,
  };
}

/**
 * Mantém os contadores da navegação alinhados às filas exibidas no Inbox.
 * O escopo de tenant/RBAC é sempre combinado com o filtro da fila.
 */
export function conversationNavigationWhere(
  user: AccessUser,
  bucket: ConversationNavigationBucket
): Prisma.ConversationWhereInput {
  const access = conversationAccessWhere(user);
  const bucketWhere: Record<ConversationNavigationBucket, Prisma.ConversationWhereInput> = {
    inbox: { status: "OPEN" },
    mine: {
      assignedToId: user.sub,
      status: { in: ["OPEN", "PENDING"] },
    },
    waiting: { status: "PENDING", assignedToId: null },
    ai: { status: "OPEN", assignedToId: null },
    closed: { status: "CLOSED" },
  };

  return { AND: [access, bucketWhere[bucket]] };
}
