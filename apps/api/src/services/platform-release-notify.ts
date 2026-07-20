/**
 * Notificações automáticas ao publicar release pública em Novidades.
 *
 * Fluxo:
 *   platform.release.published (conceitual)
 *   → só visibility ALL + status PUBLISHED (primeira vez)
 *   → 1 notificação por usuário elegível (não por tenant)
 *   → idempotente por releaseId
 *   → realtime para usuários online
 */
import { prisma } from "../lib/prisma";
import { createNotification } from "./notifications";
import { broadcastToAllUsers, broadcastToUser } from "../ws/hub";

export const PLATFORM_RELEASE_NOTIF_TYPE = "PLATFORM_RELEASE";
export const PLATFORM_RELEASE_ENTITY = "PlatformRelease";

const COPY_VARIANTS = [
  {
    title: "Nova atualização da NexaFlow",
    bodyFallback: "Confira as últimas novidades e melhorias da plataforma.",
  },
  {
    title: "Tem novidade na NexaFlow",
    bodyFallback: "Novos recursos e melhorias já estão disponíveis.",
  },
  {
    title: "A NexaFlow ficou ainda melhor",
    bodyFallback: "Confira o que mudou nesta atualização.",
  },
] as const;

function pickCopy(releaseId: string) {
  let h = 0;
  for (let i = 0; i < releaseId.length; i++) h = (h + releaseId.charCodeAt(i) * (i + 1)) % 997;
  return COPY_VARIANTS[h % COPY_VARIANTS.length]!;
}

export function buildPlatformReleaseNotificationCopy(params: {
  releaseId: string;
  title: string;
  summary?: string | null;
  version?: string;
}): { title: string; body: string; actionUrl: string } {
  const variant = pickCopy(params.releaseId);
  const releaseTitle = (params.title || "").trim().slice(0, 120);
  const summary = (params.summary || "").trim().slice(0, 160);
  const body =
    releaseTitle ||
    summary ||
    variant.bodyFallback;
  // Preferir título da release no body quando existir
  const finalBody = releaseTitle
    ? releaseTitle + (params.version ? "" : "")
    : body;
  return {
    title: variant.title,
    body: finalBody.slice(0, 200),
    actionUrl: `/app/whats-new?release=${encodeURIComponent(params.releaseId)}`,
  };
}

/**
 * Idempotência: se já existir qualquer notificação PLATFORM_RELEASE
 * para este releaseId, não cria de novo (retry, republicação, refresh).
 */
export async function wasPlatformReleaseAlreadyNotified(releaseId: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      type: PLATFORM_RELEASE_NOTIF_TYPE,
      entityType: PLATFORM_RELEASE_ENTITY,
      entityId: releaseId,
    },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Usuários elegíveis: ativos, com membership ativa em alguma empresa.
 * Uma vez por userId (multi-empresa = uma notificação).
 */
