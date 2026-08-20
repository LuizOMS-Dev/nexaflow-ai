import { randomBytes } from "crypto";
import type { Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { credentialsForNewUser, sendFirstAccessMail, type FirstAccessMethod } from "./users";
import { recordSecurityEvent } from "../security/security-event";
import { computeNextDueDate } from "../billing";
import { enrichTenantBilling, type SubscriptionRow } from "./billing-view";
import { isTestFixtureTenant, normalizeNameKey, slugify, tenantSettings } from "./fixtures";
import {
  normalizeCnpj,
  normalizeColor,
  normalizeEmail,
  normalizePhone,
  normalizeTimezone,
  normalizeUf,
  normalizeWebsite,
} from "./company-fields";

const FINANCIAL_FILTERS = [
  "ALL",
  "IN_GOOD_STANDING",
  "DUE_TODAY",
  "DUE_SOON",
  "OVERDUE",
  "PAYMENT_PENDING",
  "TRIAL",
  "CANCELLED",
  "SUSPENDED",
  "NEEDS_ATTENTION",
] as const;

const JUNK_PLAN_SLUGS = new Set(["basic", "premium", "trial", "demo", "test", "initial"]);

export type ListCompaniesQuery = {
  search?: string;
  status?: TenantStatus | "ALL";
  financial?: (typeof FINANCIAL_FILTERS)[number];
  planId?: string;
  page: number;
  limit: number;
};

export async function listCompanies(q: ListCompaniesQuery) {
  const where: Prisma.TenantWhereInput = {};
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.planId) where.planId = q.planId;
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { slug: { contains: s.toLowerCase() } },
      {
        companyProfile: {
          OR: [
            { tradeName: { contains: s, mode: "insensitive" } },
            { legalName: { contains: s, mode: "insensitive" } },
            { cnpj: { contains: s } },
            { email: { contains: s, mode: "insensitive" } },
            { phone: { contains: s } },
          ],
        },
      },
      {
        members: {
          some: {
            user: {
              OR: [
                { email: { contains: s, mode: "insensitive" } },
                { name: { contains: s, mode: "insensitive" } },
              ],
            },
          },
        },
      },
    ];
  }

  const liteSelect = {
    id: true,
    name: true,
    slug: true,
    status: true,
    settings: true,
    planId: true,
    plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true } },
  } as const;

  const [matchedLite, globalLite, allSubs] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: liteSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenant.findMany({ select: liteSelect }),
    prisma.subscription.findMany({
      include: {
        plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true } },
      },
    }),
  ]);

  const subMap = new Map(allSubs.map((s) => [s.tenantId, s as SubscriptionRow]));
  const realMatched = matchedLite.filter((t) => !isTestFixtureTenant(t));
  const realGlobal = globalLite.filter((t) => !isTestFixtureTenant(t));

  const summaryBillingGlobal = realGlobal.map((t) => enrichTenantBilling(t, subMap.get(t.id)));
  const suspendedCount = realGlobal.filter((t) => t.status === "SUSPENDED").length;
  const blockedCount = realGlobal.filter((t) => t.status === "BLOCKED").length;

  const summary = {
    total: realGlobal.length,
    active: realGlobal.filter((t) => t.status === "ACTIVE").length,
    overdue: summaryBillingGlobal.filter((b) => b.financialStatus === "OVERDUE").length,
    suspended: suspendedCount,
    blocked: blockedCount,
    suspendedBlocked: suspendedCount + blockedCount,
    trial: summaryBillingGlobal.filter((b) => b.financialStatus === "TRIAL").length,
    dueIn7Days: summaryBillingGlobal.filter(
      (b) => b.financialStatus === "DUE_SOON" || b.financialStatus === "DUE_TODAY"
    ).length,
    cancelled: realGlobal.filter(
      (t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION"
    ).length,
    needsAttention: summaryBillingGlobal.filter((b) => b.needsAttention).length,
  };

  let pageIds = realMatched.map((t) => t.id);
  if (q.financial && q.financial !== "ALL") {
    const billingById = new Map(
      realMatched.map((t) => [t.id, enrichTenantBilling(t, subMap.get(t.id))])
    );
    pageIds = pageIds.filter((id) => {
      const b = billingById.get(id);
      if (!b) return false;
      return q.financial === "NEEDS_ATTENTION" ? b.needsAttention : b.financialStatus === q.financial;
    });
  }

  const total = pageIds.length;
  const start = (q.page - 1) * q.limit;
  const idsForPage = pageIds.slice(start, start + q.limit);

  const pageRows =
    idsForPage.length === 0
      ? []
      : await prisma.tenant.findMany({
          where: { id: { in: idsForPage } },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            primaryColor: true,
            createdAt: true,
            settings: true,
            planId: true,
            companyProfile: true,
            plan: {
              select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true },
            },
            _count: { select: { members: true, contacts: true, conversations: true } },
            members: {
              where: { role: "ADMIN", isActive: true },
              take: 1,
              select: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        });

  const order = new Map(idsForPage.map((id, i) => [id, i]));
  const items = pageRows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((t) => {
      const billing = enrichTenantBilling(t, subMap.get(t.id));
      const primaryAdmin = t.members[0]?.user || null;
      const { members: _m, settings: _s, ...rest } = t;
      return { ...rest, ...billing, primaryAdmin };
    });

  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    summary,
  };
}

