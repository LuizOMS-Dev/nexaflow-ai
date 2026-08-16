import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { hashPassword, validatePasswordPolicy } from "../security/password";
import { recordSecurityEvent } from "../security/security-event";
import { advancePeriodAfterPayment, computeNextDueDate } from "../billing";
import { enrichTenantBilling, type SubscriptionRow } from "./billing-view";
import { isTestFixtureTenant, normalizeNameKey, slugify, tenantSettings } from "./fixtures";

const TENANT_STATUSES = [
  "ACTIVE",
  "TRIAL",
  "BLOCKED",
  "SUSPENDED",
  "CANCELLED",
  "PENDING_DELETION",
] as const;

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
  status?: (typeof TENANT_STATUSES)[number] | "ALL";
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

  const [allMatched, allTenantsGlobal, allSubs] = await Promise.all([
    prisma.tenant.findMany({
      where,
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
        plan: { select: { id: true, name: true, slug: true, priceMonthly: true, priceOnRequest: true } },
        _count: { select: { members: true, contacts: true, conversations: true } },
        members: {
          where: { role: "ADMIN", isActive: true },
          take: 1,
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        settings: true,
        planId: true,
      },
    }),
    prisma.subscription.findMany({
      include: {
        plan: { select: { id: true, name: true, priceMonthly: true, priceOnRequest: true } },
      },
    }),
  ]);

  const subMap = new Map(allSubs.map((s) => [s.tenantId, s as SubscriptionRow]));

  const realMatched = allMatched.filter((t) => !isTestFixtureTenant(t));
  const realGlobal = allTenantsGlobal.filter((t) => !isTestFixtureTenant(t));

  let enriched = realMatched.map((t) => {
    const billing = enrichTenantBilling(t, subMap.get(t.id));
    const primaryAdmin = t.members[0]?.user || null;
    const { members: _m, settings: _s, ...rest } = t;
    return { ...rest, ...billing, primaryAdmin };
  });

  if (q.financial && q.financial !== "ALL") {
    if (q.financial === "NEEDS_ATTENTION") {
      enriched = enriched.filter((t) => t.needsAttention);
    } else {
      enriched = enriched.filter((t) => t.financialStatus === q.financial);
    }
  }

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
    trial: realGlobal.filter((t) => t.status === "TRIAL").length,
    dueIn7Days: summaryBillingGlobal.filter(
      (b) => b.financialStatus === "DUE_SOON" || b.financialStatus === "DUE_TODAY"
    ).length,
    cancelled: realGlobal.filter(
      (t) => t.status === "CANCELLED" || t.status === "PENDING_DELETION"
    ).length,
    needsAttention: summaryBillingGlobal.filter((b) => b.needsAttention).length,
  };

  const total = enriched.length;
  const start = (q.page - 1) * q.limit;
  return {
    items: enriched.slice(start, start + q.limit),
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    summary,
  };
}

