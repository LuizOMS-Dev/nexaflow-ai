-- Marca usuários criados com senha temporária para troca obrigatória no primeiro login.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
