import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

/** Impede dois canais do mesmo tenant com o mesmo externalId (instance/session). */
export async function assertChannelExternalIdFree(
  tenantId: string,
  externalId: string | null | undefined,
  exceptId?: string
) {
  const id = (externalId || "").trim();
  if (!id) return;
  const existing = await prisma.channel.findFirst({
    where: {
      tenantId,
      externalId: id,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      "Já existe um canal com este identificador nesta empresa.",
      409,
      "CHANNEL_EXTERNAL_ID_TAKEN"
    );
  }
}
