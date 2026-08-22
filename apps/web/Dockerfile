FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
# workspaces hoists deps to root node_modules
RUN npm install --workspace=@nexaflow/web

FROM base AS build
ARG NEXT_PUBLIC_API_URL=/nexa-api
ARG NEXT_PUBLIC_APP_NAME=NexaFlow
ARG NEXT_PUBLIC_WS_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1
# next.config.ts gera o artefato copiado pelo estágio runner apenas em builds Docker.
ENV DOCKER_BUILD=1

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY apps/web ./apps/web

# ensure workspace package is visible
WORKDIR /app
RUN npm run build -w @nexaflow/web

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN apk add --no-cache wget

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=40s \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
