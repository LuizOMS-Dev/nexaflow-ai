import type { Prisma } from "@prisma/client";

type AccessUser = {
  tenantId?: string | null;
  role?: string | null;
  sub: string;
};

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