export async function getCompany(id: string) {
  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
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
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })
  );

  const [auditLogs, subscription, payments] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.subscription.findUnique({
      where: { tenantId: id },
      include: {
        plan: { select: { id: true, name: true, priceMonthly: true, priceOnRequest: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId: id },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
  ]);

  const settings = tenantSettings(tenant.settings);
  const billing = enrichTenantBilling(tenant, subscription as SubscriptionRow | null);
  const { getUsageSnapshot } = await import("../entitlements");
  const usageSnapshot = await getUsageSnapshot(id);

  return {
    ...tenant,
    ...billing,
    profile: {
      segment: (settings.segment as string) || null,
      phone: (settings.phone as string) || null,
      website: (settings.website as string) || null,
      commercialEmail: (settings.commercialEmail as string) || null,
      city: (settings.city as string) || null,
      state: (settings.state as string) || null,
      timezone: (settings.timezone as string) || "America/Sao_Paulo",
      language: (settings.language as string) || "pt-BR",
      onboardingCompleted: Boolean(settings.onboardingCompleted),
    },
    lifecycle: {
      suspendedAt: (settings.suspendedAt as string) || null,
      suspendReason: (settings.suspendReason as string) || null,
      suspendedBy: (settings.suspendedBy as string) || null,
      blockedAt: (settings.blockedAt as string) || null,
      blockReason: (settings.blockReason as string) || null,
      blockedBy: (settings.blockedBy as string) || null,
      cancelledAt: (settings.cancelledAt as string) || null,
      cancelReason: (settings.cancelReason as string) || null,
      cancelledBy: (settings.cancelledBy as string) || null,
      deletionRequestedAt: (settings.deletionRequestedAt as string) || null,
      deletionRequestedBy: (settings.deletionRequestedBy as string) || null,
      archivedAt: (settings.archivedAt as string) || null,
      reactivatedAt: (settings.reactivatedAt as string) || null,
    },
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referencePeriod: p.referencePeriod,
      method: p.method,
      notes: p.notes,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    })),
    auditLogs,
    limits: usageSnapshot.limits,
    usage: usageSnapshot.usage,
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
    forceSimilarName?: boolean;
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

  // Executa toda a criação em transação atômica
  const created = await prisma.$transaction(async (tx) => {
    // 1. Slug único
    let slug = (input.slug || slugify(trimmedName)).trim().toLowerCase();
    if (!slug) slug = `tenant-${randomBytes(4).toString("hex")}`;
    
    if (input.slug) {
      const existingSlug = await tx.tenant.findUnique({ where: { slug } });
      if (existingSlug) {
        throw new AppError("Este identificador (slug) já está em uso.", 409, "SLUG_TAKEN");
      }
    } else {
      // Auto-gerado: garante unicidade adicionando sufixo se necessário
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
      // Default: Gratuito (free). Fallback: starter
      plan =
        (await tx.plan.findFirst({ where: { slug: "free", isActive: true } })) ||
        (await tx.plan.findFirst({
          where: { slug: { in: ["starter", "initial"] }, isActive: true },
        })) ||
        (await tx.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } }));
    }

    // 3. Usuário Administrador
    let user = await tx.user.findUnique({ where: { email } });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      if (input.adminPassword) {
        const policy = validatePasswordPolicy(input.adminPassword);
        if (policy) throw new AppError(policy, 400, "WEAK_PASSWORD");
      }
      const tempPassword = input.adminPassword || `${randomBytes(18).toString("base64url")}Aa1!`;
      user = await tx.user.create({
        data: {
          email,
          name: adminName,
          passwordHash: await hashPassword(tempPassword),
          status: input.adminPassword ? "ACTIVE" : "INVITED",
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
          onboardingCompleted: true,
          adminProvisioned: true,
          provisionedAt: new Date().toISOString(),
          timezone: "America/Sao_Paulo",
          language: "pt-BR",
        },
        members: {
          create: {
            userId: user.id,
            role: "ADMIN",
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
      include: { plan: true },
    });

    // 5. Criação da Assinatura com Preço Contratado Congelado
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

      const billingDueDay = 10;
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          billingStatus: "ACTIVE",
          billingCycle: "MONTHLY",
          priceMonthly: contractedPriceMonthly,
          priceAnnual: contractedPriceAnnual,
          billingDueDay,
          currentPeriodEnd: computeNextDueDate(billingDueDay),
        },
      });
    }

    // 6. Registro de Auditoria Atômica
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
          planId: plan?.id || null,
          planSlug: plan?.slug || null,
          contractedPriceMonthly,
        },
        ip: actor.ip || null,
      },
    });

    return tenant;
  });

  // Tarefas assíncronas complementares (não bloqueiam nem comprometem a transação)
  try {
    const { provisionTenantKnowledge, ensureOptionalTrainingDocs } = await import(
      "../knowledge-starter"
    );
    await provisionTenantKnowledge(created.id);
    await ensureOptionalTrainingDocs(created.id);
  } catch {
    /* não bloqueia criação */
  }

  void import("../tenant-setup-checklist")
    .then(async ({ markAgentCreated, markPipelineCreated }) => {
      await markAgentCreated(created.id);
      await markPipelineCreated(created.id);
    })
    .catch(() => null);

  return created;
}

