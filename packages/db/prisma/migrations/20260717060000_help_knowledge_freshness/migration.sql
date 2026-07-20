-- Help Knowledge: seedKey estável + freshness / revisão
ALTER TABLE "HelpKnowledgeDoc" ADD COLUMN IF NOT EXISTS "seedKey" TEXT;
ALTER TABLE "HelpKnowledgeDoc" ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3);
ALTER TABLE "HelpKnowledgeDoc" ADD COLUMN IF NOT EXISTS "productVersion" TEXT;
ALTER TABLE "HelpKnowledgeDoc" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "HelpKnowledgeDoc_seedKey_key" ON "HelpKnowledgeDoc"("seedKey");
CREATE INDEX IF NOT EXISTS "HelpKnowledgeDoc_needsReview_idx" ON "HelpKnowledgeDoc"("needsReview");
