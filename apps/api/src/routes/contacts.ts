import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { audit } from "../services/audit";
import { assertCanAddContact } from "../services/entitlements";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../services/lead-qualification";
import { emitWebhookEvent } from "../services/webhooks/dispatch";

export async function contactRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  app.get("/contacts", { preHandler: [app.requirePermission("contacts.read")] }, async (request) => {
    const q = z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        tagId: z.string().optional(),
        /** archived | active | all — padrão: só ativos */
        archived: z.enum(["0", "1", "all"]).optional().default("0"),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const tenantId = request.user.tenantId!;
    const where: Record<string, unknown> = { tenantId };

    // Arquivo soft via stage="archived" (sem migration extra)
    if (q.archived === "0") {
      where.AND = [
        { OR: [{ stage: null }, { stage: { not: "archived" } }] },
      ];
    } else if (q.archived === "1") {
      where.stage = "archived";
    }

    if (q.search) {
      where.OR = [
        { name: { contains: q.search } },
        { email: { contains: q.search } },
        { phone: { contains: q.search } },
        { company: { contains: q.search } },
      ];
    }
    if (q.status) where.commercialStatus = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.tagId) where.tags = { some: { tagId: q.tagId } };

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: { tags: { include: { tag: true } }, memory: true },
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return { items, total, page: q.page, limit: q.limit };
  });

  app.get("/contacts/:id", { preHandler: [app.requirePermission("contacts.read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const contact = assertFound(
      await prisma.contact.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        include: {
          tags: { include: { tag: true } },
          memory: true,
          conversations: { orderBy: { lastMessageAt: "desc" }, take: 10 },
          opportunities: { orderBy: { updatedAt: "desc" }, take: 10 },
          tasks: { orderBy: { createdAt: "desc" }, take: 10 },
          notesList: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { id: true, name: true } } } },
        },
      })
    );
    return contact;
  });

  app.post("/contacts", { preHandler: [app.requirePermission("contacts.create")] }, async (request) => {
    const body = z
      .object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        document: z.string().optional(),
        company: z.string().optional(),
        jobTitle: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        source: z.string().optional(),
        notes: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        consentMarketing: z.boolean().optional(),
        consentWhatsapp: z.boolean().optional(),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    await assertCanAddContact(tenantId);

    if (body.phone) {
      const dup = await prisma.contact.findFirst({ where: { tenantId, phone: body.phone } });
      if (dup) throw new AppError("Já existe contato com este telefone", 409, "DUPLICATE_PHONE");
    }
    if (body.email) {
      const dup = await prisma.contact.findFirst({ where: { tenantId, email: body.email } });
      if (dup) throw new AppError("Já existe contato com este e-mail", 409, "DUPLICATE_EMAIL");
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        name: body.name,
        phone: body.phone,
        email: body.email || null,
        document: body.document,
        company: body.company,
        jobTitle: body.jobTitle,
        city: body.city,
        state: body.state,
        source: body.source,
        notes: body.notes,
        consentMarketing: body.consentMarketing ?? false,
        consentWhatsapp: body.consentWhatsapp ?? false,
        tags: body.tagIds?.length
          ? { create: body.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } } },
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "contact.create",
      entity: "contact",
      entityId: contact.id,
    });

    emitWebhookEvent({
      tenantId,
      type: "contact.created",
      data: {
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
        },
      },
    });

    return contact;
  });

  app.patch("/contacts/:id", { preHandler: [app.requirePermission("contacts.update")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable().or(z.literal("")),
        company: z.string().optional().nullable(),
        jobTitle: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        commercialStatus: z.enum(LEAD_STATUSES).optional(),
        priority: z.enum(LEAD_PRIORITIES).optional(),
        score: z.number().int().min(0).max(100).optional(),
        nextAction: z.string().max(200).optional().nullable(),
        nextActionDueAt: z.string().datetime().optional().nullable(),
        consentMarketing: z.boolean().optional(),
        consentWhatsapp: z.boolean().optional(),
        tagIds: z.array(z.string()).optional(),
        /** Soft archive: stage "archived" | null para reativar */
        stage: z.string().max(40).optional().nullable(),
        archived: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = assertFound(
      await prisma.contact.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    if (body.tagIds) {
      await prisma.contactTag.deleteMany({ where: { contactId: id } });
      if (body.tagIds.length) {
        await prisma.contactTag.createMany({
          data: body.tagIds.map((tagId) => ({ contactId: id, tagId })),
        });
      }
    }

    if (body.score !== undefined && body.score !== existing.score) {
      const { recordScoreChange } = await import("../services/score-history");
      await recordScoreChange({
        tenantId: existing.tenantId,
        contactId: existing.id,
        previousScore: existing.score,
        newScore: body.score,
        source: "MANUAL",
        note: "Atualização manual do score",
      });
    }

    let stageUpdate: string | null | undefined = body.stage;
    if (body.archived === true) stageUpdate = "archived";
    if (body.archived === false) stageUpdate = null;

    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        phone: body.phone === undefined ? undefined : body.phone,
        email: body.email === "" ? null : body.email,
        company: body.company,
        jobTitle: body.jobTitle,
        city: body.city,
        state: body.state,
        source: body.source,
        notes: body.notes,
        commercialStatus: body.commercialStatus,
        priority: body.priority,
        score: body.score,
        scoreUpdatedAt: body.score !== undefined ? new Date() : undefined,
        nextAction: body.nextAction === undefined ? undefined : body.nextAction,
        nextActionDueAt:
          body.nextActionDueAt === undefined
            ? undefined
            : body.nextActionDueAt
              ? new Date(body.nextActionDueAt)
              : null,
        consentMarketing: body.consentMarketing,
        consentWhatsapp: body.consentWhatsapp,
        ...(stageUpdate !== undefined ? { stage: stageUpdate } : {}),
      },
      include: { tags: { include: { tag: true } } },
    });

    emitWebhookEvent({
      tenantId: request.user.tenantId!,
      type: "contact.updated",
      data: {
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
        },
      },
    });

    return contact;
  });

  app.delete("/contacts/:id", { preHandler: [app.requirePermission("contacts.delete")] }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = assertFound(
      await prisma.contact.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );
    await prisma.contact.delete({ where: { id: existing.id } });
    await audit({
      tenantId: request.user.tenantId,
      userId: request.user.sub,
      action: "contact.delete",
      entity: "contact",
      entityId: id,
    });
    emitWebhookEvent({
      tenantId: request.user.tenantId!,
      type: "contact.deleted",
      data: { contact: { id: existing.id, name: existing.name } },
    });
    return { ok: true };
  });

  app.post("/contacts/import", { preHandler: [app.requirePermission("contacts.create")] }, async (request) => {
    const body = z
      .object({
        contacts: z.array(
          z.object({
            name: z.string(),
            phone: z.string().optional(),
            email: z.string().optional(),
            company: z.string().optional(),
            city: z.string().optional(),
            source: z.string().optional(),
          })
        ),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    let created = 0;
    let skipped = 0;

    for (const row of body.contacts) {
      if (!row.name?.trim()) {
        skipped++;
        continue;
      }
      if (row.phone) {
        const dup = await prisma.contact.findFirst({ where: { tenantId, phone: row.phone } });
        if (dup) {
          skipped++;
          continue;
        }
      }
      try {
        await assertCanAddContact(tenantId);
      } catch {
        skipped += body.contacts.length - created - skipped;
        break;
      }
      await prisma.contact.create({
        data: {
          tenantId,
          name: row.name.trim(),
          phone: row.phone,
          email: row.email || null,
          company: row.company,
          city: row.city,
          source: row.source || "import",
        },
      });
      created++;
    }

    return { created, skipped };
  });

  app.get(
    "/contacts/:id/score-history",
    { preHandler: [app.requirePermission("contacts.read")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const contact = assertFound(
        await prisma.contact.findFirst({
          where: { id, tenantId: request.user.tenantId! },
          select: { id: true },
        })
      );
      return prisma.contactScoreHistory.findMany({
        where: { contactId: contact.id, tenantId: request.user.tenantId! },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }
  );
}
