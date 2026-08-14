FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl wget

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN npm install --workspace=@nexaflow/api --workspace=@nexaflow/db

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY packages/db ./packages/db
COPY apps/api ./apps/api
ENV DATABASE_URL="postgresql://nexaflow:nexaflow@postgres:5432/nexaflow?schema=public"
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
# Compila @nexaflow/db (official-plans + exports) antes da API
RUN npm run build -w @nexaflow/db
RUN npm run build -w @nexaflow/api

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

RUN sed -i 's/\r$//' ./apps/api/docker-entrypoint.sh \
  && chmod +x ./apps/api/docker-entrypoint.sh \
  && mkdir -p /app/uploads /app/data/wa-sessions

EXPOSE 4000
ENTRYPOINT ["sh", "./apps/api/docker-entrypoint.sh"]
