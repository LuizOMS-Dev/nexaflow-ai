-- Remove WON do enum SalesLeadStatus: converte leads WON em CONVERTED antes de dropar o valor.
UPDATE "SalesLead" SET "status" = 'CONVERTED' WHERE "status" = 'WON';

-- Recreate enum sem WON
ALTER TYPE "SalesLeadStatus" RENAME TO "SalesLeadStatus_old";
CREATE TYPE "SalesLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'SPAM');

-- Migra a coluna para o novo tipo
ALTER TABLE "SalesLead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SalesLead" ALTER COLUMN "status" TYPE "SalesLeadStatus" USING "status"::text::"SalesLeadStatus";
ALTER TABLE "SalesLead" ALTER COLUMN "status" SET DEFAULT 'NEW';

DROP TYPE "SalesLeadStatus_old";