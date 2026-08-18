import { randomBytes } from "crypto";
import type { Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { hashPassword, validatePasswordPolicy } from "../security/password";
import { recordSecurityEvent } from "../security/security-event";
import { computeNextDueDate } from "../billing";
import { enrichTenantBilling, type SubscriptionRow } from "./billing-view";
import { isTestFixtureTenant, normalizeNameKey, slugify, tenantSettings } from "./fixtures";

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
        companyProfile: true,
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
    trial: summaryBillingGlobal.filter((b) => b.financialStatus === "TRIAL").length,
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
          where: { role: "ADMIN", isActive: true },
          take: 5,
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
        plan: { select: { id: true, name: true, priceMonthly: true, priceOnRequest: true } },
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
  const { getUsageSnapshot } = await import("../entitlements");
  const usageSnapshot = await getUsageSnapshot(id);

  return {
    ...tenant,
    ...billing,
    profile: tenant.companyProfile || {
      legalName: tenant.name,
      tradeName: tenant.name,
      cnpj: null,
      email: null,
      phone: null,
      website: null,
      segment: null,
      city: null,
      state: null,
      timezone: "America/Sao_Paulo",
      language: "pt-BR",
    },
    recentPayments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referencePeriod: p.referencePeriod,
      method: p.method,
      notes: p.notes,
      createdAt: p.createdAt,
    })),
    recentAudit,
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
          },
          companyProfile: {
            create: {
              legalName: input.legalName?.trim() || trimmedName,
              tradeName: input.tradeName?.trim() || trimmedName,
              cnpj: input.cnpj?.trim() || null,
              email: email,
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

      // 5. Criação da Assinatura com Preço Contratado Snapshot
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
            planId: plan?.id || null,
            planSlug: plan?.slug || null,
            contractedPriceMonthly,
          },
          ip: actor.ip || null,
        },
      });

      return tenant;
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
    await provisionTenantKnowledge(created.id);
    await ensureOptionalTrainingDocs(created.id);
  } catch {
    /* pós-commit */
  }

  void import("../tenant-setup-checklist")
    .then(async ({ markAgentCreated, markPipelineCreated }) => {
      await markAgentCreated(created.id);
      await markPipelineCreated(created.id);
    })
    .catch(() => null);

  return created;
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
  assertFound(await prisma.tenant.findUnique({ where: { id: tenantId } }));

  const updatedProfile = await prisma.companyProfile.upsert({
    where: { tenantId },
    update: {
      ...(profile.legalName !== undefined ? { legalName: profile.legalName } : {}),
      ...(profile.tradeName !== undefined ? { tradeName: profile.tradeName } : {}),
      ...(profile.cnpj !== undefined ? { cnpj: profile.cnpj } : {}),
      ...(profile.email !== undefined ? { email: profile.email } : {}),
      ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
      ...(profile.website !== undefined ? { website: profile.website } : {}),
      ...(profile.segment !== undefined ? { segment: profile.segment } : {}),
      ...(profile.city !== undefined ? { city: profile.city } : {}),
      ...(profile.state !== undefined ? { state: profile.state } : {}),
      ...(profile.timezone !== undefined ? { timezone: profile.timezone || "America/Sao_Paulo" } : {}),
      ...(profile.language !== undefined ? { language: profile.language || "pt-BR" } : {}),
    },
    create: {
      tenantId,
      legalName: profile.legalName || null,
      tradeName: profile.tradeName || null,
      cnpj: profile.cnpj || null,
      email: profile.email || null,
      phone: profile.phone || null,
      website: profile.website || null,
      segment: profile.segment || null,
      city: profile.city || null,
      state: profile.state || null,
      timezone: profile.timezone || "America/Sao_Paulo",
      language: profile.language || "pt-BR",
    },
  });

  await audit({
    userId: actor.sub,
    tenantId,
    action: "company.profile_updated",
    entity: "company_profile",
    entityId: updatedProfile.id,
    metadata: { fields: Object.keys(profile) },
    ip: actor.ip,
  });

  return updatedProfile;
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

export async function requestCompanyDeletion(
  id: string,
  body: { confirmName: string; reason?: string },
  actor: { sub: string; ip?: string }
) {
  const tenant = assertFound(await prisma.tenant.findUnique({ where: { id } }));
  if (body.confirmName.trim() !== tenant.name.trim()) {
    throw new AppError(
      "Digite o nome exato da empresa para confirmar a solicitação de exclusão.",
      400,
      "CONFIRM_NAME_MISMATCH"
    );
  }

  const prev = tenantSettings(tenant.settings);
  const now = new Date().toISOString();

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      status: "PENDING_DELETION",
      settings: {
        ...prev,
        deletionRequestedAt: now,
        deletionRequestedBy: actor.sub,
        deletionReason: body.reason || null,
      } as Prisma.InputJsonValue,
    },
  });

  // Marca assinatura como cancelada sem apagar histórico financeiro
  await prisma.subscription
    .updateMany({
      where: { tenantId: id },
      data: { billingStatus: "CANCELLED", cancelAt: new Date() },
    })
    .catch(() => null);

  await audit({
    userId: actor.sub,
    tenantId: id,
    action: "company.deletion_requested",
    entity: "tenant",
    entityId: id,
    metadata: {
      reason: body.reason || null,
      hardDelete: false,
      note: "Exclusão solicitada (PENDING_DELETION). Dados e histórico preservados.",
    },
    ip: actor.ip,
  });

  await recordSecurityEvent({
    type: "TENANT_ARCHIVED",
    userId: actor.sub,
    tenantId: id,
    ip: actor.ip,
    metadata: { name: tenant.name, status: "PENDING_DELETION" },
  });

  return {
    ok: true,
    tenant: updated,
    message: "Exclusão solicitada com sucesso. O acesso foi bloqueado e os dados estão preservados.",
  };
}
