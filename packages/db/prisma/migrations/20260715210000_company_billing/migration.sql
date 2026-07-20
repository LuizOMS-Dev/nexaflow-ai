-- Tenant operational statuses: block + soft-delete request
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'PENDING_DELETION';

-- Subscription billing day + index for due dates
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingDueDay" INTEGER;
CREATE INDEX IF NOT EXISTS "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- Manual payments ledger
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "referencePeriod" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");
CREATE INDEX IF NOT EXISTS "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
