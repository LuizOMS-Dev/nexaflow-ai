/**
 * Contatos 3.0 — listagem, detalhe e filtros.
 * Soft-archive: stage === "archived"
 * Phone search: contact-fields (digits + variants)
 */

import type { LeadPriority, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { assertFound } from "../../lib/errors";
import { digitsOnly, phoneLookupVariants } from "../../lib/contact-fields";

export const ARCHIVED_STAGE = "archived";

export type ContactListQuery = {
  search?: string;
  status?: string;
  priority?: string;
  responsibleUserId?: string;
  tagId?: string;
  /** 0=ativos 1=arquivados all=todos */
  archived?: "0" | "1" | "all";
  sort?: "updatedAt" | "createdAt" | "name" | "score" | "lastInteractionAt";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type ContactListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  document: string | null;
  source: string | null;
  score: number;
  commercialStatus: LeadStatus;
  priority: LeadPriority;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  stage: string | null;
  lastInteractionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  consentMarketing: boolean;
  consentWhatsapp: boolean;
  responsibleUser: { id: string; name: string; email: string } | null;
  tags: { id: string; name: string; color: string }[];
};

export type ContactDetail = ContactListItem & {
  notes: string | null;
  conversations: Array<{
    id: string;
    status: string;
    lastMessageAt: Date | null;
    lastMessagePreview: string | null;
    channelId: string | null;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    value: Prisma.Decimal | number | null;
    status: string;
    stageId: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueAt: Date | null;
    priority: string;
  }>;
  notesList: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: { id: string; name: string } | null;
  }>;
  scoreHistory: Array<{
    id: string;
    previousScore: number;
    newScore: number;
    source: string;
    createdAt: Date;
    note: string | null;
  }>;
  memory: {
    id: string;
    content: Prisma.JsonValue;
    summary: string | null;
    updatedAt: Date;
  } | null;
};

export const contactListInclude = {
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  responsibleUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ContactInclude;

/** Lista: só colunas do DTO — evita puxar notes/customData/scoreBreakdown do PG. */
export const contactListSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  company: true,
  jobTitle: true,
  city: true,
  state: true,
  document: true,
  source: true,
  score: true,
  commercialStatus: true,
  priority: true,
  nextAction: true,
  nextActionDueAt: true,
  stage: true,
  lastInteractionAt: true,
  createdAt: true,
  updatedAt: true,
  consentMarketing: true,
  consentWhatsapp: true,
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  responsibleUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ContactSelect;

const contactDetailInclude = {
  ...contactListInclude,
  memory: true,
  conversations: {
    orderBy: { lastMessageAt: "desc" as const },
    take: 10,
    select: {
      id: true,
      status: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      channelId: true,
    },
  },
  opportunities: {
    orderBy: { updatedAt: "desc" as const },
    take: 10,
    select: { id: true, title: true, value: true, status: true, stageId: true },
  },
  tasks: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
    select: { id: true, title: true, status: true, dueAt: true, priority: true },
  },
  notesList: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    include: { author: { select: { id: true, name: true } } },
  },
  scoreHistory: { orderBy: { createdAt: "desc" as const }, take: 20 },
} satisfies Prisma.ContactInclude;

/** Defense-in-depth: relações do detalhe também filtram tenantId (além do contact). */
function scopedDetailInclude(tenantId: string) {
  return {
    ...contactDetailInclude,
    conversations: {
      ...contactDetailInclude.conversations,
      where: { tenantId },
    },
    opportunities: {
      ...contactDetailInclude.opportunities,
      where: { tenantId },
    },
    tasks: {
      ...contactDetailInclude.tasks,
      where: { tenantId },
    },
    scoreHistory: {
      ...contactDetailInclude.scoreHistory,
      where: { tenantId },
    },
  } satisfies Prisma.ContactInclude;
}

type ContactListRecord = Prisma.ContactGetPayload<{ select: typeof contactListSelect }>;
type ContactDetailRecord = Prisma.ContactGetPayload<{ include: typeof contactDetailInclude }>;

function activeFilter(): Prisma.ContactWhereInput {
  return { OR: [{ stage: null }, { stage: { not: ARCHIVED_STAGE } }] };
}

