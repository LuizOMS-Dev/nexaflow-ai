-- Contact list filters (Contatos 3.0): archived (stage) + priority
-- Additive only: composite indexes, no unique on phone/email, no FK/column changes

-- CreateIndex
CREATE INDEX "Contact_tenantId_stage_idx" ON "Contact"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "Contact_tenantId_priority_idx" ON "Contact"("tenantId", "priority");
