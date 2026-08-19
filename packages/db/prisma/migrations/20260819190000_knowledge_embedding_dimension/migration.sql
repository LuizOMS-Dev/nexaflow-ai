ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embeddingDimension" INTEGER;