function searchPhoneOr(term: string): Prisma.ContactWhereInput[] {
  const or: Prisma.ContactWhereInput[] = [{ phone: { contains: term } }];
  const digits = digitsOnly(term);
  if (digits && digits !== term) {
    or.push({ phone: { contains: digits } });
  }
  const variants = phoneLookupVariants(term);
  if (variants.length) {
    or.push({ phone: { in: variants } });
  }
  return or;
}

export function buildContactWhere(
  tenantId: string,
  q: ContactListQuery
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId };
  const and: Prisma.ContactWhereInput[] = [];

  const archived = q.archived ?? "0";
  if (archived === "0") and.push(activeFilter());
  else if (archived === "1") where.stage = ARCHIVED_STAGE;

  if (q.search?.trim()) {
    const s = q.search.trim();
    and.push({
      OR: [
        { name: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
        { company: { contains: s, mode: "insensitive" } },
        ...searchPhoneOr(s),
      ],
    });
  }
  if (q.status) where.commercialStatus = q.status as LeadStatus;
  if (q.priority) where.priority = q.priority as LeadPriority;
  if (q.responsibleUserId === "none") {
    where.responsibleUserId = null;
  } else if (q.responsibleUserId) {
    where.responsibleUserId = q.responsibleUserId;
  }
  if (q.tagId) where.tags = { some: { tagId: q.tagId } };

  if (and.length) where.AND = and;
  return where;
}

export function toContactListItem(c: ContactListRecord): ContactListItem {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    jobTitle: c.jobTitle,
    city: c.city,
    state: c.state,
    document: c.document,
    source: c.source,
    score: c.score,
    commercialStatus: c.commercialStatus,
    priority: c.priority,
    nextAction: c.nextAction,
    nextActionDueAt: c.nextActionDueAt,
    stage: c.stage,
    lastInteractionAt: c.lastInteractionAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    consentMarketing: c.consentMarketing,
    consentWhatsapp: c.consentWhatsapp,
    responsibleUser: c.responsibleUser
      ? {
          id: c.responsibleUser.id,
          name: c.responsibleUser.name,
          email: c.responsibleUser.email,
        }
      : null,
    tags: c.tags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color,
    })),
  };
}

function toContactDetail(c: ContactDetailRecord): ContactDetail {
  return {
    ...toContactListItem(c),
    notes: c.notes,
    conversations: c.conversations.map((conv) => ({
      id: conv.id,
      status: conv.status,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: conv.lastMessagePreview,
      channelId: conv.channelId,
    })),
    opportunities: c.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      value: o.value,
      status: o.status,
      stageId: o.stageId,
    })),
    tasks: c.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.dueAt,
      priority: t.priority,
    })),
    notesList: c.notesList.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      author: n.author ? { id: n.author.id, name: n.author.name } : null,
    })),
    scoreHistory: c.scoreHistory.map((h) => ({
      id: h.id,
      previousScore: h.previousScore,
      newScore: h.newScore,
      source: h.source,
      createdAt: h.createdAt,
      note: h.note,
    })),
    memory: c.memory
      ? {
          id: c.memory.id,
          content: c.memory.content,
          summary: c.memory.summary,
          updatedAt: c.memory.updatedAt,
        }
      : null,
  };
}

export async function listContacts(tenantId: string, q: ContactListQuery) {
  const page = q.page ?? 1;
  const limit = Math.min(q.limit ?? 20, 100);
  const sort = q.sort ?? "updatedAt";
  const order = q.order ?? "desc";
  const where = buildContactWhere(tenantId, q);
  const orderBy: Prisma.ContactOrderByWithRelationInput = { [sort]: order };

  const [rows, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: contactListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return { items: rows.map(toContactListItem), total, page, limit };
}

export async function getContact(tenantId: string, id: string): Promise<ContactDetail> {
  const row = assertFound(
    await prisma.contact.findFirst({
      where: { id, tenantId },
      include: scopedDetailInclude(tenantId),
    })
  );
  return toContactDetail(row);
}

export async function scoreHistory(tenantId: string, contactId: string) {
  assertFound(
    await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true },
    })
  );
  return prisma.contactScoreHistory.findMany({
    where: { contactId, tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
