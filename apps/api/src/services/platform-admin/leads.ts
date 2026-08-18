import type { Prisma, SalesLeadStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { createCompany } from "./companies";

export const SALES_LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "LOST",
  "SPAM",
] as const;

export type ListSalesLeadsQuery = {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export async function listSalesLeads(q: ListSalesLeadsQuery) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.SalesLeadWhereInput = {};

  if (q.status && q.status !== "ALL") {
    where.status = q.status as SalesLeadStatus;
  }

  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { companyName: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.salesLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        companyName: true,
        teamSize: true,
        message: true,
        source: true,
        status: true,
        convertedTenantId: true,
        convertedTenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.salesLead.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getSalesLeadsSummary() {
  const groups = await prisma.salesLead.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));

  return {
    total: groups.reduce((acc, g) => acc + g._count._all, 0),
    new: byStatus.NEW ?? 0,
    inPipeline: (byStatus.CONTACTED ?? 0) + (byStatus.QUALIFIED ?? 0),
    converted: byStatus.CONVERTED ?? 0,
    lost: byStatus.LOST ?? 0,
    spam: byStatus.SPAM ?? 0,
  };
}

export async function getSalesLeadHistory(id: string) {
  assertFound(
    await prisma.salesLead.findUnique({
      where: { id },
      select: { id: true },
    }),
    "Lead não encontrado."
  );

  const items = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: id },
        { metadata: { path: ["leadId"], equals: id } },
      ],
      action: { in: ["admin.lead.update_status", "admin.lead.convert"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return { items };
}

export async function getSalesLead(id: string) {
  const lead = assertFound(
    await prisma.salesLead.findUnique({
      where: { id },
      include: {
        convertedTenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
    "Lead não encontrado."
  );

  return lead;
}

export async function updateSalesLeadStatus(
  id: string,
  statusInput: string,
  actor: { sub: string; ip?: string }
) {
  const lead = assertFound(
    await prisma.salesLead.findUnique({ where: { id } }),
    "Lead não encontrado."
  );

  if (!(SALES_LEAD_STATUSES as readonly string[]).includes(statusInput)) {
    throw new AppError("Status de lead inválido.", 400, "INVALID_LEAD_STATUS");
  }

  const status = statusInput as (typeof SALES_LEAD_STATUSES)[number];

  if (status === "CONVERTED") {
    if (!lead.convertedTenantId) {
      throw new AppError(
        "Para converter o lead em empresa, utilize o fluxo de conversão.",
        400,
        "CONVERSION_FLOW_REQUIRED"
      );
    }
  }

  const oldStatus = lead.status;
  const updated = await prisma.salesLead.update({
    where: { id },
    data: { status },
    include: {
      convertedTenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  await audit({
    userId: actor.sub,
    tenantId: updated.convertedTenantId || undefined,
    action: "admin.lead.update_status",
    entity: "SalesLead",
    entityId: id,
    metadata: {
      leadId: id,
      leadEmail: lead.email,
      oldStatus,
      newStatus: status,
      actorSub: actor.sub,
      ip: actor.ip,
    },
  });

  return updated;
}

export async function convertSalesLeadToCompany(
  id: string,
  input: {
    name?: string;
    slug?: string;
    planId?: string;
    adminEmail?: string;
    adminName?: string;
    adminPassword?: string;
    forceSimilarName?: boolean;
  },
  actor: { sub: string; ip?: string }
) {
  const lead = assertFound(
    await prisma.salesLead.findUnique({ where: { id } }),
    "Lead não encontrado."
  );

  if (lead.status === "CONVERTED") {
    throw new AppError("Este lead já foi convertido em empresa.", 409, "LEAD_ALREADY_CONVERTED");
  }

  const companyName = (input.name || lead.companyName || "").trim();
  if (companyName.length < 2) {
    throw new AppError("Nome da empresa inválido.", 400, "INVALID_NAME");
  }

  const adminName = (input.adminName || lead.name || "").trim();
  if (adminName.length < 2) {
    throw new AppError("Nome do administrador inválido.", 400, "INVALID_ADMIN_NAME");
  }

  const adminEmail = (input.adminEmail || lead.email || "").trim().toLowerCase();
  if (!adminEmail || !adminEmail.includes("@")) {
    throw new AppError("E-mail do administrador inválido.", 400, "INVALID_EMAIL");
  }

  // 1. Reutiliza 100% o serviço oficial e transacional de criação de empresas
  const company = await createCompany(
    {
      name: companyName,
      slug: input.slug,
      planId: input.planId,
      adminEmail,
      adminName,
      adminPassword: input.adminPassword,
      forceSimilarName: input.forceSimilarName,
    },
    actor
  );

  // 2. Marca o lead como CONVERTED e vincula a empresa criada
  const updatedLead = await prisma.salesLead.update({
    where: { id },
    data: {
      status: "CONVERTED",
      convertedTenantId: company.id,
    },
    include: {
      convertedTenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  // 3. Registra auditoria da conversão
  await audit({
    userId: actor.sub,
    tenantId: company.id,
    action: "admin.lead.convert",
    entity: "SalesLead",
    entityId: id,
    metadata: {
      leadId: id,
      leadEmail: lead.email,
      companyId: company.id,
      companyName: company.name,
      actorSub: actor.sub,
      ip: actor.ip,
    },
  });

  return {
    company,
    lead: updatedLead,
  };
}
