/**
 * Contatos 3.0 — create / update / delete.
 * Phone authority: lib/contact-fields.ts
 */

import type { LeadPriority, LeadStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import {
  contactIdentityOk,
  isValidEmail,
  normalizePhone,
  phoneLookupVariants,
  resolveContactName,
} from "../../lib/contact-fields";
import { audit } from "../audit";
import { assertCanAddContact } from "../entitlements";
import { recordScoreChange } from "../score-history";
import { emitWebhookEvent } from "../webhooks/dispatch";
import { broadcastToTenant } from "../../ws/hub";
import {
  ARCHIVED_STAGE,
  contactListInclude,
  toContactListItem,
  type ContactListItem,
} from "./query";

export type ContactWriteInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
  notes?: string | null;
  commercialStatus?: LeadStatus;
  priority?: LeadPriority;
  score?: number;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  responsibleUserId?: string | null;
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  tagIds?: string[];
  archived?: boolean;
};

export async function assertResponsibleInTenant(
  tenantId: string,
  userId: string | null | undefined
) {
  if (!userId) return;
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { id: true },
  });
  if (!m) {
    throw new AppError("Responsável inválido para este tenant", 400, "INVALID_RESPONSIBLE");
  }
}

export async function assertTagsInTenant(tenantId: string, tagIds: string[]) {
  if (!tagIds.length) return;
  const count = await prisma.tag.count({ where: { tenantId, id: { in: tagIds } } });
  if (count !== tagIds.length) {
    throw new AppError("Uma ou mais tags são inválidas", 400, "INVALID_TAGS");
  }
}