export async function listEligibleUsersForPlatformRelease(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      status: "ACTIVE",
      memberships: { some: { isActive: true } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type NotifyPlatformReleaseResult = {
  notified: number;
  skipped: boolean;
  reason?: string;
  releaseId: string;
};

/**
 * Cria notificações in-app para todos os usuários elegíveis.
 * Não notifica releases SUPERADMIN / internas.
 * Não recria se a release já gerou notificação.
 */
export async function notifyPlatformReleasePublished(params: {
  releaseId: string;
  version: string;
  title: string;
  summary?: string | null;
  visibility: string;
  status: string;
}): Promise<NotifyPlatformReleaseResult> {
  const { releaseId, visibility, status } = params;

  if (status !== "PUBLISHED") {
    return { notified: 0, skipped: true, reason: "not_published", releaseId };
  }
  if (visibility !== "ALL") {
    return { notified: 0, skipped: true, reason: "not_public", releaseId };
  }

  if (await wasPlatformReleaseAlreadyNotified(releaseId)) {
    return { notified: 0, skipped: true, reason: "already_notified", releaseId };
  }

  const copy = buildPlatformReleaseNotificationCopy({
    releaseId,
    title: params.title,
    summary: params.summary,
    version: params.version,
  });

  const userIds = await listEligibleUsersForPlatformRelease();
  if (!userIds.length) {
    return { notified: 0, skipped: false, reason: "no_users", releaseId };
  }

  // createMany em lote — dedupeKey estável por release (sem tenant)
  const dedupeKey = [
    PLATFORM_RELEASE_NOTIF_TYPE,
    "",
    PLATFORM_RELEASE_ENTITY,
    releaseId,
    copy.actionUrl,
  ].join(":");

  const now = new Date();
  const data = userIds.map((userId) => ({
    userId,
    tenantId: null as string | null,
    type: PLATFORM_RELEASE_NOTIF_TYPE,
    title: copy.title,
    body: copy.body,
    href: copy.actionUrl,
    actionUrl: copy.actionUrl,
    entityType: PLATFORM_RELEASE_ENTITY,
    entityId: releaseId,
    dedupeKey,
    metadata: {
      version: params.version,
      releaseTitle: params.title,
      kind: "platform_release",
    } as object,
    createdAt: now,
  }));

  // Batches para não estourar packet size
  const BATCH = 200;
  let notified = 0;
  for (let i = 0; i < data.length; i += BATCH) {
    const chunk = data.slice(i, i + BATCH);
    const res = await prisma.notification.createMany({ data: chunk });
    notified += res.count;
  }

  // Realtime: um evento global + por usuário online (badge/toast)
  const payload = {
    type: PLATFORM_RELEASE_NOTIF_TYPE,
    title: copy.title,
    body: copy.body,
    actionUrl: copy.actionUrl,
    entityType: PLATFORM_RELEASE_ENTITY,
    entityId: releaseId,
    version: params.version,
    releaseTitle: params.title,
    toast: true,
  };
  broadcastToAllUsers("notification.created", payload);
  // Também por user (se o socket estiver num tenant específico, allUsers já cobre)
  for (const uid of userIds.slice(0, 500)) {
    broadcastToUser(uid, "platform.release.published", payload);
  }

  return { notified, skipped: false, releaseId };
}

/**
 * Ao ler notificação de release: marca UserReleaseSeen.
 */
export async function markReleaseSeenFromNotification(params: {
  userId: string;
  notificationId: string;
}): Promise<void> {
  const n = await prisma.notification.findFirst({
    where: {
      id: params.notificationId,
      userId: params.userId,
      type: PLATFORM_RELEASE_NOTIF_TYPE,
    },
    select: { entityId: true },
  });
  if (!n?.entityId) return;
  try {
    await prisma.userReleaseSeen.upsert({
      where: {
        userId_releaseId: { userId: params.userId, releaseId: n.entityId },
      },
      create: { userId: params.userId, releaseId: n.entityId },
      update: { seenAt: new Date() },
    });
  } catch {
    /* release arquivada/removida — ignora */
  }
}

/**
 * Marca como vistas todas as releases referenciadas por notificações PLATFORM_RELEASE
 * não lidas do usuário (ao "marcar todas como lidas").
 */
export async function markReleasesSeenFromAllNotifications(userId: string): Promise<void> {
  const items = await prisma.notification.findMany({
    where: {
      userId,
      type: PLATFORM_RELEASE_NOTIF_TYPE,
      entityId: { not: null },
    },
    select: { entityId: true },
  });
  const ids = [...new Set(items.map((i) => i.entityId!).filter(Boolean))];
  for (const releaseId of ids) {
    try {
      await prisma.userReleaseSeen.upsert({
        where: { userId_releaseId: { userId, releaseId } },
        create: { userId, releaseId },
        update: { seenAt: new Date() },
      });
    } catch {
      /* ignore */
    }
  }
}

/** Uso em testes: cria notificação unitária via createNotification (com dedupe). */
export async function notifySingleUserPlatformRelease(params: {
  userId: string;
  releaseId: string;
  version: string;
  title: string;
  summary?: string | null;
}) {
  const copy = buildPlatformReleaseNotificationCopy(params);
  return createNotification({
    userId: params.userId,
    tenantId: null,
    type: PLATFORM_RELEASE_NOTIF_TYPE,
    title: copy.title,
    body: copy.body,
    actionUrl: copy.actionUrl,
    entityType: PLATFORM_RELEASE_ENTITY,
    entityId: params.releaseId,
    metadata: { version: params.version, releaseTitle: params.title },
    dedupe: true,
  });
}
