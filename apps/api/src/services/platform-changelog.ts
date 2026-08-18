/**
 * Changelog / Novidades da NexaFlow — Fonte oficial de releases e versões.
 */
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { isVersionFormat } from "./platform-log-redaction";

export type ReleaseCategory = "NEW" | "IMPROVEMENT" | "FIX" | "SECURITY";
export type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReleaseVisibility = "ALL" | "SUPERADMIN";

export type ReleaseItemInput = {
  category: ReleaseCategory | string;
  body: string;
  sortOrder?: number;
};

const CATEGORY_MAP: Record<string, ReleaseCategory> = {
  NEW: "NEW",
  NOVO: "NEW",
  FEATURE: "NEW",
  IMPROVEMENT: "IMPROVEMENT",
  MELHORIA: "IMPROVEMENT",
  FIX: "FIX",
  CORRECAO: "FIX",
  CORREÇÃO: "FIX",
  SECURITY: "SECURITY",
  SEGURANCA: "SECURITY",
  SEGURANÇA: "SECURITY",
};

/**
 * Sanitiza textos contra injeções de script / tags HTML perigosas
 */
export function sanitizeChangelogText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .trim();
}

function normalizeItems(items: ReleaseItemInput[]) {
  return (items || [])
    .map((it, i) => {
      const rawCat = String(it.category || "").toUpperCase().trim();
      const category = CATEGORY_MAP[rawCat] || "IMPROVEMENT";
      const body = sanitizeChangelogText(String(it.body || ""));
      return {
        category,
        body,
        sortOrder: it.sortOrder ?? i,
      };
    })
    .filter((it) => it.body.length > 0) as Array<{
    category: ReleaseCategory;
    body: string;
    sortOrder: number;
  }>;
}

/** Textos internos técnicos que nunca devem ir para o changelog do cliente. */
const INTERNAL_CHANGELOG_RE =
  /\b(superadmin|admin\s+global|painel\s+administrativ|diagn[oó]stico\s+(interno|t[eé]cnico)|sa[uú]de\s+da\s+plataforma|docker|easypanel|redis|postgres|migration|worker|job\b|allowlist|rbac|access\s*gate|multi-?tenant\b|endpoint|health\s*check|runtime|fallback\s+provider|structured\s+output)\b/i;

export function isCustomerFacingChangelogBody(body: string): boolean {
  return Boolean(body?.trim()) && !INTERNAL_CHANGELOG_RE.test(body);
}

export async function listPublishedReleases(params: {
  userId: string;
  isSuperadmin?: boolean;
  take?: number;
}) {
  const take = Math.min(params.take ?? 30, 50);
  
  // Regra de segurança rígida: usuários não-superadmin NUNCA recebem releases SUPERADMIN
  const whereClause = params.isSuperadmin
    ? { status: "PUBLISHED" as const }
    : { status: "PUBLISHED" as const, visibility: "ALL" as const };

  const releases = await prisma.platformRelease.findMany({
    where: whereClause,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  const seen = await prisma.userReleaseSeen.findMany({
    where: {
      userId: params.userId,
      releaseId: { in: releases.map((r) => r.id) },
    },
    select: { releaseId: true },
  });
  const seenSet = new Set(seen.map((s) => s.releaseId));

  return releases.map((r) => ({
    id: r.id,
    version: r.version,
    title: r.title,
    summary: r.summary,
    publishedAt: r.publishedAt,
    status: r.status,
    visibility: r.visibility,
    seen: seenSet.has(r.id),
    items: r.items
      .filter((i) => params.isSuperadmin || isCustomerFacingChangelogBody(i.body))
      .map((i) => ({
        id: i.id,
        category: i.category,
        body: i.body,
        sortOrder: i.sortOrder,
      })),
  }));
}

export async function countUnseenReleases(userId: string, isSuperadmin = false) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  const since = user?.createdAt ?? new Date(0);

  const whereClause = isSuperadmin
    ? {
        status: "PUBLISHED" as const,
        OR: [
          { publishedAt: { gte: since } },
          { publishedAt: null, createdAt: { gte: since } },
        ],
      }
    : {
        status: "PUBLISHED" as const,
        visibility: "ALL" as const,
        OR: [
          { publishedAt: { gte: since } },
          { publishedAt: null, createdAt: { gte: since } },
        ],
      };

  const published = await prisma.platformRelease.findMany({
    where: whereClause,
    select: { id: true },
  });
  if (!published.length) return 0;
  const seen = await prisma.userReleaseSeen.count({
    where: {
      userId,
      releaseId: { in: published.map((p) => p.id) },
    },
  });
  return Math.max(0, published.length - seen);
}

export async function markReleasesSeen(params: {
  userId: string;
  releaseIds?: string[];
  allPublished?: boolean;
}) {
  let ids = params.releaseIds || [];
  if (params.allPublished || !ids.length) {
    const published = await prisma.platformRelease.findMany({
      where: { status: "PUBLISHED", visibility: "ALL" },
      select: { id: true },
    });
    ids = published.map((p) => p.id);
  }
  if (!ids.length) return { ok: true, marked: 0 };

  let marked = 0;
  for (const releaseId of ids) {
    try {
      await prisma.userReleaseSeen.upsert({
        where: {
          userId_releaseId: { userId: params.userId, releaseId },
        },
        create: { userId: params.userId, releaseId },
        update: { seenAt: new Date() },
      });
      marked += 1;
    } catch {
      /* release inexistente — ignora */
    }
  }
  return { ok: true, marked };
}

export async function adminListReleases() {
  return prisma.platformRelease.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      _count: { select: { seenBy: true } },
    },
  });
}

