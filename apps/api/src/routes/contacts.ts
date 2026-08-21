/**
 * Contatos 3.0 — rotas HTTP finas (lógica em services/contacts).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../services/lead-qualification";
import {
  IMPORT_MAX_CHARS,
  IMPORT_MAX_ROWS,
  bulkContacts,
  commitContactImport,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  previewContactImport,
  scoreHistory,
  updateContact,
  type BulkAction,
} from "../services/contacts";

const idParams = z.object({ id: z.string().min(1) });

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  responsibleUserId: z.string().optional(),
  tagId: z.string().optional(),
  archived: z.enum(["0", "1", "all"]).optional().default("0"),
  sort: z
    .enum(["updatedAt", "createdAt", "name", "score", "lastInteractionAt"])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const writeSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(254).optional().nullable(),
  document: z.string().max(40).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  jobTitle: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(40).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  commercialStatus: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  score: z.number().int().min(0).max(100).optional(),
  nextAction: z.string().max(200).optional().nullable(),
  nextActionDueAt: z.string().datetime().optional().nullable(),
  responsibleUserId: z.string().optional().nullable(),
  consentMarketing: z.boolean().optional(),
  consentWhatsapp: z.boolean().optional(),
  tagIds: z.array(z.string()).max(50).optional(),
  archived: z.boolean().optional(),
});

const importRowSchema = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(254).optional(),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  document: z.string().max(40).optional(),
  notes: z.string().max(5000).optional(),
});

function parseForceFlag(query: unknown, body: unknown): boolean {
  const q = z.object({ force: z.string().optional() }).parse(query ?? {});
  const b = z.object({ force: z.boolean().optional() }).parse(body ?? {});
  const qf = (q.force ?? "").toLowerCase();
  return b.force === true || qf === "true" || qf === "1";
}

export async function contactRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSection("CONTACTS"));

  app.get(
    "/contacts",
    { preHandler: [app.requirePermission("contacts.read")] },
    async (request) => {
      const q = listQuerySchema.parse(request.query);
      return listContacts(request.user.tenantId!, q);
    }
  );

  // Static segments BEFORE /:id
  app.post("/contacts/bulk", { preHandler: [app.requireTenant] }, async (request) => {
    const body = z
      .object({
        action: z.enum([
          "archive",
          "restore",
          "delete",
          "set_status",
          "set_priority",
          "set_responsible",
        ]),
        mode: z.enum(["ids", "allMatching"]),
        ids: z.array(z.string().min(1)).max(500).optional(),
        excludeIds: z.array(z.string().min(1)).max(500).optional(),
        filters: listQuerySchema.partial().optional(),
        payload: z
          .object({
            commercialStatus: z.enum(LEAD_STATUSES).optional(),
            priority: z.enum(LEAD_PRIORITIES).optional(),
            responsibleUserId: z.string().nullable().optional(),
            force: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(request.body ?? {});

    const { hasPermission } = await import("../services/security/permissions");
    const need = body.action === "delete" ? "contacts.delete" : "contacts.update";
    if (
      !hasPermission(request.user.role, request.user.platformRole, need, {
        impersonating: Boolean((request.user as { impBy?: string }).impBy || request.user.imp),
      })
    ) {
      throw new AppError("Sem permissão", 403, "FORBIDDEN");
    }

    return bulkContacts(request.user.tenantId!, request.user.sub, {
      action: body.action as BulkAction,
      mode: body.mode,
      ids: body.ids,
      excludeIds: body.excludeIds,
      filters: body.filters,
      payload: body.payload,
    });
  });

  app.post(
    "/contacts/import/preview",
    { preHandler: [app.requirePermission("contacts.create")] },
    async (request) => {
      const body = z
        .object({
          csv: z.string().min(1).max(IMPORT_MAX_CHARS),
          delimiter: z.string().max(1).optional(),
        })
        .parse(request.body ?? {});
      return previewContactImport(body.csv, body.delimiter);
    }
  );

  app.post(
    "/contacts/import",
    { preHandler: [app.requirePermission("contacts.create")] },
    async (request) => {
      const body = z
        .object({
          csv: z.string().min(1).max(IMPORT_MAX_CHARS).optional(),
          delimiter: z.string().max(1).optional(),
          fieldMap: z.record(z.string(), z.string()).optional(),
          rows: z.array(importRowSchema).max(IMPORT_MAX_ROWS).optional(),
          skipDuplicates: z.boolean().optional(),
        })
        .parse(request.body ?? {});

      return commitContactImport(request.user.tenantId!, request.user.sub, body);
    }
  );

  app.get(
    "/contacts/:id/score-history",
    { preHandler: [app.requirePermission("contacts.read")] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return scoreHistory(request.user.tenantId!, id);
    }
  );

  app.get(
    "/contacts/:id",
    { preHandler: [app.requirePermission("contacts.read")] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return getContact(request.user.tenantId!, id);
    }
  );

  app.post(
    "/contacts",
    { preHandler: [app.requirePermission("contacts.create")] },
    async (request) => {
      const body = writeSchema.parse(request.body ?? {});
      return createContact(request.user.tenantId!, request.user.sub, body);
    }
  );

  app.patch(
    "/contacts/:id",
    { preHandler: [app.requirePermission("contacts.update")] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = writeSchema.parse(request.body ?? {});
      return updateContact(request.user.tenantId!, request.user.sub, id, body);
    }
  );

  app.delete(
    "/contacts/:id",
    { preHandler: [app.requirePermission("contacts.delete")] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const force = parseForceFlag(request.query, request.body);
      return deleteContact(request.user.tenantId!, request.user.sub, id, { force });
    }
  );
}
