-- Exclusão de empresa: data persistida para o worker (nunca setTimeout por tenant).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "scheduledDeletionAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "deletionPreviousStatus" "TenantStatus";

CREATE INDEX IF NOT EXISTS "Tenant_scheduledDeletionAt_idx" ON "Tenant"("scheduledDeletionAt");
CREATE INDEX IF NOT EXISTS "Tenant_status_scheduledDeletionAt_idx" ON "Tenant"("status", "scheduledDeletionAt");
