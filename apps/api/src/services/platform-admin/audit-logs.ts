import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { redactMetadata } from "../platform-log-redaction";

export async function listAuditLogs(q: {
  take: number;
  cursor?: string;
  search?: string;
  tenantId?: string;
}) {
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.search?.trim()
        ? {
            OR: [
              { action: { contains: q.search.trim(), mode: "insensitive" } },
              { entity: { contains: q.search.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: q.take,
    ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
  });
  return {
    items: logs.map((l) => ({ ...l, metadata: redactMetadata(l.metadata) })),
    nextCursor: logs.length === q.take ? logs[logs.length - 1]?.id ?? null : null,
  };
}

export async function clearTenantLogs(
  id: string,
  confirm: string,
  actor: { sub: string; ip?: string }
) {
  if (confirm.trim().toUpperCase() !== "LIMPAR") {
    throw new AppError("Confirme digitando LIMPAR para limpar os logs desta empresa.", 400, "CONFIRMATION_REQUIRED");
  }
  assertFound(await prisma.tenant.findUnique({ where: { id } }));
  const before = await prisma.auditLog.count({ where: { tenantId: id } });
  const deleted = await prisma.auditLog.deleteMany({ where: { tenantId: id } });
  await audit({
    userId: actor.sub,
    tenantId: id,
    action: "admin.tenant.logs.cleared",
    entity: "audit_log",
    entityId: id,
    metadata: { deletedCount: deleted.count, countBefore: before, scope: "tenant" },
    ip: actor.ip,
  });
  return {
    ok: true,
    deleted: deleted.count,
    message:
      deleted.count === 0
        ? "Não havia logs desta empresa."
        : `${deleted.count} log${deleted.count === 1 ? "" : "s"} da empresa removido${deleted.count === 1 ? "" : "s"}.`,
  };
}

export async function clearPlatformLogs(confirm: string, actor: { sub: string; ip?: string }) {
  if (confirm.trim().toUpperCase() !== "LIMPAR") {
    throw new AppError("Confirme digitando LIMPAR para limpar os logs de auditoria.", 400, "CONFIRMATION_REQUIRED");
  }
  const before = await prisma.auditLog.count();
  const deleted = await prisma.auditLog.deleteMany({});
  await audit({
    userId: actor.sub,
    action: "admin.logs.cleared",
    entity: "audit_log",
    metadata: { deletedCount: deleted.count, countBefore: before, scope: "all" },
    ip: actor.ip,
  });
  return {
    ok: true,
    deleted: deleted.count,
    message:
      deleted.count === 0
        ? "Não havia logs para limpar."
        : `${deleted.count} registro${deleted.count === 1 ? "" : "s"} de auditoria removido${deleted.count === 1 ? "" : "s"}.`,
  };
}
