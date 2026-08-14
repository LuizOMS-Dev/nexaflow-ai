-- AlterTable: Contact owner (responsible user) + list/filter indexes
-- Additive only: nullable column, FK ON DELETE SET NULL, no unique on phone

ALTER TABLE "Contact" ADD COLUMN "responsibleUserId" TEXT;

-- CreateIndex
CREATE INDEX "Contact_tenantId_responsibleUserId_idx" ON "Contact"("tenantId", "responsibleUserId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_commercialStatus_idx" ON "Contact"("tenantId", "commercialStatus");

-- CreateIndex
CREATE INDEX "Contact_tenantId_lastInteractionAt_idx" ON "Contact"("tenantId", "lastInteractionAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;