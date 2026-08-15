#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then DBSET=set; else DBSET=MISSING; fi
if [ -n "$REDIS_URL" ]; then RDSET=set; else RDSET=MISSING; fi
if [ -n "$JWT_SECRET" ]; then JWSET=set; else JWSET=MISSING; fi
echo "[nexaflow-api] NODE_ENV=${NODE_ENV:-?} DATABASE_URL=$DBSET REDIS_URL=$RDSET JWT=$JWSET"

echo "[nexaflow-api] Aguardando banco..."
sleep 2

echo "[nexaflow-api] Prisma generate..."
npx prisma generate --schema=packages/db/prisma/schema.prisma

echo "[nexaflow-api] Aplicando migrações versionadas..."
# Produção é fail-closed: nunca usar db push/accept-data-loss automaticamente.
# Banco legado deve receber baseline manual antes do primeiro deploy.
if ! npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma; then
  echo "[nexaflow-api] migrate deploy FALHOU — ver logs acima"
  if [ "${ALLOW_INSECURE_BOOT:-0}" = "1" ]; then
    echo "[nexaflow-api] ALLOW_INSECURE_BOOT=1, seguindo para diagnóstico"
  else
    exit 1
  fi
fi

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