export async function getCompanyOverview(id: string) {
  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        companyProfile: true,
        _count: {
          select: {
            members: true,
            contacts: true,
            conversations: true,
            channels: true,
            opportunities: true,
            tasks: true,
          },
        },
        members: {
          take: 100,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                avatarType: true,
                avatarPresetId: true,
                avatarColor: true,
                lastLoginAt: true,
              },
            },
          },
        },
      },
    })
  );

  const [subscription, payments, recentAudit] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId: id },
      include: {
        plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId: id },
      orderBy: { paidAt: "desc" },
      take: 10,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const billing = enrichTenantBilling(tenant, subscription as SubscriptionRow | null);
  const { resolveScheduleEligibility } = await import("./tenant-deletion");
  const scheduleEligibility = resolveScheduleEligibility({
    hasCharge: Boolean(
      billing.priceKind === "FIXED" && billing.contractedPrice != null && billing.contractedPrice > 0
    ),
    currentPeriodEnd: subscription?.currentPeriodEnd,
  });
  const { getUsageSnapshot } = await import("../entitlements");
  const { tenantNeedsOnboarding } = await import("../onboarding/company-onboarding");
  const usageSnapshot = await getUsageSnapshot(id);

  const lastConv = await prisma.conversation.findFirst({
    where: { tenantId: id, lastMessageAt: { not: null } },
    orderBy: { lastMessageAt: "desc" },
    select: { lastMessageAt: true },
  });
  const auditAt = recentAudit[0]?.createdAt ?? null;
  const convAt = lastConv?.lastMessageAt ?? null;
  const lastActivityAt =
    convAt && auditAt
      ? convAt > auditAt
        ? convAt
        : auditAt
      : convAt || auditAt;

  const profileSrc = tenant.companyProfile;
  const profile = {
    legalName: profileSrc?.legalName ?? tenant.name,
    tradeName: profileSrc?.tradeName ?? tenant.name,
    cnpj: profileSrc?.cnpj ?? null,
    email: profileSrc?.email ?? null,
    commercialEmail: profileSrc?.email ?? null,
    phone: profileSrc?.phone ?? null,
    website: profileSrc?.website ?? null,
    segment: profileSrc?.segment ?? null,
    city: profileSrc?.city ?? null,
    state: profileSrc?.state ?? null,
    timezone: profileSrc?.timezone ?? "America/Sao_Paulo",
    language: profileSrc?.language ?? "pt-BR",
  };

  const mappedPayments = payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paidAt: p.paidAt,
    referencePeriod: p.referencePeriod,
    method: p.method,
    notes: p.notes,
    createdAt: p.createdAt,
  }));

  const hasAdmin = tenant.members.some((m) => m.role === "ADMIN" && m.isActive);
  const hasChannel = (tenant._count?.channels ?? 0) > 0;
  const completed = !tenantNeedsOnboarding(tenant.settings);

  return {
    ...tenant,
    ...billing,
    profile,
    payments: mappedPayments,
    recentPayments: mappedPayments,
    recentAudit,
    auditLogs: recentAudit,
    lastActivityAt,
    onboarding: {
      completed,
      hasAdmin,
      hasProfile: Boolean(profileSrc),
      hasChannel,
    },
    limits: usageSnapshot.limits,
    usage: usageSnapshot.usage,
    scheduledDeletionAt: tenant.scheduledDeletionAt,
    deletionPreviousStatus: tenant.deletionPreviousStatus,
    scheduleEligibility,
  };
}