export type CompanyAction =
  | "block"
  | "unblock"
  | "suspend"
  | "reactivate"
  | "cancel_subscription"
  | "request_deletion"
  | "cancel_deletion";

export async function updateCompany(
  id: string,
  body: {
    name?: string;
    status?: (typeof TENANT_STATUSES)[number];
    planId?: string | null;
    primaryColor?: string;
    logoUrl?: string | null;
    segment?: string | null;
    phone?: string | null;
    website?: string | null;
    commercialEmail?: string | null;
    city?: string | null;
    state?: string | null;
    suspendReason?: string;
    blockReason?: string;
    cancelReason?: string;
    billingDueDay?: number | null;
    priceMonthly?: number | null;
    nextDueAt?: string | null;
    action?: CompanyAction;
  },
  actor: { sub: string; ip?: string }
) {
  const current = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  const prev = tenantSettings(current.settings);

  let logoUrl: string | null | undefined = undefined;
  if (body.logoUrl !== undefined) {
    const { sanitizeLogoInput } = await import("../security/logo-upload");
    logoUrl = await sanitizeLogoInput(body.logoUrl);
  }

  const nextSettings: Record<string, unknown> = { ...prev };
  for (const k of ["segment", "phone", "website", "commercialEmail", "city", "state"] as const) {
    if (body[k] !== undefined) nextSettings[k] = body[k];
  }

  let nextStatus = body.status;
  let auditAction = "admin.tenant.update";
  if (body.action === "block") {
    nextStatus = "BLOCKED";
    nextSettings.blockedAt = new Date().toISOString();
    nextSettings.blockedBy = actor.sub;
    nextSettings.blockReason = body.blockReason || body.suspendReason || null;
    auditAction = "company.blocked";
  } else if (body.action === "unblock") {
    nextStatus = "ACTIVE";
    nextSettings.unblockedAt = new Date().toISOString();
    delete nextSettings.blockReason;
    auditAction = "company.unblocked";
  } else if (body.action === "suspend") {
    nextStatus = "SUSPENDED";
    nextSettings.suspendReason = body.suspendReason || null;
    nextSettings.suspendedAt = new Date().toISOString();
    nextSettings.suspendedBy = actor.sub;
    auditAction = "company.suspended";
  } else if (body.action === "reactivate") {
    nextStatus = "ACTIVE";
    nextSettings.reactivatedAt = new Date().toISOString();
    delete nextSettings.suspendReason;
    delete nextSettings.blockReason;
    auditAction = "company.reactivated";
  } else if (body.action === "cancel_subscription") {
    nextStatus = "CANCELLED";
    nextSettings.cancelledAt = new Date().toISOString();
    nextSettings.cancelledBy = actor.sub;
    nextSettings.cancelReason = body.cancelReason || null;
    auditAction = "company.subscription_canceled";
  } else if (body.action === "request_deletion") {
    nextStatus = "PENDING_DELETION";
    nextSettings.deletionRequestedAt = new Date().toISOString();
    nextSettings.deletionRequestedBy = actor.sub;
    nextSettings.deletionReason = body.cancelReason || body.suspendReason || null;
    auditAction = "company.deletion_requested";
  } else if (body.action === "cancel_deletion") {
    nextStatus = "ACTIVE";
    delete nextSettings.deletionRequestedAt;
    delete nextSettings.deletionRequestedBy;
    delete nextSettings.deletionReason;
    auditAction = "company.deletion_canceled";
  }

  if (nextStatus === "SUSPENDED" && !body.action) {
    if (body.suspendReason) nextSettings.suspendReason = body.suspendReason;
    nextSettings.suspendedAt = new Date().toISOString();
    nextSettings.suspendedBy = actor.sub;
    auditAction = "company.suspended";
  }
  if (nextStatus === "BLOCKED" && !body.action) {
    nextSettings.blockedAt = new Date().toISOString();
    nextSettings.blockedBy = actor.sub;
    if (body.blockReason) nextSettings.blockReason = body.blockReason;
    auditAction = "company.blocked";
  }
  if (
    nextStatus === "ACTIVE" &&
    !body.action &&
    (current.status === "SUSPENDED" || current.status === "BLOCKED")
  ) {
    nextSettings.reactivatedAt = new Date().toISOString();
    delete nextSettings.suspendReason;
    delete nextSettings.blockReason;
    auditAction = "company.reactivated";
  }
  if (nextStatus === "CANCELLED" && !body.action) {
    nextSettings.cancelledAt = new Date().toISOString();
    nextSettings.cancelledBy = actor.sub;
    if (body.cancelReason) nextSettings.cancelReason = body.cancelReason;
    auditAction = "company.subscription_canceled";
  }

  if (body.planId && body.planId !== current.planId) {
    const newPlan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (newPlan) {
      const [users, contacts, agents, channels] = await Promise.all([
        prisma.membership.count({ where: { tenantId: id, isActive: true } }),
        prisma.contact.count({ where: { tenantId: id } }),
        prisma.aiAgent.count({ where: { tenantId: id } }),
        prisma.channel.count({ where: { tenantId: id, type: "WHATSAPP", isActive: true } }),
      ]);
      const feats = (newPlan.features || {}) as Record<string, unknown>;
      const maxAgents = Number(feats.maxAgents ?? 1) || 1;
      const issues: string[] = [];
      if (users > newPlan.maxUsers) issues.push(`${users} usuários (limite ${newPlan.maxUsers})`);
      if (contacts > newPlan.maxContacts) issues.push(`${contacts} contatos (limite ${newPlan.maxContacts})`);
      if (agents > maxAgents) issues.push(`${agents} agentes (limite ${maxAgents})`);
      if (channels > newPlan.maxChannels) {
        issues.push(`${channels} conexões WhatsApp ativas (limite ${newPlan.maxChannels})`);
      }
      if (issues.length) {
        throw new AppError(
          `Não é possível alterar para o plano ${newPlan.name}: a empresa possui ${issues.join("; ")}. Reduza o uso antes do downgrade.`,
          409,
          "PLAN_DOWNGRADE_BLOCKED"
        );
      }
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...(body.planId !== undefined ? { planId: body.planId } : {}),
      ...(body.primaryColor !== undefined ? { primaryColor: body.primaryColor } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      settings: nextSettings as Prisma.InputJsonValue,
    },
    include: { plan: true },
  });

  const resolvedBillingStatus = (st: string | undefined): string | undefined => {
    if (!st) return undefined;
    if (st === "BLOCKED") return undefined;
    if (st === "SUSPENDED") return "SUSPENDED";
    if (st === "CANCELLED" || st === "PENDING_DELETION") return "CANCELLED";
    if (st === "TRIAL") return "TRIAL";
    if (st === "ACTIVE") return "ACTIVE";
    return undefined;
  };

  if (body.planId && tenant.planId) {
    const { ensureTenantSubscription } = await import("../entitlements");
    await ensureTenantSubscription({
      tenantId: id,
      planId: tenant.planId,
      billingStatus: resolvedBillingStatus(tenant.status) || "ACTIVE",
      updateContractedPrice: body.priceMonthly === undefined,
    });
    if (auditAction === "admin.tenant.update") auditAction = "company.plan_changed";
  }

  const { computeNextDueDate } = await import("../billing");
  const subPatch: Prisma.SubscriptionUpdateInput = {};
  if (body.billingDueDay !== undefined) {
    subPatch.billingDueDay = body.billingDueDay;
    if (body.billingDueDay != null && body.nextDueAt === undefined) {
      subPatch.currentPeriodEnd = computeNextDueDate(body.billingDueDay);
    }
    if (auditAction === "admin.tenant.update") auditAction = "company.due_date_changed";
  }
  if (body.nextDueAt !== undefined) {
    subPatch.currentPeriodEnd = body.nextDueAt ? new Date(body.nextDueAt) : null;
    if (auditAction === "admin.tenant.update") auditAction = "company.due_date_changed";
  }
  if (body.priceMonthly !== undefined) subPatch.priceMonthly = body.priceMonthly;
  if (body.action === "cancel_subscription") {
    subPatch.billingStatus = "CANCELLED";
    subPatch.cancelAt = new Date();
  }

  const billingStatus = resolvedBillingStatus(tenant.status);
  const existing = await prisma.subscription.findUnique({ where: { tenantId: id } });
  if (existing && (Object.keys(subPatch).length || billingStatus)) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { ...subPatch, ...(billingStatus ? { billingStatus } : {}) },
    });
  } else if (tenant.planId && (body.billingDueDay !== undefined || body.priceMonthly !== undefined)) {
    const { ensureTenantSubscription } = await import("../entitlements");
    const created = await ensureTenantSubscription({
      tenantId: id,
      planId: tenant.planId,
      billingStatus: billingStatus || "ACTIVE",
      updateContractedPrice: true,
    });
    if (created && Object.keys(subPatch).length) {
      await prisma.subscription.update({ where: { id: created.id }, data: subPatch });
    }
  }

  if (body.priceMonthly !== undefined) {
    await prisma.subscription
      .updateMany({ where: { tenantId: id }, data: { priceMonthly: body.priceMonthly } })
      .catch(() => null);
  }

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: auditAction,
    entity: "tenant",
    entityId: id,
    metadata: {
      fields: Object.keys(body),
      action: body.action || null,
      previousStatus: current.status,
      nextStatus: tenant.status,
      previousPlanId: current.planId,
      nextPlanId: tenant.planId,
    },
    ip: actor.ip,
  });

  const sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
  return { ...tenant, ...enrichTenantBilling(tenant, sub as SubscriptionRow | null) };
}

