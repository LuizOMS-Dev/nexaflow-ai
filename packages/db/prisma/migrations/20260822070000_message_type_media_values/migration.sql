-- Keep the database enum aligned with MessageType in schema.prisma.
-- These values are used by voice messages, generic file attachments and
-- internal notes. IF NOT EXISTS keeps the migration safe on databases that
-- were previously synchronized with `prisma db push`.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VOICE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'NOTE';