export async function createCompany(
  input: {
    name: string;
    slug?: string;
    planId?: string;
    adminEmail: string;
    adminName: string;
    adminPassword?: string;
    accessMethod?: FirstAccessMethod;
    forceSimilarName?: boolean;
    // Dados de CompanyProfile opcionais
    legalName?: string;
    tradeName?: string;
    cnpj?: string;
    phone?: string;
    segment?: string;
    city?: string;
    state?: string;
    website?: string;
  },
  actor: { sub: string; ip?: string }
) {
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new AppError("O nome da empresa deve ter pelo menos 2 caracteres.", 400, "INVALID_NAME");
  }

  const nameKey = normalizeNameKey(trimmedName);
  const similar = (
    await prisma.tenant.findMany({ select: { id: true, name: true } })
  ).filter((t) => normalizeNameKey(t.name) === nameKey);
  if (similar.length && !input.forceSimilarName) {
    throw new AppError(
      `Já existe uma empresa com nome semelhante: ${similar.map((s) => s.name).join(", ")}`,
      409,
      "SIMILAR_TENANT_NAME"
    );
  }

  const email = input.adminEmail.toLowerCase().trim();
  if (!email || !email.includes("@")) {
    throw new AppError("E-mail do administrador inválido.", 400, "INVALID_EMAIL");
  }

  const adminName = input.adminName.trim();
  if (adminName.length < 2) {
    throw new AppError("Nome do administrador deve ter pelo menos 2 caracteres.", 400, "INVALID_ADMIN_NAME");
  }

  const accessMethod: FirstAccessMethod =
    input.accessMethod === "invite"
      ? "invite"
      : input.accessMethod === "temporary_password" || Boolean(input.adminPassword)
        ? "temporary_password"
        : "invite";

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // 1. Slug único
      let slug = (input.slug || slugify(trimmedName)).trim().toLowerCase();
      if (!slug) slug = `tenant-${randomBytes(4).toString("hex")}`;

      if (input.slug) {
        const existingSlug = await tx.tenant.findUnique({ where: { slug } });
        if (existingSlug) {
          throw new AppError("Este identificador (slug) já está em uso.", 409, "SLUG_TAKEN");
        }
      } else {
        const existingSlug = await tx.tenant.findUnique({ where: { slug } });
        if (existingSlug) {
          slug = `${slug}-${randomBytes(3).toString("hex")}`;
        }
      }

      // 2. Validação do Plano
      let plan = null;
      if (input.planId) {
        plan = await tx.plan.findUnique({ where: { id: input.planId } });
        if (!plan || plan.isActive === false || JUNK_PLAN_SLUGS.has(plan.slug)) {
          throw new AppError(
            "O plano selecionado está inativo ou indisponível para novas contratações.",
            400,
            "PLAN_UNAVAILABLE"
          );
        }
      } else {
        plan =
          (await tx.plan.findFirst({ where: { slug: "free", isActive: true } })) ||
          (await tx.plan.findFirst({
            where: { slug: { in: ["starter", "initial"] }, isActive: true },
          })) ||
          (await tx.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } }));
      }

      // 3. Usuário Administrador (reutiliza existente sem sobrescrever senha/MFA/status)
      let user = await tx.user.findUnique({ where: { email } });
      let isNewUser = false;
      let firstAccess: FirstAccessMethod | "existing" = "existing";
      if (!user) {
        isNewUser = true;
        const creds = await credentialsForNewUser(accessMethod, input.adminPassword);
        firstAccess = creds.method;
        user = await tx.user.create({
          data: {
            email,
            name: adminName,
            passwordHash: creds.passwordHash,
            status: "ACTIVE",
            isActive: true,
            mustChangePassword: creds.mustChangePassword,
          },
        });
      }

      // 4. Criação do Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: trimmedName,
          slug,
          planId: plan?.id || null,
          status: "ACTIVE",
          settings: {
            onboardingCompleted: false,
            adminProvisioned: true,
            provisionedAt: new Date().toISOString(),
          },
          companyProfile: {
            create: {
              legalName: input.legalName?.trim() || trimmedName,
              tradeName: input.tradeName?.trim() || trimmedName,
              cnpj: input.cnpj?.trim() || null,
              email: null,
              phone: input.phone?.trim() || null,
              segment: input.segment?.trim() || null,
              city: input.city?.trim() || null,
              state: input.state?.trim() || null,
              website: input.website?.trim() || null,
              timezone: "America/Sao_Paulo",
              language: "pt-BR",
            },
          },
          members: {
            create: {
              userId: user.id,
              role: "ADMIN",
              status: "ACTIVE",
              isActive: true,
            },
          },
          pipelines: {
            create: {
              name: "Funil Comercial",
              isDefault: true,
              stages: {
                create: [
                  { name: "Novos leads", position: 0, probability: 10, color: "#94a3b8" },
                  { name: "Qualificado", position: 1, probability: 40, color: "#3b82f6" },
                  { name: "Proposta", position: 2, probability: 70, color: "#f59e0b" },
                  { name: "Ganho", position: 3, probability: 100, color: "#22c55e", isWon: true },
                  { name: "Perdido", position: 4, probability: 0, color: "#ef4444", isLost: true },
                ],
              },
            },
          },
          channels: {
            create: { type: "WEBCHAT", name: "Chat do site" },
          },
          aiAgents: {
            create: {
              name: "Assistente",
              instructions: "Assistente comercial padrão. Responda em pt-BR. Não invente preços.",
            },
          },
        },
        include: {
          plan: true,
          companyProfile: true,
        },
      });

      // 5. Assinatura 1:1 — existe mesmo sem plano no catálogo.
      let contractedPriceMonthly: number | null = null;
      let contractedPriceAnnual: number | null = null;

      if (plan) {
        if (plan.slug === "free") {
          contractedPriceMonthly = 0;
          contractedPriceAnnual = 0;
        } else if (plan.priceOnRequest || plan.slug === "enterprise") {
          contractedPriceMonthly = null;
          contractedPriceAnnual = null;
        } else {
          const catMonthly = Number(plan.priceMonthly || 0);
          contractedPriceMonthly = catMonthly;
          contractedPriceAnnual =
            plan.priceAnnual != null
              ? Number(plan.priceAnnual)
              : Math.round(catMonthly * 12 * 100) / 100;
        }
      }

      const billingDueDay = 10;
      const hasCharge = contractedPriceMonthly != null && contractedPriceMonthly > 0;
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan?.id || null,
          billingStatus: "ACTIVE",
          billingCycle: "MONTHLY",
          priceMonthly: contractedPriceMonthly,
          priceAnnual: contractedPriceAnnual,
          billingDueDay: hasCharge ? billingDueDay : contractedPriceMonthly === 0 ? null : billingDueDay,
          currentPeriodEnd: hasCharge ? computeNextDueDate(billingDueDay) : null,
        },
      });

      // 6. Registro de Auditoria Atômico
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          tenantId: tenant.id,
          action: "admin.tenant.create",
          entity: "tenant",
          entityId: tenant.id,
          metadata: {
            adminUserId: user.id,
            adminEmail: email,
            isNewUser,
            firstAccess: isNewUser ? firstAccess : "existing",
            planId: plan?.id || null,
            planSlug: plan?.slug || null,
            contractedPriceMonthly,
          },
          ip: actor.ip || null,
        },
      });

      return { tenant, isNewUser, firstAccess, adminEmail: email, adminUserId: user.id };
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "";
      if (target.includes("slug")) {
        throw new AppError("Este identificador (slug) já está em uso.", 409, "SLUG_TAKEN");
      }
      throw new AppError("Conflito de unicidade ao criar a empresa.", 409, "DUPLICATE_RESOURCE");
    }
    throw err;
  }

  // Tarefas assíncronas complementares (pós-commit, não bloqueiam a transação)
  try {
    const { provisionTenantKnowledge, ensureOptionalTrainingDocs } = await import(
      "../knowledge-starter"
    );
    await provisionTenantKnowledge(created.tenant.id);
    await ensureOptionalTrainingDocs(created.tenant.id);
  } catch {
    /* pós-commit */
  }

  if (created.isNewUser && created.firstAccess === "invite") {
    await sendFirstAccessMail(created.adminEmail, created.adminUserId, "company").catch(() => null);
  }

  void import("../tenant-setup-checklist")
    .then(async ({ markAgentCreated, markPipelineCreated }) => {
      await markAgentCreated(created.tenant.id);
      await markPipelineCreated(created.tenant.id);
    })
    .catch(() => null);

  return created.tenant;
}

