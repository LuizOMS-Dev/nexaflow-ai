import { AuditService } from "../audit";

export async function listAuditLogs(q: {
  take: number;
  cursor?: string;
  search?: string;
  category?: string;
  severity?: string;
  tenantId?: string;
}) {
  return AuditService.list(q);
}

export async function clearTenantLogs(
  id: string,
  confirm: string,
  actor: { sub: string; ip?: string }
) {
  return AuditService.clearTenantLogs({
    tenantId: id,
    confirm,
    userId: actor.sub,
    ip: actor.ip,
  });
}

export async function clearPlatformLogs(confirm: string, actor: { sub: string; ip?: string }) {
  return AuditService.clearPlatformLogs({
    confirm,
    userId: actor.sub,
    ip: actor.ip,
  });
}
