-- Knowledge: vínculos com agentes, escopo, sincronização SYSTEM
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3);

-- Normaliza status/fonte legados
UPDATE "KnowledgeDoc" SET "status" = 'ready' WHERE "status" IS NULL OR "status" = '' OR "status" = 'published';
UPDATE "KnowledgeDoc" SET "sourceType" = 'manual' WHERE "sourceType" IS NULL OR "sourceType" = '' OR "sourceType" = 'text';
UPDATE "KnowledgeDoc" SET "sourceType" = 'system'
  WHERE "title" ILIKE '%Catálogo comercial%' OR "title" ILIKE 'Planos e preços%';

CREATE INDEX IF NOT EXISTS "KnowledgeDoc_tenantId_status_idx" ON "KnowledgeDoc"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "KnowledgeDoc_tenantId_sourceType_idx" ON "KnowledgeDoc"("tenantId", "sourceType");

CREATE TABLE IF NOT EXISTS "AgentKnowledge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "knowledgeDocId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentKnowledge_knowledgeDocId_agentId_key"
  ON "AgentKnowledge"("knowledgeDocId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentKnowledge_tenantId_agentId_idx"
  ON "AgentKnowledge"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentKnowledge_tenantId_knowledgeDocId_idx"
  ON "AgentKnowledge"("tenantId", "knowledgeDocId");

DO $$ BEGIN
  ALTER TABLE "AgentKnowledge"
    ADD CONSTRAINT "AgentKnowledge_knowledgeDocId_fkey"
    FOREIGN KEY ("knowledgeDocId") REFERENCES "KnowledgeDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentKnowledge"
    ADD CONSTRAINT "AgentKnowledge_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
