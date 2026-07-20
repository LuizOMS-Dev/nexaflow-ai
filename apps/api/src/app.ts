import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { randomUUID } from "crypto";
import { env } from "./lib/env";
import { AppError } from "./lib/errors";
import authPlugin from "./plugins/auth";
import { authRoutes } from "./routes/auth";
import { contactRoutes } from "./routes/contacts";
import { conversationRoutes } from "./routes/conversations";
import { crmRoutes } from "./routes/crm";
import { taskRoutes } from "./routes/tasks";
import { aiAgentRoutes } from "./routes/ai-agents";
import { agentAdvancedRoutes } from "./routes/agent-advanced";
import { miscRoutes } from "./routes/misc";
import { adminRoutes, impersonationStopRoutes } from "./routes/admin";
import { whatsappRoutes } from "./routes/whatsapp";
import { integrationRoutes } from "./routes/integrations";
import { publicApiV1Routes } from "./routes/public-api-v1";
import { marketingRoutes } from "./routes/marketing";
import { addClient, removeClient } from "./ws/hub";
import { sanitizeRequestUrl } from "./lib/logger";

function parseCorsOrigins(): string[] | true {
  const raw = env.corsOrigin || "";
  if (raw === "*") {
    // Nunca * com credentials em produção
    if (env.nodeEnv === "production") return ["https://app.nexaflow.ai"];
    return true;
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function buildApp() {
  // trustProxy: em prod só loopback/proxies conhecidos (não true indiscriminado)
  const trustProxy =
    env.trustProxy === "true"
      ? true
      : env.trustProxy === "false"
        ? false
        : env.trustProxy === "loopback"
          ? "loopback"
          : env.trustProxy;

  const app = Fastify({
    logger: {
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
        censor: "[redacted]",
      },
      serializers: {
        req(request) {
          const rawUrl = request.url || "";
          const safeUrl = sanitizeRequestUrl(rawUrl);
          return {
            method: request.method,
            url: safeUrl,
            host: request.headers.host,
            remoteAddress: request.socket.remoteAddress,
            remotePort: request.socket.remotePort,
          };
        },
      },
    },
    trustProxy,
    bodyLimit: env.bodyLimitBytes,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy:
      env.nodeEnv === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
    hsts: env.nodeEnv === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  await app.register(cookie, {
    secret: env.cookieSecret,
    parseOptions: {},
  });

  const origins = parseCorsOrigins();
  await app.register(cors, {
    origin: origins === true ? true : origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Request-Id"],
  });

  // CSRF: Origin/Referer em mutações (defense-in-depth além do CORS)
  const { registerCsrfGuard } = await import("./services/security/csrf");
  registerCsrfGuard(app);

  // Rate limit global — Redis quando disponível; memória só se permitido
  {
    const rateLimitOpts: {
      max: number;
      timeWindow: string;
      redis?: import("ioredis").default;
      nameSpace?: string;
    } = {
      max: 300,
      timeWindow: "1 minute",
    };
    try {
      const { getRedis, isRedisCritical } = await import("./services/security/redis");
      const redis = await getRedis();
      if (redis) {
        rateLimitOpts.redis = redis;
        rateLimitOpts.nameSpace = "nexa-rl-";
        app.log.info("rate-limit: using Redis store");
      } else if (isRedisCritical()) {
        app.log.error("rate-limit: Redis CRITICAL unavailable — bootstrap should have failed");
      } else {
        app.log.info("rate-limit: using in-memory store");
      }
    } catch (err) {
      app.log.warn({ err }, "rate-limit: Redis unavailable, using memory (dev only)");
    }
    await app.register(rateLimit, rateLimitOpts);
  }

  await app.register(websocket);
  await app.register(authPlugin);

  // Storage local de avatares (só arquivos com nome aleatório sob /media/avatars)
  {
    const path = await import("path");
    const fs = await import("fs");
    const { env: appEnv } = await import("./lib/env");
    const avatarsRoot = path.resolve(appEnv.storagePath, "avatars");
    fs.mkdirSync(avatarsRoot, { recursive: true });
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, {
      root: avatarsRoot,
      prefix: "/media/avatars/",
      decorateReply: false,
      // cache curto — nomes são opacos
      maxAge: 86_400_000,
      setHeaders(reply) {
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("Cache-Control", "public, max-age=86400");
      },
    });
  }

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Dados inválidos",
        requestId,
        details: env.nodeEnv === "production" ? undefined : error.flatten(),
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        requestId,
      });
    }
    // rate limit do @fastify/rate-limit
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: "RATE_LIMITED",
        message: "Muitas requisições. Aguarde um momento.",
        requestId,
      });
    }
    const clientStatus = (error as { statusCode?: number }).statusCode;
    if (clientStatus && clientStatus >= 400 && clientStatus < 500) {
      request.log.warn({ err: error, requestId }, "client request rejected");
      return reply.status(clientStatus).send({
        error: clientStatus === 400 ? "BAD_REQUEST" : "REQUEST_REJECTED",
        message: clientStatus === 400 ? "Requisição inválida" : "Requisição rejeitada",
        requestId,
      });
    }
    request.log.error({ err: error, requestId }, "unhandled error");
    return reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "Erro interno do servidor",
      requestId,
    });
  });

  /** Liveness — processo responde (não prova dependências). */
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "nexaflow-api",
      time: new Date().toISOString(),
      env: env.nodeEnv,
    };
  });

  app.get("/health/live", async () => {
    return { status: "alive", service: "nexaflow-api", time: new Date().toISOString() };
  });

  /**
   * Readiness — dependências CRITICAL ok.
   * Tiers: CRITICAL (derruba ready) | DEGRADED (aviso) | OPTIONAL (info).
   */
  app.get("/health/ready", async (_request, reply) => {
    const { getAiStatus } = await import("./services/ai");
    const { getMailStatus } = await import("./services/security/mail");
    const { isWaGatewayReady } = await import("./lib/env");
    const { isRedisCritical } = await import("./services/security/redis");
    const { prisma } = await import("./lib/prisma");

    let dbOk = false;
    let dbError: string | undefined;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      dbError = err instanceof Error ? err.message.slice(0, 120) : "db_error";
    }

    let redisOk: boolean | null = null;
    try {
      const { getRedis, shouldUseRedis } = await import("./services/security/redis");
      if (!shouldUseRedis()) {
        redisOk = null; // desligado de propósito
      } else {
        const redis = await getRedis();
        if (redis) {
          const pong = await redis.ping();
          redisOk = pong === "PONG";
        } else {
          redisOk = false;
        }
      }
    } catch {
      redisOk = false;
    }

    const mail = getMailStatus();
    const redisCritical = isRedisCritical();
    const redisBlocks = redisCritical && redisOk === false;
    const ready = dbOk && !redisBlocks;

    const body = {
      status: ready ? "ready" : "not_ready",
      service: "nexaflow-api",
      time: new Date().toISOString(),
      architecture: "single-node",
      checks: {
        database: {
          ok: dbOk,
          tier: "CRITICAL" as const,
          error: dbError,
        },
        redis: {
          ok: redisOk,
          tier: redisCritical ? ("CRITICAL" as const) : ("OPTIONAL" as const),
        },
        mail: {
          ...mail,
          tier: "OPTIONAL" as const,
        },
        whatsappGateway: {
          provider: env.waGatewayProvider,
          ready: isWaGatewayReady(),
          tier: "OPTIONAL" as const,
        },
        ai: {
          ...getAiStatus(),
          tier: "OPTIONAL" as const,
        },
        superadminMfaRequired: {
          ok: env.superadminMfaRequired || env.nodeEnv !== "production",
          value: env.superadminMfaRequired,
          tier: env.nodeEnv === "production" ? ("CRITICAL" as const) : ("OPTIONAL" as const),
        },
      },
    };

    return reply.status(ready ? 200 : 503).send(body);
  });

  app.get("/", async () => ({
    name: "NexaFlow AI API",
    version: "1.0.0",
    docs: "/health",
    ready: "/health/ready",
  }));

  await app.register(authRoutes);
  // Site público: catálogo comercial e pedidos de demonstração.
  await app.register(marketingRoutes);
  // API pública (API key) — sem JWT de sessão
  await app.register(publicApiV1Routes);
  await app.register(contactRoutes);
  await app.register(conversationRoutes);
  await app.register(crmRoutes);
  await app.register(taskRoutes);
  await app.register(aiAgentRoutes);
  await app.register(agentAdvancedRoutes);
  await app.register(miscRoutes);
  await app.register(integrationRoutes);
  await app.register(whatsappRoutes);
  await app.register(impersonationStopRoutes);
  await app.register(adminRoutes);
  // Assistente NexaFlow (ajuda da plataforma — separado dos agentes do tenant)
  const { nexaflowAssistantRoutes } = await import("./routes/nexaflow-assistant");
  await app.register(nexaflowAssistantRoutes);
  // Novidades / changelog + diagnóstico superadmin
  const { platformChangelogRoutes } = await import("./routes/platform-changelog");
  await app.register(platformChangelogRoutes);
  const { platformDiagnosticsRoutes } = await import("./routes/platform-diagnostics");
  await app.register(platformDiagnosticsRoutes);
  const { tenantAiRoutes } = await import("./routes/tenant-ai");
  await app.register(tenantAiRoutes);

  app.get("/ws", { websocket: true }, (socket, request) => {
    let client: {
      socket: typeof socket;
      userId: string;
      tenantId?: string | null;
      sessionId?: string | null;
    } | null = null;

    const authWithToken = async (token: string) => {
      let payload: {
        sub: string;
        tenantId?: string | null;
        sid?: string;
        jti?: string;
        iss?: string;
        aud?: string | string[];
      };
      try {
        payload = app.jwt.verify(token) as typeof payload;
      } catch {
        socket.send(JSON.stringify({ event: "error", payload: { code: "UNAUTHORIZED" } }));
        socket.close();
        return;
      }
      if (payload.iss && payload.iss !== env.jwtIssuer) {
        socket.close();
        return;
      }
      const sid = payload.sid || payload.jti;
      if (sid) {
        const { getValidSessionById } = await import("./services/security/session");
        const session = await getValidSessionById(sid);
        if (!session) {
          socket.send(JSON.stringify({ event: "error", payload: { code: "SESSION_REVOKED" } }));
          socket.close();
          return;
        }
        // tenant SEMPRE da sessão, nunca do cliente
        payload.tenantId = session.tenantId;
      }
      if (client) removeClient(client);
      client = {
        socket,
        userId: payload.sub,
        tenantId: payload.tenantId,
        sessionId: sid || null,
      };
      addClient(client);
      socket.send(
        JSON.stringify({
          event: "connected",
          payload: { userId: payload.sub, tenantId: payload.tenantId },
        })
      );
    };

    try {
      const host = request.headers.host || "localhost";
      const url = new URL(request.url, `http://${host}`);
      const qToken = url.searchParams.get("token");
      if (qToken) void authWithToken(qToken);
    } catch {
      /* espera mensagem auth */
    }

    socket.on("message", async (raw) => {
      try {
        // Limite de tamanho de mensagem WS
        const text = raw.toString();
        if (text.length > 16_384) return;
        const data = JSON.parse(text) as { type: string; token?: string };
        if (data.type === "auth" && data.token) {
          await authWithToken(data.token);
        }
      } catch {
        /* ignore */
      }
    });

    socket.on("close", () => {
      if (client) removeClient(client);
    });
  });

  return app;
}
