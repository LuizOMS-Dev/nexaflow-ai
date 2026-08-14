import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export async function audit(params: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId || null,
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: asInputJson(params.metadata || {}),
        ip: params.ip,
      },
    });
  } catch {
    // não interrompe fluxo principal
  }
}
