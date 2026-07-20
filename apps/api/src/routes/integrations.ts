/**
 * Webhooks + API keys — self-service por tenant (ADMIN/settings).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";
import { asInputJson } from "../lib/json";
import { WEBHOOK_EVENTS, labelForEvent } from "../services/webhooks/events";
import {
  assertSafeWebhookUrl,
  validateWebhookUrlFormat,
} from "../services/webhooks/ssrf";
import {
  emitWebhookEvent,
  generateWebhookSecret,
  resendDelivery,
  attemptDelivery,
} from "../services/webhooks/dispatch";
import {
  API_SCOPES,
  assertApiAccess,
  assertWebhookAccess,
  createApiKey,
  getApiKeyLimit,
  getWebhookLimit,
} from "../services/api-keys";
import { getTenantLimits } from "../services/entitlements";

function requireAdmin(request: { user: { role?: string | null; platformRole?: string | null } }) {
  if (
    !["ADMIN", "SUPERVISOR"].includes(request.user.role || "") &&
    request.user.platformRole !== "SUPERADMIN"
  ) {
    throw new AppError("Sem permissão", 403);
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  // ── Catalog ──
  app.get(
    "/integrations/webhook-events",
    { preHandler: [app.requirePermission("settings.read")] },
    async () => ({ events: WEBHOOK_EVENTS })
  );

  app.get(
    "/integrations/api-scopes",
    { preHandler: [app.requirePermission("settings.read")] },
    async () => ({ scopes: API_SCOPES })
  );

  app.get(
    "/integrations/status",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const limits = await getTenantLimits(tenantId);
      const [webhookCount, apiKeyCount] = await Promise.all([
        prisma.webhookEndpoint.count({ where: { tenantId } }),
        prisma.apiKey.count({ where: { tenantId, revokedAt: null } }),
      ]);
      const whLimit = await getWebhookLimit(tenantId);
      return {
        api: {
          enabled: limits.features.api,
          keysLimit: await getApiKeyLimit(tenantId),
          keysUsed: apiKeyCount,
        },
        webhooks: {
          enabled: whLimit > 0,
          limit: whLimit,
          used: webhookCount,
        },
        planSlug: limits.planSlug,
        planName: limits.planName,
      };
    }
  );

  // ── Webhooks CRUD ──
  app.get(
    "/webhooks",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const rows = await prisma.webhookEndpoint.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        url: r.url,
        events: Array.isArray(r.events) ? r.events : [],
        isActive: r.isActive,
        healthStatus: r.healthStatus,
        failureCount: r.failureCount,
        lastSuccessAt: r.lastSuccessAt,
        lastFailureAt: r.lastFailureAt,
        lastDeliveryAt: r.lastDeliveryAt,
        createdAt: r.createdAt,
        deliveriesCount: r._count.deliveries,
        secretPreview: maskSecret(r.secret),
      }));
    }
  );

  app.post(
    "/webhooks",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      await assertWebhookAccess(tenantId);
      const body = z
        .object({
          name: z.string().min(2).max(80),
          url: z.string().url().max(500),
          description: z.string().max(300).optional(),
          events: z.array(z.string()).min(1),
          isActive: z.boolean().optional(),
        })
        .parse(request.body);

      const limit = await getWebhookLimit(tenantId);
      const count = await prisma.webhookEndpoint.count({ where: { tenantId } });
      if (count >= limit) {
        throw new AppError(`Limite de ${limit} webhook(s) no plano.`, 403);
      }

      await assertSafeWebhookUrl(body.url);
      const events = body.events.filter((e) =>
        WEBHOOK_EVENTS.some((w) => w.type === e)
      );
      if (!events.length) throw new AppError("Selecione ao menos um evento válido", 400);

      const secret = generateWebhookSecret();
      const row = await prisma.webhookEndpoint.create({
        data: {
          tenantId,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          url: body.url.trim(),
          secret,
          events: asInputJson(events),
          isActive: body.isActive !== false,
          healthStatus: "active",
        },
      });

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "webhook.created",
        entity: "webhookEndpoint",
        entityId: row.id,
        metadata: { name: row.name, events },
      });

      return {
        id: row.id,
        name: row.name,
        url: row.url,
        events,
        isActive: row.isActive,
        secret, // só na criação
        message: "Copie o segredo agora. Ele não será exibido novamente por completo.",
      };
    }
  );

  app.patch(
    "/webhooks/:id",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          name: z.string().min(2).max(80).optional(),
          url: z.string().url().max(500).optional(),
          description: z.string().max(300).optional().nullable(),
          events: z.array(z.string()).optional(),
          isActive: z.boolean().optional(),
        })
        .parse(request.body);

      const existing = assertFound(
        await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } })
      );
      if (body.url) await assertSafeWebhookUrl(body.url);
      const events = body.events
        ? body.events.filter((e) => WEBHOOK_EVENTS.some((w) => w.type === e))
        : undefined;

      const updated = await prisma.webhookEndpoint.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          url: body.url?.trim(),
          description:
            body.description === undefined ? undefined : body.description,
          events: events ? asInputJson(events) : undefined,
          isActive: body.isActive,
          healthStatus:
            body.isActive === false
              ? "paused"
              : body.isActive === true
                ? "active"
                : undefined,
        },
      });

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "webhook.updated",
        entity: "webhookEndpoint",
        entityId: id,
        metadata: body,
      });

      return {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        isActive: updated.isActive,
        healthStatus: updated.healthStatus,
        events: Array.isArray(updated.events) ? updated.events : existing.events,
      };
    }
  );

  app.post(
    "/webhooks/:id/rotate-secret",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      assertFound(await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } }));
      const secret = generateWebhookSecret();
      await prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
      await audit({
        tenantId,
        userId: request.user.sub,
        action: "webhook.secret_rotated",
        entity: "webhookEndpoint",
        entityId: id,
      });
      return {
        secret,
        message: "Copie o novo segredo agora. O anterior deixou de ser válido.",
      };
    }
  );

  app.post(
    "/webhooks/:id/test",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      const body = z
        .object({ event: z.string().default("webhook.test") })
        .parse(request.body || {});
      const ep = assertFound(
        await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } })
      );
      const fmt = validateWebhookUrlFormat(ep.url);
      if (!fmt.ok) throw new AppError(fmt.reason, 400);

      const eventType =
        body.event === "webhook.test" || WEBHOOK_EVENTS.some((e) => e.type === body.event)
          ? body.event
          : "webhook.test";

      // entrega direta só neste endpoint
      const { randomUUID } = await import("crypto");
      const eventId = `evt_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const envelope = {
        id: eventId,
        type: eventType,
        createdAt: new Date().toISOString(),
        tenantId,
        data: {
          test: true,
          message: "Evento de teste NexaFlow",
          webhookName: ep.name,
          label: labelForEvent(eventType),
        },
      };
      const delivery = await prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          tenantId,
          eventId,
          event: eventType,
          payload: asInputJson(envelope),
          status: "pending",
          attempts: 0,
        },
      });
      await attemptDelivery(delivery.id);
      const result = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "webhook.test_sent",
        entity: "webhookEndpoint",
        entityId: id,
        metadata: { deliveryId: delivery.id, success: result?.success },
      });

      return {
        deliveryId: delivery.id,
        success: result?.success ?? false,
        statusCode: result?.statusCode,
        error: result?.error,
      };
    }
  );

  app.get(
    "/webhooks/:id/deliveries",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      assertFound(await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } }));
      return prisma.webhookDelivery.findMany({
        where: { endpointId: id, tenantId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          event: true,
          eventId: true,
          status: true,
          statusCode: true,
          success: true,
          attempts: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
      });
    }
  );

  app.get(
    "/webhooks/:id/deliveries/:deliveryId",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const { id, deliveryId } = request.params as { id: string; deliveryId: string };
      const d = assertFound(
        await prisma.webhookDelivery.findFirst({
          where: { id: deliveryId, endpointId: id, tenantId },
          include: { endpoint: { select: { url: true, name: true } } },
        })
      );
      return {
        id: d.id,
        event: d.event,
        eventId: d.eventId,
        status: d.status,
        statusCode: d.statusCode,
        success: d.success,
        attempts: d.attempts,
        durationMs: d.durationMs,
        error: d.error,
        createdAt: d.createdAt,
        url: d.endpoint.url,
        payload: d.payload,
        responseBody: d.responseBody,
      };
    }
  );

  app.post(
    "/webhooks/:id/deliveries/:deliveryId/resend",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { deliveryId } = request.params as { deliveryId: string };
      const result = await resendDelivery({ tenantId, deliveryId });
      if (!result) throw new AppError("Entrega não encontrada", 404);
      return result;
    }
  );

  app.delete(
    "/webhooks/:id",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      assertFound(await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } }));
      await prisma.webhookDelivery.deleteMany({ where: { endpointId: id } });
      await prisma.webhookEndpoint.delete({ where: { id } });
      await audit({
        tenantId,
        userId: request.user.sub,
        action: "webhook.deleted",
        entity: "webhookEndpoint",
        entityId: id,
      });
      return { ok: true };
    }
  );

  // ── API Keys ──
  app.get(
    "/api-keys",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const limits = await getTenantLimits(tenantId);
      const keys = await prisma.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
      return {
        apiEnabled: limits.features.api,
        keysLimit: await getApiKeyLimit(tenantId),
        keys: keys.map((k) => ({
          ...k,
          scopes: Array.isArray(k.scopes) ? k.scopes : [],
        })),
      };
    }
  );

  app.post(
    "/api-keys",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const body = z
        .object({
          name: z.string().min(2).max(80),
          scopes: z.array(z.string()).min(1),
          expiresAt: z.string().datetime().optional().nullable(),
        })
        .parse(request.body);

      const created = await createApiKey({
        tenantId,
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: request.user.sub,
      });

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "api_key.created",
        entity: "apiKey",
        entityId: created.id,
        metadata: { name: created.name, scopes: created.scopes },
      });

      return created;
    }
  );

  app.post(
    "/api-keys/:id/revoke",
    { preHandler: [app.requirePermission("settings.update")] },
    async (request) => {
      requireAdmin(request);
      const tenantId = request.user.tenantId!;
      const { id } = request.params as { id: string };
      const key = assertFound(
        await prisma.apiKey.findFirst({ where: { id, tenantId } })
      );
      if (key.revokedAt) return { ok: true, already: true };
      await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await audit({
        tenantId,
        userId: request.user.sub,
        action: "api_key.revoked",
        entity: "apiKey",
        entityId: id,
      });
      return { ok: true };
    }
  );

  app.get(
    "/api-keys/usage",
    { preHandler: [app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      try {
        await assertApiAccess(tenantId);
      } catch {
        return { enabled: false, last24h: 0, last7d: 0, recent: [] };
      }
      const since24 = new Date(Date.now() - 864e5);
      const since7 = new Date(Date.now() - 7 * 864e5);
      const [last24h, last7d, recent] = await Promise.all([
        prisma.apiUsageLog.count({
          where: { tenantId, createdAt: { gte: since24 } },
        }),
        prisma.apiUsageLog.count({
          where: { tenantId, createdAt: { gte: since7 } },
        }),
        prisma.apiUsageLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            method: true,
            path: true,
            statusCode: true,
            durationMs: true,
            createdAt: true,
          },
        }),
      ]);
      return { enabled: true, last24h, last7d, recent };
    }
  );
}
