-- Assistente NexaFlow (plataforma) — Help Knowledge + threads + gaps
-- Separado de KnowledgeDoc / Conversation do tenant.

CREATE TABLE IF NOT EXISTS "HelpKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HelpKnowledgeDoc_status_idx" ON "HelpKnowledgeDoc"("status");
CREATE INDEX IF NOT EXISTS "HelpKnowledgeDoc_category_idx" ON "HelpKnowledgeDoc"("category");

CREATE TABLE IF NOT EXISTS "HelpAssistantThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpAssistantThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HelpAssistantThread_userId_updatedAt_idx" ON "HelpAssistantThread"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "HelpAssistantThread_tenantId_idx" ON "HelpAssistantThread"("tenantId");

CREATE TABLE IF NOT EXISTS "HelpAssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "feedback" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpAssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HelpAssistantMessage_threadId_createdAt_idx" ON "HelpAssistantMessage"("threadId", "createdAt");

ALTER TABLE "HelpAssistantMessage"
  DROP CONSTRAINT IF EXISTS "HelpAssistantMessage_threadId_fkey";
ALTER TABLE "HelpAssistantMessage"
  ADD CONSTRAINT "HelpAssistantMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "HelpAssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HelpKnowledgeGap" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "route" TEXT,
    "reason" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpKnowledgeGap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HelpKnowledgeGap_status_lastSeenAt_idx" ON "HelpKnowledgeGap"("status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "HelpKnowledgeGap_tenantId_idx" ON "HelpKnowledgeGap"("tenantId");
