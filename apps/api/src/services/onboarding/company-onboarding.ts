import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { sanitizeLogoInput } from "../security/logo-upload";

export type CompanySettings = {
  onboardingCompleted?: boolean;
  adminProvisioned?: boolean;
  [key: string]: unknown;
};

export function tenantNeedsOnboarding(settings: unknown): boolean {
  const s = (settings || {}) as CompanySettings;
  if (s.onboardingCompleted === true) return false;
  if (s.adminProvisioned === true) return false;
  return true;
}

export const completeCompanySchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome da empresa.").max(120),
    segment: z.string().max(80).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    website: z.string().max(200).optional().nullable(),
    commercialEmail: z.string().max(160).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    state: z.string().max(40).optional().nullable(),
    primaryColor: z.string().optional(),
    logoUrl: z.string().max(2_500_000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    const email = (val.commercialEmail || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commercialEmail"],
        message: "E-mail comercial inválido.",
      });
    }
    if (val.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(val.primaryColor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryColor"],
        message: "Cor inválida. Use hexadecimal (#4F46E5).",
      });
    }
    const site = (val.website || "").trim();
    if (site && /^(javascript|data|file|vbscript):/i.test(site)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website"],
        message: "Endereço de site inválido.",
      });
    }
  });

export type CompleteCompanyInput = z.infer<typeof completeCompanySchema>;

export function normalizeWebsite(raw?: string | null): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/^(javascript|data|file|vbscript):/i.test(v)) {
    throw new AppError("Endereço de site inválido.", 400, "WEBSITE_INVALID");
  }
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new AppError("Informe um site válido.", 400, "WEBSITE_INVALID");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("Endereço de site inválido.", 400, "WEBSITE_INVALID");
  }
  return parsed.toString().slice(0, 200);
}

export function slugFromName(name: string, fallback: string) {
  const slugBase = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slugBase || fallback;
}

export function toPublicCompany(
  tenant: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
    logoUrl: string | null;
    settings: unknown;
    plan?: unknown;
  },
  opts?: { preview?: boolean }
) {
  const settings = (tenant.settings || {}) as CompanySettings;
  const onboardingCompleted = Boolean(settings.onboardingCompleted || settings.adminProvisioned);
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    primaryColor: tenant.primaryColor,
    logoUrl: tenant.logoUrl,
    settings: opts?.preview
      ? { onboardingCompleted, adminProvisioned: Boolean(settings.adminProvisioned) }
      : settings,
    plan: tenant.plan ?? null,
    onboardingCompleted,
  };
}

export async function getCompanyOnboarding(tenantId: string, canComplete: boolean) {
  const tenant = assertFound(
    await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    })
  );
  const needed = tenantNeedsOnboarding(tenant.settings);
  return {
    needed,
    canComplete,
    company: toPublicCompany(tenant, { preview: true }),
  };
}

export async function completeCompanyOnboarding(params: {
  tenantId: string;
  userId: string;
  input: CompleteCompanyInput;
  ip?: string;
}) {
  const current = assertFound(await prisma.tenant.findUnique({ where: { id: params.tenantId } }));
  const prev = (current.settings || {}) as CompanySettings;
  if (!tenantNeedsOnboarding(prev)) {
    throw new AppError("Cadastro da empresa já concluído.", 409, "ONBOARDING_DONE");
  }

  const name = params.input.name.trim();
  const slugBase = slugFromName(name, current.slug);
  let slug = slugBase;
  if (slug !== current.slug) {
    const taken = await prisma.tenant.findFirst({
      where: { slug, id: { not: current.id } },
      select: { id: true },
    });
    if (taken) slug = `${slugBase}-${current.id.slice(-4)}`;
  }

  const safeLogo =
    params.input.logoUrl !== undefined ? await sanitizeLogoInput(params.input.logoUrl) : undefined;
  const website = normalizeWebsite(params.input.website);
  const state = (params.input.state || "").trim().toUpperCase().slice(0, 2) || null;

  const tenant = await prisma.tenant.update({
    where: { id: current.id },
    data: {
      name,
      slug,
      primaryColor: params.input.primaryColor || current.primaryColor,
      ...(safeLogo !== undefined ? { logoUrl: safeLogo || null } : {}),
      settings: {
        ...prev,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
        segment: (params.input.segment || "").trim() || null,
        phone: (params.input.phone || "").trim() || null,
        website,
        commercialEmail: (params.input.commercialEmail || "").trim() || null,
        city: (params.input.city || "").trim() || null,
        state,
        timezone: (prev.timezone as string) || "America/Sao_Paulo",
        language: (prev.language as string) || "pt-BR",
      },
    },
    include: { plan: true },
  });

  try {
    const { ensureDefaultAiAgent } = await import("../ensure-default-agent");
    await ensureDefaultAiAgent(tenant.id);
  } catch (err) {
    console.error("[onboarding] ensure agent failed:", err instanceof Error ? err.message : err);
  }
  try {
    const { provisionTenantKnowledge } = await import("../knowledge-starter");
    await provisionTenantKnowledge(tenant.id);
  } catch (err) {
    console.error("[onboarding] starter knowledge failed:", err instanceof Error ? err.message : err);
  }

  await audit({
    tenantId: tenant.id,
    userId: params.userId,
    action: "tenant.onboarding.completed",
    ip: params.ip,
    metadata: { name: tenant.name },
  });

  return toPublicCompany(tenant);
}
