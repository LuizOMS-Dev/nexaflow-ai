-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT,
    "tradeName" TEXT,
    "cnpj" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "segment" TEXT,
    "city" TEXT,
    "state" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- AlterTable Membership
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyProfile_tenantId_key" ON "CompanyProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "CompanyProfile_legalName_idx" ON "CompanyProfile"("legalName");
CREATE INDEX IF NOT EXISTS "CompanyProfile_tradeName_idx" ON "CompanyProfile"("tradeName");
CREATE INDEX IF NOT EXISTS "CompanyProfile_cnpj_idx" ON "CompanyProfile"("cnpj");
CREATE INDEX IF NOT EXISTS "CompanyProfile_city_state_idx" ON "CompanyProfile"("city", "state");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Membership_tenantId_status_idx" ON "Membership"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Payment_idempotencyKey_idx" ON "Payment"("idempotencyKey");

-- CreateIndex Subscription
CREATE INDEX IF NOT EXISTS "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- AddForeignKey CompanyProfile
ALTER TABLE "CompanyProfile" DROP CONSTRAINT IF EXISTS "CompanyProfile_tenantId_fkey";
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Subscription -> Tenant with RESTRICT (preservação histórica fiscal/financeira)
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_tenantId_fkey";
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
