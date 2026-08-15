-- AlterTable: User (displayName, timezone)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'America/Sao_Paulo';

-- AlterTable: Membership (settings)
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "settings" JSONB;
