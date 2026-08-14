#!/bin/sh
set -e

echo "[nexaflow-api] Aguardando banco..."
sleep 2

echo "[nexaflow-api] Prisma generate..."
npx prisma generate --schema=packages/db/prisma/schema.prisma

echo "[nexaflow-api] Aplicando migrações versionadas..."
# Produção é fail-closed: nunca usar db push/accept-data-loss automaticamente.
# Banco legado deve receber baseline manual antes do primeiro deploy.
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

if [ "${RUN_SEED_ON_BOOT:-0}" = "1" ]; then
  echo "[nexaflow-api] Seed explícito (RUN_SEED_ON_BOOT=1)..."
  cd packages/db
  npx tsx prisma/seed.ts
  cd /app
else
  echo "[nexaflow-api] Seed automático desativado."
fi

echo "[nexaflow-api] Iniciando API..."
exec node apps/api/dist/index.js
