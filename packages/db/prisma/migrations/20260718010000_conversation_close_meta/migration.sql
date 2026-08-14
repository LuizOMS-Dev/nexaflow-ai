-- Encerramento de atendimento: motivo/fonte persistidos (sem apagar histórico)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "closeSource" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "closedById" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "closeNote" TEXT;

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_status_lastMessageAt_idx"
  ON "Conversation"("tenantId", "status", "lastMessageAt");
