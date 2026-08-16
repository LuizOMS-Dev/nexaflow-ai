-- AlterEnum: Add CONVERTED to SalesLeadStatus if not exists
DO $$ BEGIN
  ALTER TYPE "SalesLeadStatus" ADD VALUE IF NOT EXISTS 'CONVERTED' BEFORE 'WON';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: Add convertedTenantId column to SalesLead
ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "convertedTenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesLead_convertedTenantId_idx" ON "SalesLead"("convertedTenantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesLead_convertedTenantId_fkey') THEN
    ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_convertedTenantId_fkey" FOREIGN KEY ("convertedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
