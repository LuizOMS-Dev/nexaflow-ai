-- Hard delete Contact: detach tasks instead of blocking (Restrict default)
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_contactId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Task_contactId_idx" ON "Task"("contactId");
