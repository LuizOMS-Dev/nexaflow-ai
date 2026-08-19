-- Knowledge document ingest metadata (PDF/hash/status/embeddings)
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "byteSize" INTEGER;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "storagePath" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "embeddingProvider" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "embeddingVersion" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeDoc_tenantId_contentHash_idx" ON "KnowledgeDoc"("tenantId", "contentHash");

-- Chunk metadata for retrieval
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "chunkIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "tokenCount" INTEGER;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embeddingVersion" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_docId_chunkIndex_idx" ON "KnowledgeChunk"("docId", "chunkIndex");

-- Conversation memory (per atendimento, not ContactMemory)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "memorySummary" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "memoryVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastMemoryMessageId" TEXT;

-- AI execution observability (no prompts / no secrets)
CREATE TABLE IF NOT EXISTS "AiExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "agentVersionId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(12,6),
    "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    "toolCallsCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "purpose" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiExecution_tenantId_createdAt_idx" ON "AiExecution"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiExecution_tenantId_conversationId_idx" ON "AiExecution"("tenantId", "conversationId");
CREATE INDEX IF NOT EXISTS "AiExecution_tenantId_agentId_idx" ON "AiExecution"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AiExecution_correlationId_idx" ON "AiExecution"("correlationId");
CREATE INDEX IF NOT EXISTS "AiExecution_tenantId_status_idx" ON "AiExecution"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiExecution_tenantId_fkey'
  ) THEN
    ALTER TABLE "AiExecution"
      ADD CONSTRAINT "AiExecution_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