export async function findPhoneDuplicate(
  tenantId: string,
  phoneNormalized: string,
  excludeId?: string
) {
  const variants = phoneLookupVariants(phoneNormalized);
  if (!variants.length) return null;
  return prisma.contact.findFirst({
    where: {
      tenantId,
      phone: { in: variants },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
}

function normalizeWritePhone(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = normalizePhone(raw);
  if (!n) {
    throw new AppError("Informe um telefone válido", 400, "PHONE_INVALID", {
      code: "PHONE_INVALID",
    });
  }
  return n;
}

function normalizeWriteEmail(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (!isValidEmail(raw)) throw new AppError("Informe um e-mail válido", 400, "EMAIL_INVALID");
  return raw.trim().toLowerCase();
}

function emitContactWebhook(
  tenantId: string,
  type: "contact.created" | "contact.updated" | "contact.deleted",
  contact: { id: string; name: string; email?: string | null; phone?: string | null; company?: string | null }
) {
  if (type === "contact.deleted") {
    emitWebhookEvent({
      tenantId,
      type,
      data: { contact: { id: contact.id, name: contact.name } },
    });
    return;
  }
  emitWebhookEvent({
    tenantId,
    type,
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
}

export async function createContact(
  tenantId: string,
  userId: string,
  input: ContactWriteInput
): Promise<ContactListItem> {
  const phone = normalizeWritePhone(input.phone ?? null);
  const email = normalizeWriteEmail(input.email ?? null);
  const nameIn = (input.name ?? "").trim();

  if (!contactIdentityOk(nameIn, phone ?? null)) {
    throw new AppError("Informe nome ou telefone válido", 400, "IDENTITY_REQUIRED");
  }

  await assertCanAddContact(tenantId);
  await assertResponsibleInTenant(tenantId, input.responsibleUserId);
  if (input.tagIds) await assertTagsInTenant(tenantId, input.tagIds);

  if (phone) {
    const dup = await findPhoneDuplicate(tenantId, phone);
    if (dup) {
      throw new AppError("Já existe contato com este telefone", 409, "DUPLICATE_PHONE", {
        contactId: dup.id,
      });
    }
  }
  if (email) {
    const dup = await prisma.contact.findFirst({
      where: { tenantId, email },
      select: { id: true },
    });
    if (dup) {
      throw new AppError("Já existe contato com este e-mail", 409, "DUPLICATE_EMAIL", {
        contactId: dup.id,
      });
    }
  }

  const name = resolveContactName(nameIn, phone);

  const contact = await prisma.contact.create({
    data: {
      tenantId,
      name,
      phone: phone ?? null,
      email: email ?? null,
      document: input.document?.trim() || null,
      company: input.company?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      source: input.source?.trim() || "manual",
      notes: input.notes?.trim() || null,
      commercialStatus: input.commercialStatus,
      priority: input.priority,
      score: input.score,
      nextAction: input.nextAction?.trim() || null,
      nextActionDueAt: input.nextActionDueAt ? new Date(input.nextActionDueAt) : null,
      responsibleUserId: input.responsibleUserId || null,
      consentMarketing: input.consentMarketing ?? false,
      consentWhatsapp: input.consentWhatsapp ?? false,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: contactListInclude,
  });

  await audit({
    tenantId,
    userId,
    action: "contact.create",
    entity: "contact",
    entityId: contact.id,
  });

  emitContactWebhook(tenantId, "contact.created", contact);
  broadcastToTenant(tenantId, "contact.created", { id: contact.id });

  return toContactListItem(contact);
}

export async function updateContact(
  tenantId: string,
  userId: string,
  id: string,
  input: ContactWriteInput
): Promise<ContactListItem> {
  const existing = assertFound(await prisma.contact.findFirst({ where: { id, tenantId } }));

  const phone = input.phone !== undefined ? normalizeWritePhone(input.phone) : undefined;
  const email = input.email !== undefined ? normalizeWriteEmail(input.email) : undefined;

  if (input.name !== undefined || phone !== undefined) {
    const nextName = input.name !== undefined ? (input.name || "").trim() : existing.name;
    const nextPhone =
      phone !== undefined ? phone : existing.phone ? normalizePhone(existing.phone) : null;
    if (!contactIdentityOk(nextName, nextPhone)) {
      throw new AppError("Informe nome ou telefone válido", 400, "IDENTITY_REQUIRED");
    }
  }

  await assertResponsibleInTenant(tenantId, input.responsibleUserId);
  if (input.tagIds) await assertTagsInTenant(tenantId, input.tagIds);

  if (phone) {
    const dup = await findPhoneDuplicate(tenantId, phone, id);
    if (dup) {
      throw new AppError("Já existe contato com este telefone", 409, "DUPLICATE_PHONE", {
        contactId: dup.id,
      });
    }
  }
  if (email) {
    const dup = await prisma.contact.findFirst({
      where: { tenantId, email, id: { not: id } },
      select: { id: true },
    });
    if (dup) {
      throw new AppError("Já existe contato com este e-mail", 409, "DUPLICATE_EMAIL", {
        contactId: dup.id,
      });
    }
  }

  if (input.tagIds) {
    await prisma.contactTag.deleteMany({ where: { contactId: id } });
    if (input.tagIds.length) {
      await prisma.contactTag.createMany({
        data: input.tagIds.map((tagId) => ({ contactId: id, tagId })),
      });
    }
  }

  if (input.score !== undefined && input.score !== existing.score) {
    await recordScoreChange({
      tenantId,
      contactId: id,
      previousScore: existing.score,
      newScore: input.score,
      source: "MANUAL",
      note: "Atualização manual do score",
    });
  }

  let stage: string | null | undefined = undefined;
  if (input.archived === true) stage = ARCHIVED_STAGE;
  if (input.archived === false) stage = null;

  const nameResolved =
    input.name !== undefined
      ? resolveContactName(
          input.name,
          phone !== undefined ? phone : existing.phone ? normalizePhone(existing.phone) : null
        )
      : undefined;

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...(nameResolved !== undefined ? { name: nameResolved } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.commercialStatus !== undefined
        ? { commercialStatus: input.commercialStatus }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.score !== undefined ? { score: input.score, scoreUpdatedAt: new Date() } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
      ...(input.nextActionDueAt !== undefined
        ? {
            nextActionDueAt: input.nextActionDueAt ? new Date(input.nextActionDueAt) : null,
          }
        : {}),
      ...(input.responsibleUserId !== undefined
        ? { responsibleUserId: input.responsibleUserId || null }
        : {}),
      ...(input.consentMarketing !== undefined
        ? { consentMarketing: input.consentMarketing }
        : {}),
      ...(input.consentWhatsapp !== undefined
        ? { consentWhatsapp: input.consentWhatsapp }
        : {}),
      ...(stage !== undefined ? { stage } : {}),
    },
    include: contactListInclude,
  });

  await audit({
    tenantId,
    userId,
    action: "contact.update",
    entity: "contact",
    entityId: contact.id,
  });

  emitContactWebhook(tenantId, "contact.updated", contact);
  broadcastToTenant(tenantId, "contact.updated", { id: contact.id });

  return toContactListItem(contact);
}

export async function deleteContact(
  tenantId: string,
  userId: string,
  id: string,
  opts?: { force?: boolean }
) {
  const existing = assertFound(
    await prisma.contact.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        _count: { select: { conversations: true, opportunities: true } },
      },
    })
  );

  const conversations = existing._count.conversations;
  const opportunities = existing._count.opportunities;
  if (!opts?.force && (conversations > 0 || opportunities > 0)) {
    throw new AppError(
      "Contato possui conversas ou oportunidades. Use force=true para excluir.",
      409,
      "CONTACT_HAS_HISTORY",
      { conversations, opportunities }
    );
  }

  await prisma.contact.delete({ where: { id: existing.id } });

  await audit({
    tenantId,
    userId,
    action: "contact.delete",
    entity: "contact",
    entityId: id,
  });
  emitContactWebhook(tenantId, "contact.deleted", existing);
  broadcastToTenant(tenantId, "contact.deleted", { id: existing.id });

  return { ok: true as const };
}
