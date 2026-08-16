-- CreateTable: TenantCharge
CREATE TABLE IF NOT EXISTS "TenantCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCharge_pkey" PRIMARY KEY ("id")
);

-- Indexes for TenantCharge
CREATE INDEX IF NOT EXISTS "TenantCharge_tenantId_status_idx" ON "TenantCharge"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TenantCharge_tenantId_dueAt_idx" ON "TenantCharge"("tenantId", "dueAt");
CREATE INDEX IF NOT EXISTS "TenantCharge_tenantId_contactId_idx" ON "TenantCharge"("tenantId", "contactId");
CREATE INDEX IF NOT EXISTS "TenantCharge_tenantId_createdAt_idx" ON "TenantCharge"("tenantId", "createdAt");

-- Foreign Keys for TenantCharge
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TenantCharge_tenantId_fkey') THEN
    ALTER TABLE "TenantCharge" ADD CONSTRAINT "TenantCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TenantCharge_contactId_fkey') THEN
    ALTER TABLE "TenantCharge" ADD CONSTRAINT "TenantCharge_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TenantCharge_opportunityId_fkey') THEN
    ALTER TABLE "TenantCharge" ADD CONSTRAINT "TenantCharge_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: TenantCost
CREATE TABLE IF NOT EXISTS "TenantCost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'TOOLS',
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCost_pkey" PRIMARY KEY ("id")
);

-- Indexes for TenantCost
CREATE INDEX IF NOT EXISTS "TenantCost_tenantId_isActive_idx" ON "TenantCost"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "TenantCost_tenantId_category_idx" ON "TenantCost"("tenantId", "category");

-- Foreign Keys for TenantCost
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TenantCost_tenantId_fkey') THEN
    ALTER TABLE "TenantCost" ADD CONSTRAINT "TenantCost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable: PlatformOperationalCost
CREATE TABLE IF NOT EXISTS "PlatformOperationalCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'INFRASTRUCTURE',
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformOperationalCost_pkey" PRIMARY KEY ("id")
);

-- Indexes for PlatformOperationalCost
CREATE INDEX IF NOT EXISTS "PlatformOperationalCost_isActive_idx" ON "PlatformOperationalCost"("isActive");
CREATE INDEX IF NOT EXISTS "PlatformOperationalCost_category_idx" ON "PlatformOperationalCost"("category");
