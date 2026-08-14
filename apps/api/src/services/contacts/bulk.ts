/**
 * Contatos 3.0 — operações em lote (ids | allMatching).
 * Sem where cru: filtros passam por buildContactWhere + tenantId.
 */

import type { LeadPriority, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { audit } from "../audit";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../lead-qualification";
import { broadcastToTenant } from "../../ws/hub";
import { ARCHIVED_STAGE, buildContactWhere, type ContactListQuery } from "./query";
import { assertResponsibleInTenant } from "./write";

export type BulkAction =
  | "archive"
  | "restore"
  | "delete"
  | "set_status"
  | "set_priority"
  | "set_responsible";

export type BulkBody = {
  action: BulkAction;
  mode: "ids" | "allMatching";
  ids?: string[];
  excludeIds?: string[];
  filters?: ContactListQuery;
  payload?: {
    commercialStatus?: LeadStatus;
    priority?: LeadPriority;
    responsibleUserId?: string | null;
    force?: boolean;
  };
};

const BULK_MAX_IDS = 500;
const BULK_MAX_MATCH = 5000;

export async function bulkContacts(tenantId: string, userId: string, body: BulkBody) {
  if (body.mode === "ids") {
    if (!body.ids?.length) throw new AppError("Informe ids", 400);
    if (body.ids.length > BULK_MAX_IDS) {
      throw new AppError(`Máximo ${BULK_MAX_IDS} ids por operação`, 400);
    }
  }

  let where: Prisma.ContactWhereInput;
  if (body.mode === "allMatching") {
    where = buildContactWhere(tenantId, body.filters || {});
    if (body.excludeIds?.length) {
      where = { AND: [where, { id: { notIn: body.excludeIds } }] };
    }
    const count = await prisma.contact.count({ where });
    if (count > BULK_MAX_MATCH) {
      throw new AppError(
        `Seleção muito grande (${count}). Refine filtros (máx. ${BULK_MAX_MATCH}).`,
        400,
        "BULK_TOO_LARGE"
      );
    }
  } else {
    where = { tenantId, id: { in: body.ids! } };
  }

  let affected = 0;

  switch (body.action) {
    case "archive": {
      const res = await prisma.contact.updateMany({
        where,
        data: { stage: ARCHIVED_STAGE },
      });
      affected = res.count;
      break;
    }
    case "restore": {
      const res = await prisma.contact.updateMany({
        where,
        data: { stage: null },
      });
      affected = res.count;
      break;
    }
    case "delete": {
      const targets = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          _count: { select: { conversations: true, opportunities: true } },
        },
      });
      const force = body.payload?.force === true;
      if (!force) {
        const blocked = targets.filter(
          (t) => t._count.conversations > 0 || t._count.opportunities > 0
        );
        if (blocked.length) {
          throw new AppError(
            "Um ou mais contatos possuem conversas ou oportunidades. Use force=true para excluir o lote.",
            409,
            "CONTACT_HAS_HISTORY",
            {
              conversations: blocked.reduce((n, t) => n + t._count.conversations, 0),
              opportunities: blocked.reduce((n, t) => n + t._count.opportunities, 0),
            }
          );
        }
      }
      const res = await prisma.contact.deleteMany({ where });
      affected = res.count;
      break;
    }
    case "set_status": {
      const st = body.payload?.commercialStatus;
      if (!st || !(LEAD_STATUSES as readonly string[]).includes(st)) {
        throw new AppError("Status comercial inválido", 400);
      }
      const res = await prisma.contact.updateMany({
        where,
        data: { commercialStatus: st },
      });
      affected = res.count;
      break;
    }
    case "set_priority": {
      const pr = body.payload?.priority;
      if (!pr || !(LEAD_PRIORITIES as readonly string[]).includes(pr)) {
        throw new AppError("Prioridade inválida", 400);
      }
      const res = await prisma.contact.updateMany({
        where,
        data: { priority: pr },
      });
      affected = res.count;
      break;
    }
    case "set_responsible": {
      const rid = body.payload?.responsibleUserId ?? null;
      await assertResponsibleInTenant(tenantId, rid);
      const res = await prisma.contact.updateMany({
        where,
        data: { responsibleUserId: rid },
      });
      affected = res.count;
      break;
    }
    default:
      throw new AppError("Ação bulk inválida", 400);
  }

  await audit({
    tenantId,
    userId,
    action: `contact.bulk_${body.action}`,
    entity: "contact",
    entityId: body.mode,
    metadata: {
      action: body.action,
      mode: body.mode,
      affected,
      idsCount: body.ids?.length,
      excludeCount: body.excludeIds?.length,
    },
  });

  broadcastToTenant(tenantId, "contact.updated", { bulk: true });

  return { ok: true as const, affected };
}
