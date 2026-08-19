-- Groq Llama 3.1/3.3 saíram de linha; default de produção atual.
ALTER TABLE "TenantAiConfig" ALTER COLUMN "model" SET DEFAULT 'openai/gpt-oss-20b';
ALTER TABLE "AiAgent" ALTER COLUMN "model" SET DEFAULT 'openai/gpt-oss-20b';

-- Idempotência de webhook: lookup por provider message id.
CREATE INDEX IF NOT EXISTS "Message_externalId_idx" ON "Message"("externalId");