export async function updateCompany(
  tenantId: string,
  body: {
    name?: string;
    primaryColor?: string | null;
    legalName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    email?: string | null;
    commercialEmail?: string | null;
    phone?: string | null;
    website?: string | null;
    segment?: string | null;
    city?: string | null;
    state?: string | null;
    timezone?: string | null;
    language?: string | null;
    planId?: string | null;
    billingDueDay?: number | null;
    priceMonthly?: number | null;
  },
  actor: { sub: string; ip?: string }
) {
  const current = assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));
  const name = body.name != null ? body.name.trim() : undefined;
  if (name !== undefined && name.length < 2) {
    throw new AppError("O nome da empresa deve ter pelo menos 2 caracteres.", 400, "INVALID_NAME");
  }
  const primaryColor =
    body.primaryColor !== undefined ? normalizeColor(body.primaryColor) || "#6366f1" : undefined;

  const profilePatch = {
    legalName: body.legalName,
    tradeName: body.tradeName,
    cnpj: body.cnpj !== undefined ? normalizeCnpj(body.cnpj) : undefined,
    email:
      body.email !== undefined
        ? normalizeEmail(body.email)
        : body.commercialEmail !== undefined
          ? normalizeEmail(body.commercialEmail)
          : undefined,
    phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined,
    website: body.website !== undefined ? normalizeWebsite(body.website) : undefined,
    segment: body.segment,
    city: body.city,
    state: body.state !== undefined ? normalizeUf(body.state) : undefined,
    timezone: body.timezone !== undefined ? normalizeTimezone(body.timezone) : undefined,
    language: body.language,
  };

  const hasProfile = Object.values(profilePatch).some((v) => v !== undefined);

  await prisma.$transaction(async (tx) => {
    if (name !== undefined || primaryColor !== undefined) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(primaryColor !== undefined ? { primaryColor } : {}),
        },
      });
    }

    if (hasProfile) {
      await tx.companyProfile.upsert({
        where: { tenantId },
        update: Object.fromEntries(
          Object.entries(profilePatch).filter(([, v]) => v !== undefined)
        ),
        create: {
          tenantId,
          legalName: profilePatch.legalName || name || current.name,
          tradeName: profilePatch.tradeName || name || current.name,
          cnpj: profilePatch.cnpj ?? null,
          email: profilePatch.email ?? null,
          phone: profilePatch.phone ?? null,
          website: profilePatch.website ?? null,
          segment: profilePatch.segment ?? null,
          city: profilePatch.city ?? null,
          state: profilePatch.state ?? null,
          timezone: profilePatch.timezone || "America/Sao_Paulo",
          language: profilePatch.language || "pt-BR",
        },
      });
    }

    if (body.planId !== undefined || body.billingDueDay !== undefined || body.priceMonthly !== undefined) {
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      let planId = body.planId === undefined ? sub?.planId ?? current.planId : body.planId;
      if (body.planId) {
        const plan = await tx.plan.findUnique({ where: { id: body.planId } });
        if (!plan) throw new AppError("Plano não encontrado.", 400, "PLAN_UNAVAILABLE");
        planId = plan.id;
        await tx.tenant.update({ where: { id: tenantId }, data: { planId: plan.id } });
      }
      const dueDay =
        body.billingDueDay != null
          ? Math.min(31, Math.max(1, Math.floor(body.billingDueDay)))
          : sub?.billingDueDay ?? 10;
      const price =
        body.priceMonthly === undefined
          ? sub?.priceMonthly != null
            ? Number(sub.priceMonthly)
            : null
          : body.priceMonthly;
      const hasCharge = price != null && price > 0;
      await tx.subscription.upsert({
        where: { tenantId },
        update: {
          ...(planId ? { planId } : {}),
          billingDueDay: dueDay,
          priceMonthly: price,
          currentPeriodEnd: hasCharge ? computeNextDueDate(dueDay) : null,
        },
        create: {
          tenantId,
          planId: planId || null,
          billingStatus: "ACTIVE",
          billingCycle: "MONTHLY",
          priceMonthly: price,
          billingDueDay: dueDay,
          currentPeriodEnd: hasCharge ? computeNextDueDate(dueDay) : null,
        },
      });
    }
  });

  await audit({
    userId: actor.sub,
    tenantId,
    action: "tenant.updated",
    entity: "tenant",
    entityId: tenantId,
    metadata: { fields: Object.keys(body) },
    ip: actor.ip,
  });

  return getCompanyOverview(tenantId);
}

