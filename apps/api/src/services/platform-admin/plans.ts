import { prisma } from "../../lib/prisma";
import { assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { asInputJson } from "../../lib/json";

const JUNK_SLUGS = new Set(["basic", "premium", "trial", "demo", "test", "initial"]);

export async function listPlans(q: { activeOnly?: boolean; commercial?: boolean }) {
  let plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    include: { _count: { select: { tenants: true } } },
  });

  if (q.commercial) {
    plans = plans.filter((p) => {
      if (JUNK_SLUGS.has(p.slug)) return false;
      if (p.slug === "free") return true;
      if (q.activeOnly && !p.isActive) return false;
      return true;
    });
    plans.sort((a, b) => {
      if (a.slug === "free") return -1;
      if (b.slug === "free") return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  } else if (q.activeOnly) {
    plans = plans.filter((p) => p.isActive);
  }

  return plans;
}

export async function createPlan(body: {
  name: string;
  slug: string;
  description?: string;
  priceMonthly?: number;
  priceAnnual?: number | null;
  priceOnRequest?: boolean;
  maxUsers?: number;
  maxChannels?: number;
  maxContacts?: number;
  maxConversations?: number;
  maxAiMessages?: number;
  badge?: string | null;
  sortOrder?: number;
  features?: Record<string, unknown>;
}) {
  return prisma.plan.create({
    data: { ...body, features: asInputJson(body.features || {}) },
  });
}

export async function updatePlan(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    priceMonthly?: number;
    priceAnnual?: number | null;
    priceOnRequest?: boolean;
    maxUsers?: number;
    maxChannels?: number;
    maxContacts?: number;
    maxConversations?: number;
    maxAiMessages?: number;
    isActive?: boolean;
    badge?: string | null;
    sortOrder?: number;
    features?: Record<string, unknown>;
  },
  actor: { sub: string; ip?: string }
) {
  const current = assertFound(await prisma.plan.findUnique({ where: { id } }));
  const { features, ...rest } = body;
  if (rest.priceOnRequest === true && rest.priceMonthly === undefined) {
    rest.priceMonthly = 0;
  }

  const updated = await prisma.plan.update({
    where: { id },
    data: {
      ...rest,
      ...(features !== undefined ? { features: asInputJson(features) } : {}),
    },
    include: { _count: { select: { tenants: true } } },
  });

  await audit({
    userId: actor.sub,
    action: "plan.updated",
    entity: "plan",
    entityId: id,
    metadata: {
      slug: current.slug,
      fields: Object.keys(body),
      previousPriceMonthly: Number(current.priceMonthly),
      nextPriceMonthly:
        body.priceMonthly !== undefined ? body.priceMonthly : Number(current.priceMonthly),
      note: "Preços contratados de assinaturas existentes preservados",
    },
    ip: actor.ip,
  });

  return updated;
}
