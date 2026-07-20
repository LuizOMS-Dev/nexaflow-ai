import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { emitWebhookEvent } from "../services/webhooks/dispatch";

export async function crmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  app.get("/pipelines", { preHandler: [app.requirePermission("crm.read")] }, async (request) => {
    const pipelines = await prisma.pipeline.findMany({
      where: { tenantId: request.user.tenantId! },
      include: { stages: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return pipelines;
  });

  app.post("/pipelines", { preHandler: [app.requirePermission("crm.create")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR", "SALES"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        name: z.string().min(1),
        stages: z
          .array(z.object({ name: z.string(), color: z.string().optional(), probability: z.number().optional() }))
          .optional(),
      })
      .parse(request.body);

    const stages =
      body.stages?.map((s, i) => ({
        name: s.name,
        color: s.color || "#6366f1",
        position: i,
        probability: s.probability ?? i * 15,
      })) || [
        { name: "Novos", color: "#94a3b8", position: 0, probability: 10 },
        { name: "Qualificado", color: "#3b82f6", position: 1, probability: 40 },
        { name: "Proposta", color: "#f59e0b", position: 2, probability: 70 },
        { name: "Ganho", color: "#22c55e", position: 3, probability: 100, isWon: true },
        { name: "Perdido", color: "#ef4444", position: 4, probability: 0, isLost: true },
      ];

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId: request.user.tenantId!,
        name: body.name,
        stages: { create: stages },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    void import("../services/tenant-setup-checklist")
      .then(({ markPipelineCreated }) => markPipelineCreated(request.user.tenantId!))
      .catch(() => null);
    return pipeline;
  });

  app.get("/pipelines/:id/board", { preHandler: [app.requirePermission("crm.read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const pipeline = assertFound(
      await prisma.pipeline.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        include: {
          stages: {
            orderBy: { position: "asc" },
            include: {
              opportunities: {
                where: { status: "OPEN" },
                include: { contact: true },
                orderBy: { updatedAt: "desc" },
              },
            },
          },
        },
      })
    );
    return pipeline;
  });

  app.get("/opportunities", { preHandler: [app.requirePermission("crm.read")] }, async (request) => {
    const q = z
      .object({
        pipelineId: z.string().optional(),
        status: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const where: Record<string, unknown> = { tenantId: request.user.tenantId! };
    if (q.pipelineId) where.pipelineId = q.pipelineId;
    if (q.status) where.status = q.status;

    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: { contact: true, stage: true, pipeline: true },
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.opportunity.count({ where }),
    ]);

    return { items, total };
  });

  app.post("/opportunities", { preHandler: [app.requirePermission("crm.create")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const body = z
      .object({
        pipelineId: z.string(),
        stageId: z.string(),
        contactId: z.string(),
        title: z.string().min(1),
        value: z.number().default(0),
        probability: z.number().optional(),
        source: z.string().optional(),
        product: z.string().optional(),
        expectedClose: z.string().datetime().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    assertFound(await prisma.pipeline.findFirst({ where: { id: body.pipelineId, tenantId } }));
    assertFound(await prisma.contact.findFirst({ where: { id: body.contactId, tenantId } }));

    const stage = assertFound(await prisma.pipelineStage.findFirst({ where: { id: body.stageId, pipelineId: body.pipelineId } }));

    const created = await prisma.opportunity.create({
      data: {
        tenantId,
        pipelineId: body.pipelineId,
        stageId: body.stageId,
        contactId: body.contactId,
        title: body.title,
        value: body.value,
        probability: body.probability ?? stage.probability,
        source: body.source,
        product: body.product,
        expectedClose: body.expectedClose ? new Date(body.expectedClose) : null,
        notes: body.notes,
        lastActivityAt: new Date(),
        history: {
          create: {
            action: "created",
            toStageId: body.stageId,
            note: "Oportunidade criada",
          },
        },
      },
      include: { contact: true, stage: true },
    });
    emitWebhookEvent({
      tenantId,
      type: "opportunity.created",
      data: {
        opportunity: {
          id: created.id,
          title: created.title,
          contactId: created.contactId,
          stageId: created.stageId,
          value: created.value,
        },
      },
    });
    return created;
  });

  app.patch("/opportunities/:id", { preHandler: [app.requirePermission("crm.update")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        title: z.string().optional(),
        value: z.number().optional(),
        probability: z.number().optional(),
        stageId: z.string().optional(),
        status: z.enum(["OPEN", "WON", "LOST"]).optional(),
        lostReason: z.string().optional(),
        notes: z.string().optional(),
        product: z.string().optional(),
      })
      .parse(request.body);

    const existing = assertFound(
      await prisma.opportunity.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    if (body.stageId && body.stageId !== existing.stageId) {
      const stage = assertFound(
        await prisma.pipelineStage.findFirst({ where: { id: body.stageId, pipelineId: existing.pipelineId } })
      );

      await prisma.opportunityHistory.create({
        data: {
          opportunityId: id,
          fromStageId: existing.stageId,
          toStageId: body.stageId,
          action: "stage_change",
        },
      });

      const status = stage.isWon ? "WON" : stage.isLost ? "LOST" : body.status || existing.status;

      const moved = await prisma.opportunity.update({
        where: { id },
        data: {
          title: body.title,
          value: body.value,
          probability: body.probability ?? stage.probability,
          stageId: body.stageId,
          status,
          lostReason: body.lostReason,
          notes: body.notes,
          product: body.product,
          lastActivityAt: new Date(),
        },
        include: { contact: true, stage: true },
      });
      const tenantId = request.user.tenantId!;
      emitWebhookEvent({
        tenantId,
        type: "opportunity.stage_changed",
        data: {
          opportunity: {
            id: moved.id,
            fromStageId: existing.stageId,
            toStageId: moved.stageId,
            status: moved.status,
          },
        },
      });
      emitWebhookEvent({
        tenantId,
        type: "opportunity.updated",
        data: { opportunity: { id: moved.id, title: moved.title, stageId: moved.stageId } },
      });
      return moved;
    }

    const updated = await prisma.opportunity.update({
      where: { id },
      data: {
        title: body.title,
        value: body.value,
        probability: body.probability,
        status: body.status,
        lostReason: body.lostReason,
        notes: body.notes,
        product: body.product,
        lastActivityAt: new Date(),
      },
      include: { contact: true, stage: true },
    });
    emitWebhookEvent({
      tenantId: request.user.tenantId!,
      type: "opportunity.updated",
      data: {
        opportunity: {
          id: updated.id,
          title: updated.title,
          stageId: updated.stageId,
          status: updated.status,
        },
      },
    });
    return updated;
  });

  app.delete("/opportunities/:id", { preHandler: [app.requirePermission("crm.delete")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR", "SALES"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    assertFound(await prisma.opportunity.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    await prisma.opportunity.delete({ where: { id } });
    return { ok: true };
  });
}
