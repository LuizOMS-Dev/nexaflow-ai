-- Tenant AI provider config (BYOK)
CREATE TABLE IF NOT EXISTS "TenantAiConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'groq',
    "model" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    "credentialMode" TEXT NOT NULL DEFAULT 'platform_managed',
    "apiKeyEnc" TEXT,
    "apiKeyLast4" TEXT,
    "baseUrl" TEXT,
    "fallbackProvider" TEXT,
    "fallbackModel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAiConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantAiConfig_tenantId_key" ON "TenantAiConfig"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantAiConfig_provider_idx" ON "TenantAiConfig"("provider");

DO $$ BEGIN
  ALTER TABLE "TenantAiConfig" ADD CONSTRAINT "TenantAiConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
