/**
 * API pública programática /api/v1/*
 * Auth: Bearer nxf_live_… — tenant derivado da chave (nunca do body).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import {
  authenticateApiKey,
  hasScope,
  logApiUsage,
} from "../services/api-keys";
import { emitWebhookEvent } from "../services/webhooks/dispatch";
import { checkApiKeyRateLimit } from "../services/security/api-rate-limit";

type ApiAuth = {
  apiKeyId: string;
  tenantId: string;
  scopes: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    apiAuth?: ApiAuth;
  }
}

function publicError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

export async function publicApiV1Routes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    // só rotas deste plugin
    if (!request.url.startsWith("/api/v1")) return;

    const started = Date.now();
    const auth = await authenticateApiKey(request.headers.authorization);
    if (!auth) {
      await logApiUsage({
        tenantId: "unknown",
        method: request.method,
        path: request.url.split("?")[0].slice(0, 200),
        statusCode: 401,
        durationMs: Date.now() - started,
        ip: request.ip,
      });
      return publicError(reply, 401, "UNAUTHORIZED", "Chave de API inválida ou ausente.");
    }
    request.apiAuth = auth;

    // rate limit por chave — Redis quando disponível (fallback memória local)
    const ok = await checkApiKeyRateLimit(auth.apiKeyId, 120, 60);
    if (!ok) {
      await logApiUsage({
        tenantId: auth.tenantId,
        apiKeyId: auth.apiKeyId,
        method: request.method,
        path: request.url.split("?")[0].slice(0, 200),
        statusCode: 429,
        durationMs: Date.now() - started,
        ip: request.ip,
      });
      return publicError(
        reply,
        429,
        "RATE_LIMITED",
        "Limite de requisições excedido. Tente novamente em instantes."
      );
    }

    // log no onResponse
    reply.raw.on("finish", () => {
      void logApiUsage({
        tenantId: auth.tenantId,
        apiKeyId: auth.apiKeyId,
        method: request.method,
        path: request.url.split("?")[0].slice(0, 200),
        statusCode: reply.statusCode || 200,
        durationMs: Date.now() - started,
        ip: request.ip,
      });
    });
  });

  function requireScope(request: FastifyRequest, scope: string) {
    const auth = request.apiAuth!;
    if (!hasScope(auth.scopes, scope)) {
      throw new AppError("Escopo insuficiente para esta operação.", 403, "FORBIDDEN_SCOPE");
    }
  }

  app.get("/api/v1/me", async (request) => {
    const auth = request.apiAuth!;
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { id: true, name: true, slug: true },
    });
    return {
      tenant,
      apiKey: { id: auth.apiKeyId, scopes: auth.scopes },
    };
  });

  // Contatos CRM removidos do produto e da API pública (/api/v1/contacts).

  app.get("/api/v1/conversations", async (request) => {
    requireScope(request, "conversations:read");
    const auth = request.apiAuth!;
    const q = z
      .object({
        status: z.enum(["OPEN", "PENDING", "CLOSED", "ARCHIVED"]).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const where = {
      tenantId: auth.tenantId,
      ...(q.status ? { status: q.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          status: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          closedAt: true,
          closeReason: true,
          contact: { select: { id: true, name: true, phone: true } },
          createdAt: true,
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    return { items, total, page: q.page, limit: q.limit };
  });

  app.get("/api/v1/opportunities", async (request) => {
    requireScope(request, "opportunities:read");
    const auth = request.apiAuth!;
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const where = { tenantId: auth.tenantId };
    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          title: true,
          value: true,
          status: true,
          stageId: true,
          contactId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.opportunity.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  });

  app.get("/api/v1/tasks", async (request) => {
    requireScope(request, "tasks:read");
    const auth = request.apiAuth!;
    const q = z
      .object({
        status: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const where: Record<string, unknown> = { tenantId: auth.tenantId };
    if (q.status) where.status = q.status;

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          contactId: true,
          createdAt: true,
        },
      }),
      prisma.task.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  });
}

/* rate limit: services/security/api-rate-limit.ts */
