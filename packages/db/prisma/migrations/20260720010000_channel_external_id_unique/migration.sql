-- Unique (tenantId, externalId) only when there are no duplicates.
-- Multiple NULLs remain allowed (PostgreSQL UNIQUE).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Channel"
    WHERE "externalId" IS NOT NULL
    GROUP BY "tenantId", "externalId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Channel (tenantId, externalId) has duplicates; unique index skipped';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Channel_tenantId_externalId_key"
      ON "Channel" ("tenantId", "externalId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Opportunity_tenantId_status_idx"
  ON "Opportunity" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Task_tenantId_assigneeId_idx"
  ON "Task" ("tenantId", "assigneeId");