export async function registerPayment(
  id: string,
  body: {
    amount: number;
    paidAt?: string;
    referencePeriod?: string | null;
    method?: "PIX" | "TRANSFER" | "BOLETO" | "CARD" | "CASH" | "OTHER" | null;
    notes?: string | null;
    advanceDueDate?: boolean;
  },
  actor: { sub: string; ip?: string }
) {
  const tenant = assertFound(
    await prisma.tenant.findUnique({ where: { id }, include: { plan: true } })
  );
  let sub = await prisma.subscription.findUnique({ where: { tenantId: id } });
  if (!sub && tenant.planId) {
    const { ensureTenantSubscription } = await import("../entitlements");
    sub = await ensureTenantSubscription({
      tenantId: id,
      planId: tenant.planId,
      billingStatus: "ACTIVE",
      updateContractedPrice: true,
    });
  }
  if (!sub) {
    throw new AppError(
      "Empresa sem assinatura. Atribua um plano antes de registrar pagamento.",
      400,
      "NO_SUBSCRIPTION"
    );
  }

  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  const payment = await prisma.payment.create({
    data: {
      tenantId: id,
      subscriptionId: sub.id,
      amount: body.amount,
      paidAt,
      referencePeriod: body.referencePeriod || null,
      method: body.method || null,
      notes: body.notes || null,
      createdBy: actor.sub,
    },
  });

  let nextDue = sub.currentPeriodEnd;
  if (body.advanceDueDate !== false) {
    nextDue = advancePeriodAfterPayment({
      billingDueDay: sub.billingDueDay,
      currentPeriodEnd: sub.currentPeriodEnd,
      paidAt,
    });
  }

  const updatedSub = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      billingStatus: "ACTIVE",
      currentPeriodEnd: nextDue,
      ...(sub.billingDueDay == null && nextDue ? { billingDueDay: nextDue.getUTCDate() } : {}),
    },
  });

  const { recomputeTenantFinancialAccess } = await import("../access-gate");
  const fin = await recomputeTenantFinancialAccess(id);

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: "company.payment_registered",
    entity: "payment",
    entityId: payment.id,
    metadata: {
      amount: body.amount,
      paidAt: paidAt.toISOString(),
      nextDueAt: updatedSub.currentPeriodEnd?.toISOString() || null,
      financialAccess: fin.financialAccess,
      billingStatus: fin.billingStatus,
    },
    ip: actor.ip,
  });

  return {
    payment: {
      id: payment.id,
      amount: Number(payment.amount),
      paidAt: payment.paidAt,
      referencePeriod: payment.referencePeriod,
      method: payment.method,
      notes: payment.notes,
      createdAt: payment.createdAt,
    },
    subscription: {
      id: updatedSub.id,
      billingStatus: updatedSub.billingStatus,
      billingDueDay: updatedSub.billingDueDay,
      currentPeriodEnd: updatedSub.currentPeriodEnd,
      priceMonthly: updatedSub.priceMonthly != null ? Number(updatedSub.priceMonthly) : null,
    },
    billing: enrichTenantBilling(tenant, updatedSub as SubscriptionRow),
  };
}