export async function updateCompanyProfile(
  tenantId: string,
  profile: {
    legalName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    segment?: string | null;
    city?: string | null;
    state?: string | null;
    timezone?: string | null;
    language?: string | null;
  },
  actor: { sub: string; ip?: string }
) {
  return updateCompany(tenantId, profile, actor);
}

export async function updateTenantStatus(
  tenantId: string,
  body: {
    status: TenantStatus;
    reason?: string;
  },
  actor: { sub: string; ip?: string }
) {
  const current = assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));
  const prev = tenantSettings(current.settings);

  const nextSettings: Record<string, unknown> = { ...prev };
  let auditAction = "admin.tenant.update";

  if (body.status === "BLOCKED") {
    nextSettings.blockedAt = new Date().toISOString();
    nextSettings.blockedBy = actor.sub;
    nextSettings.blockReason = body.reason || null;
    auditAction = "company.blocked";
  } else if (body.status === "SUSPENDED") {
    nextSettings.suspendedAt = new Date().toISOString();
    nextSettings.suspendedBy = actor.sub;
    nextSettings.suspendReason = body.reason || null;
    auditAction = "company.suspended";
  } else if (body.status === "ACTIVE") {
    nextSettings.reactivatedAt = new Date().toISOString();
    delete nextSettings.blockReason;
    delete nextSettings.suspendReason;
    auditAction = "company.reactivated";
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status: body.status,
      settings: nextSettings as Prisma.InputJsonValue,
    },
    include: {
      plan: true,
      companyProfile: true,
    },
  });

  await audit({
    userId: actor.sub,
    tenantId,
    action: auditAction,
    entity: "tenant",
    entityId: tenantId,
    metadata: {
      previousStatus: current.status,
      nextStatus: body.status,
      reason: body.reason || null,
    },
    ip: actor.ip,
  });

  return updated;
}

/** @deprecated Use executeCompanyDeletion — exclusão real (now | schedule). */
export async function requestCompanyDeletion(
  id: string,
  body: { confirmName: string; acknowledged?: boolean; mode?: "now" | "schedule"; reason?: string },
  actor: { sub: string; ip?: string }
) {
  const { executeCompanyDeletion } = await import("./tenant-deletion");
  return executeCompanyDeletion(
    id,
    {
      confirmName: body.confirmName,
      acknowledged: Boolean(body.acknowledged),
      mode: body.mode === "schedule" ? "schedule" : "now",
      reason: body.reason,
    },
    actor
  );
}