export async function adminGetRelease(id: string) {
  const r = await prisma.platformRelease.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!r) throw new AppError("Versão não encontrada.", 404, "RELEASE_NOT_FOUND");
  return r;
}

export async function adminCreateRelease(params: {
  version: string;
  title: string;
  summary?: string | null;
  visibility?: ReleaseVisibility;
  items?: ReleaseItemInput[];
  createdById?: string;
}) {
  const version = params.version.trim();
  if (!isVersionFormat(version)) {
    throw new AppError("Informe uma versão válida, como 1.8.0.", 400, "INVALID_VERSION");
  }
  const title = sanitizeChangelogText(params.title);
  if (!title) throw new AppError("O título da versão é obrigatório.", 400, "INVALID_TITLE");

  const dup = await prisma.platformRelease.findUnique({ where: { version } });
  if (dup) throw new AppError("Esta versão já está cadastrada.", 409, "VERSION_EXISTS");

  const items = normalizeItems(params.items || []);
  if (!items.length) {
    throw new AppError("A versão precisa conter pelo menos um item no changelog.", 400, "EMPTY_ITEMS");
  }

  const summary = params.summary ? sanitizeChangelogText(params.summary) : null;

  return prisma.platformRelease.create({
    data: {
      version,
      title,
      summary: summary || null,
      visibility: params.visibility === "SUPERADMIN" ? "SUPERADMIN" : "ALL",
      status: "DRAFT",
      createdById: params.createdById || null,
      items: {
        create: items.map((it, i) => ({
          category: it.category,
          body: it.body,
          sortOrder: it.sortOrder ?? i,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function adminUpdateRelease(params: {
  id: string;
  version?: string;
  title?: string;
  summary?: string | null;
  visibility?: ReleaseVisibility;
  items?: ReleaseItemInput[];
}) {
  const existing = await adminGetRelease(params.id);
  if (params.version && params.version !== existing.version) {
    const v = params.version.trim();
    if (!isVersionFormat(v)) {
      throw new AppError("Informe uma versão válida, como 1.8.0.", 400, "INVALID_VERSION");
    }
    const dup = await prisma.platformRelease.findUnique({ where: { version: v } });
    if (dup) throw new AppError("Esta versão já está cadastrada.", 409, "VERSION_EXISTS");
  }

  const data: {
    version?: string;
    title?: string;
    summary?: string | null;
    visibility?: string;
  } = {};
  if (params.version) data.version = params.version.trim();
  if (params.title !== undefined) {
    const cleanTitle = sanitizeChangelogText(params.title);
    if (!cleanTitle) throw new AppError("O título da versão é obrigatório.", 400, "INVALID_TITLE");
    data.title = cleanTitle;
  }
  if (params.summary !== undefined) {
    data.summary = params.summary ? sanitizeChangelogText(params.summary) : null;
  }
  if (params.visibility) {
    data.visibility = params.visibility === "SUPERADMIN" ? "SUPERADMIN" : "ALL";
  }

  if (params.items) {
    const items = normalizeItems(params.items);
    if (!items.length) {
      throw new AppError("A versão precisa conter pelo menos um item no changelog.", 400, "EMPTY_ITEMS");
    }
    await prisma.$transaction([
      prisma.platformReleaseItem.deleteMany({ where: { releaseId: params.id } }),
      prisma.platformRelease.update({
        where: { id: params.id },
        data: {
          ...data,
          items: {
            create: items.map((it, i) => ({
              category: it.category,
              body: it.body,
              sortOrder: it.sortOrder ?? i,
            })),
          },
        },
      }),
    ]);
  } else {
    await prisma.platformRelease.update({
      where: { id: params.id },
      data,
    });
  }

  return adminGetRelease(params.id);
}

export async function adminPublishRelease(id: string) {
  const r = await adminGetRelease(id);
  if (r.status === "ARCHIVED") {
    throw new AppError("Uma versão arquivada não pode ser publicada diretamente.", 400, "ARCHIVED_LOCKED");
  }

  const wasAlreadyPublished = r.status === "PUBLISHED";
  const published = await prisma.platformRelease.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: r.publishedAt || new Date(),
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  // Notificação idempotente na primeira publicação
  if (!wasAlreadyPublished && published.visibility === "ALL") {
    try {
      const { notifyPlatformReleasePublished } = await import("./platform-release-notify");
      await notifyPlatformReleasePublished({
        releaseId: published.id,
        version: published.version,
        title: published.title,
        summary: published.summary,
        visibility: published.visibility,
        status: published.status,
      });
    } catch (err) {
      console.error("[platform-changelog] notify on publish failed", err);
    }
  }

  return published;
}

export async function adminUnpublishRelease(id: string) {
  await adminGetRelease(id);
  return prisma.platformRelease.update({
    where: { id },
    data: { status: "DRAFT" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function adminArchiveRelease(id: string) {
  await adminGetRelease(id);
  return prisma.platformRelease.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function adminDeleteRelease(id: string) {
  const r = await adminGetRelease(id);
  if (r.status === "PUBLISHED") {
    throw new AppError(
      "Não é possível excluir uma versão publicada. Despublique-a ou arquive-a antes de excluir.",
      400,
      "PUBLISHED_LOCKED"
    );
  }

  await prisma.$transaction([
    prisma.userReleaseSeen.deleteMany({ where: { releaseId: id } }),
    prisma.platformReleaseItem.deleteMany({ where: { releaseId: id } }),
    prisma.platformRelease.delete({ where: { id } }),
  ]);

  return { ok: true, id };
}

export async function adminDuplicateRelease(id: string, customVersion?: string, createdById?: string) {
  const r = await adminGetRelease(id);
  
  let version = customVersion?.trim();
  if (!version) {
    let candidate = `${r.version}-copy`;
    let n = 1;
    while (await prisma.platformRelease.findUnique({ where: { version: candidate } })) {
      n += 1;
      candidate = `${r.version}-copy${n}`;
    }
    const parts = r.version.split(".");
    if (parts.length >= 3 && /^\d+$/.test(parts[2]!)) {
      const nextPatch = `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
      if (!(await prisma.platformRelease.findUnique({ where: { version: nextPatch } }))) {
        candidate = nextPatch;
      }
    }
    version = candidate;
  }

  return adminCreateRelease({
    version,
    title: `${r.title} (cópia)`,
    summary: r.summary,
    visibility: r.visibility === "SUPERADMIN" ? "SUPERADMIN" : "ALL",
    items: r.items.map((i) => ({
      category: i.category as ReleaseCategory,
      body: i.body,
      sortOrder: i.sortOrder,
    })),
    createdById,
  });
}

/** Texto para NIA — só PUBLISHED + visibility ALL, sem detalhes internos. */
export async function getPublishedChangelogForNia(take = 5): Promise<string> {
  const releases = await prisma.platformRelease.findMany({
    where: { status: "PUBLISHED", visibility: "ALL" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: { items: { orderBy: { sortOrder: "asc" }, take: 20 } },
  });
  if (!releases.length) {
    return "(Nenhuma novidade publicada no changelog oficial.)";
  }
  return releases
    .map((r) => {
      const date = r.publishedAt
        ? r.publishedAt.toISOString().slice(0, 10)
        : "—";
      const lines = r.items
        .filter((i) => isCustomerFacingChangelogBody(i.body))
        .map((i) => `- [${i.category}] ${i.body}`)
        .join("\n");
      return `## v${r.version} — ${r.title} (${date})\n${r.summary || ""}\n${lines}`;
    })
    .join("\n\n");
}
