import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { emitWebhookEvent } from "../services/webhooks/dispatch";

export async function taskRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  app.get("/tasks", { preHandler: [app.requirePermission("tasks.read")] }, async (request) => {
    const q = z
      .object({
        status: z.string().optional(),
        assigneeId: z.string().optional(),
        mine: z.coerce.boolean().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    const where: Record<string, unknown> = { tenantId: request.user.tenantId! };
    if (q.status) where.status = q.status;
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.mine) where.assigneeId = request.user.sub;

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
          conversation: { select: { id: true } },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.task.count({ where }),
    ]);

    return { items, total };
  });

  app.post("/tasks", { preHandler: [app.requirePermission("tasks.create")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
        dueAt: z.string().datetime().optional(),
        assigneeId: z.string().optional(),
        contactId: z.string().optional(),
        conversationId: z.string().optional(),
        checklist: z.array(z.object({ text: z.string(), done: z.boolean().default(false) })).optional(),
      })
      .parse(request.body);

    const created = await prisma.task.create({
      data: {
        tenantId: request.user.tenantId!,
        title: body.title,
        description: body.description,
        priority: body.priority,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        assigneeId: body.assigneeId || request.user.sub,
        creatorId: request.user.sub,
        contactId: body.contactId,
        conversationId: body.conversationId,
        checklist: body.checklist || [],
      },
      include: {
        assignee: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    emitWebhookEvent({
      tenantId: request.user.tenantId!,
      type: "task.created",
      data: { task: { id: created.id, title: created.title, status: created.status } },
    });
    return created;
  });

  app.patch("/tasks/:id", { preHandler: [app.requirePermission("tasks.update")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional().nullable(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        dueAt: z.string().datetime().optional().nullable(),
        assigneeId: z.string().optional().nullable(),
        checklist: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
      })
      .parse(request.body);

    const before = assertFound(
      await prisma.task.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    const updated = await prisma.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        status: body.status,
        priority: body.priority,
        dueAt: body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : undefined,
        assigneeId: body.assigneeId,
        checklist: body.checklist,
        completedAt: body.status === "DONE" ? new Date() : body.status ? null : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    if (body.status === "DONE" && before.status !== "DONE") {
      emitWebhookEvent({
        tenantId: request.user.tenantId!,
        type: "task.completed",
        data: { task: { id: updated.id, title: updated.title } },
      });
    }
    return updated;
  });

  app.delete("/tasks/:id", { preHandler: [app.requirePermission("tasks.update")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    assertFound(await prisma.task.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    await prisma.task.delete({ where: { id } });
    return { ok: true };
  });
}
