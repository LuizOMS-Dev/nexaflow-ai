-- Agentes 2.0: tools, versions, learning, tests

CREATE TYPE "AgentPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "KnowledgeGapStatus" AS ENUM ('NEW', 'REVIEWING', 'RESOLVED', 'IGNORED');
CREATE TYPE "LearningSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "AgentToolExecStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'REJECTED', 'NEEDS_APPROVAL');
CREATE TYPE "AgentTestResult" AS ENUM ('PASS', 'FAIL', 'WARNING', 'SKIPPED');

ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "publishStatus" "AgentPublishStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "draftSnapshot" JSONB;

CREATE TABLE IF NOT EXISTS "AgentVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentToolExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "contactId" TEXT,
    "toolName" TEXT NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "status" "AgentToolExecStatus" NOT NULL DEFAULT 'PENDING',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AgentToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeGap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "question" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "status" "KnowledgeGapStatus" NOT NULL DEFAULT 'NEW',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeGap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LearningSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "status" "LearningSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentTestCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expectations" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTestCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentTestRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "result" "AgentTestResult" NOT NULL,
    "reply" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");
CREATE INDEX IF NOT EXISTS "AgentVersion_tenantId_agentId_idx" ON "AgentVersion"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentToolExecution_tenantId_createdAt_idx" ON "AgentToolExecution"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentToolExecution_tenantId_agentId_idx" ON "AgentToolExecution"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentToolExecution_conversationId_idx" ON "AgentToolExecution"("conversationId");
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeGap_tenantId_normalizedKey_key" ON "KnowledgeGap"("tenantId", "normalizedKey");
CREATE INDEX IF NOT EXISTS "KnowledgeGap_tenantId_status_idx" ON "KnowledgeGap"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "KnowledgeGap_tenantId_agentId_idx" ON "KnowledgeGap"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "LearningSuggestion_tenantId_status_idx" ON "LearningSuggestion"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "LearningSuggestion_tenantId_agentId_idx" ON "LearningSuggestion"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentFeedback_tenantId_createdAt_idx" ON "AgentFeedback"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentFeedback_tenantId_agentId_idx" ON "AgentFeedback"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentTestCase_tenantId_agentId_idx" ON "AgentTestCase"("tenantId", "agentId");
CREATE INDEX IF NOT EXISTS "AgentTestRun_tenantId_agentId_createdAt_idx" ON "AgentTestRun"("tenantId", "agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiAgent_tenantId_publishStatus_idx" ON "AiAgent"("tenantId", "publishStatus");

ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolExecution" ADD CONSTRAINT "AgentToolExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolExecution" ADD CONSTRAINT "AgentToolExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGap" ADD CONSTRAINT "KnowledgeGap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGap" ADD CONSTRAINT "KnowledgeGap_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearningSuggestion" ADD CONSTRAINT "LearningSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningSuggestion" ADD CONSTRAINT "LearningSuggestion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTestCase" ADD CONSTRAINT "AgentTestCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTestCase" ADD CONSTRAINT "AgentTestCase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "AgentTestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
