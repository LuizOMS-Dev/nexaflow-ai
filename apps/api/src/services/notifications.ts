import { prisma } from "../lib/prisma";

export const NOTIFICATION_TYPES = [
  "CONVERSATION_ASSIGNED",
  "TASK_OVERDUE",
  "CHANNEL_DISCONNECTED",
  "AUTOMATION_FAILED",
  "WEBHOOK_FAILED",
  "SECURITY_EVENT",
  "INVITE",
  "SYSTEM",
  /** Release pública da NexaFlow (Novidades) — por usuário, sem tenant */
  "PLATFORM_RELEASE",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotifyParams = {
  userId: string;
  tenantId?: string | null;
  type: NotificationType | string;
  title: string;
  body?: string;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  /** Se true, não cria se já existir não lida com mesmo dedupeKey */
  dedupe?: boolean;
};

function buildDedupeKey(p: NotifyParams) {
  return [
    p.type,
    p.tenantId || "",
    p.entityType || "",
    p.entityId || "",
    p.actionUrl || p.title,
  ].join(":");
}

/**
 * Cria notificação respeitando preferências e deduplicação.
 * Não inventa tipos novos se equivalente existir.
 */
export async function createNotification(params: NotifyParams) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { preferences: true },
  });
  const prefs =
    user?.preferences && typeof user.preferences === "object"
      ? (user.preferences as Record<string, unknown>)
      : {};

  // Preferências: segurança / atribuição
  if (params.type === "SECURITY_EVENT" && prefs.notifySecurity === false) return null;
  if (
    (params.type === "CONVERSATION_ASSIGNED" || params.type === "TASK_OVERDUE") &&
    prefs.notifyAssigned === false
  ) {
    return null;
  }

  const dedupeKey = buildDedupeKey(params);
  if (params.dedupe !== false) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: params.userId,
        dedupeKey,
        readAt: null,
      },
    });
    if (existing) return existing;
  }

  const url = params.actionUrl || null;
  return prisma.notification.create({
    data: {
      userId: params.userId,
      tenantId: params.tenantId || null,
      type: params.type,
      title: params.title,
      body: params.body || null,
      href: url,
      actionUrl: url,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      dedupeKey,
      // Prisma Json: cast para evitar incompatibilidade Record vs InputJsonValue
      metadata: params.metadata
        ? (JSON.parse(JSON.stringify(params.metadata)) as object)
        : undefined,
    },
  });
}
