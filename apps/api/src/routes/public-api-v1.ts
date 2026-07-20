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
import { assertCanAddContact } from "../services/entitlements";
import { emitWebhookEvent } from "../services/webhooks/dispatch";

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

    // rate limit simples por chave (memória processo)
    const ok = checkRateLimit(auth.apiKeyId);
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

  app.get("/api/v1/contacts", async (request) => {
    requireScope(request, "contacts:read");
    const auth = request.apiAuth!;
    const q = z
      .object({
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const where: Record<string, unknown> = { tenantId: auth.tenantId };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: "insensitive" } },
        { email: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          commercialStatus: true,
          priority: true,
          score: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return { items, total, page: q.page, limit: q.limit };
  });

  app.get("/api/v1/contacts/:id", async (request) => {
    requireScope(request, "contacts:read");
    const auth = request.apiAuth!;
    const { id } = request.params as { id: string };
    // multi-tenant: SEMPRE tenant da chave
    const contact = await prisma.contact.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        commercialStatus: true,
        priority: true,
        score: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!contact) throw new AppError("Contato não encontrado.", 404, "RESOURCE_NOT_FOUND");
    return contact;
  });

  app.post("/api/v1/contacts", async (request) => {
    requireScope(request, "contacts:write");
    const auth = request.apiAuth!;
    const body = z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        company: z.string().max(120).optional().nullable(),
      })
      .parse(request.body);

    await assertCanAddContact(auth.tenantId);
    const contact = await prisma.contact.create({
      data: {
        tenantId: auth.tenantId,
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        createdAt: true,
      },
    });

    emitWebhookEvent({
      tenantId: auth.tenantId,
      type: "contact.created",
      data: { contact },
    });

    return contact;
  });

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

/** Rate limit in-memory por apiKey: 120 req/min */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(apiKeyId: string, max = 120): boolean {
  const now = Date.now();
  const b = rateBuckets.get(apiKeyId);
  if (!b || b.resetAt < now) {
    rateBuckets.set(apiKeyId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