export async function listCompanyPayments(id: string) {
  assertFound(await prisma.tenant.findUnique({ where: { id } }));
  const payments = await prisma.payment.findMany({
    where: { tenantId: id },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  return {
    items: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referencePeriod: p.referencePeriod,
      method: p.method,
      notes: p.notes,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    })),
  };
}

export async function requestCompanyDeletion(
  id: string,
  body: { confirmName: string; reason?: string; mode?: "soft" | "archive" },
  actor: { sub: string; ip?: string }
) {
  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  if (body.confirmName.trim() !== tenant.name.trim()) {
    throw new AppError(
      "Digite o nome exato da empresa para confirmar a exclusão.",
      400,
      "CONFIRM_NAME_MISMATCH"
    );
  }

  const prev = tenantSettings(tenant.settings);
  const now = new Date().toISOString();
  const status = body.mode === "archive" ? "CANCELLED" : "PENDING_DELETION";

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      status,
      settings: {
        ...prev,
        deletionRequestedAt: now,
        deletionRequestedBy: actor.sub,
        deletionReason: body.reason || null,
        archivedAt: body.mode === "archive" ? now : prev.archivedAt || null,
        archivedBy: body.mode === "archive" ? actor.sub : prev.archivedBy || null,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.subscription
    .updateMany({
      where: { tenantId: id },
      data: { billingStatus: "CANCELLED", cancelAt: new Date() },
    })
    .catch(() => null);

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: body.mode === "archive" ? "admin.tenant.archive" : "company.deletion_requested",
    entity: "tenant",
    entityId: id,
    metadata: { reason: body.reason || null, mode: body.mode || "soft", hardDelete: false },
    ip: actor.ip,
  });
  await recordSecurityEvent({
    type: "TENANT_ARCHIVED",
    userId: actor.sub,
    tenantId: id,
    ip: actor.ip,
    metadata: { name: tenant.name, mode: body.mode || "soft" },
  });

  return {
    ok: true,
    tenant: updated,
    message:
      body.mode === "archive"
        ? "Empresa arquivada. Dados preservados."
        : "Exclusão solicitada. Acesso bloqueado e dados preservados.",
  };
}

export async function updateMembership(
  tenantId: string,
  membershipId: string,
  body: { role?: "ADMIN" | "SUPERVISOR" | "AGENT" | "SALES" | "READONLY"; isActive?: boolean },
  actor: { sub: string; ip?: string }
) {
  const membership = assertFound(
    await prisma.membership.findFirst({ where: { id: membershipId, tenantId } })
  );
  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  await audit({
    userId: actor.sub,
    tenantId,
    action: "admin.membership.update",
    entity: "membership",
    entityId: membershipId,
    metadata: body,
    ip: actor.ip,
  });
  return updated;
}

export async function removeMembership(
  tenantId: string,
  membershipId: string,
  actor: { sub: string; ip?: string }
) {
  const membership = assertFound(
    await prisma.membership.findFirst({ where: { id: membershipId, tenantId } })
  );
  await prisma.membership.delete({ where: { id: membership.id } });
  await audit({
    userId: actor.sub,
    tenantId,
    action: "admin.membership.remove",
    entity: "membership",
    entityId: membershipId,
    metadata: { userId: membership.userId },
    ip: actor.ip,
  });
  return { ok: true };
}
