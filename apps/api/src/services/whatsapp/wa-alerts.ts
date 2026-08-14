/**
 * Alertas operacionais de WhatsApp — deduplicados, sem spam.
 * Tipos: CHANNEL_DISCONNECTED / SYSTEM
 */
import { prisma } from "../../lib/prisma";
import { createNotification } from "../notifications";
import { asConfig } from "./types";

export type WaAlertKind = "LOGGED_OUT" | "CIRCUIT_OPEN" | "RECONNECT_FAILED";

const META = new Map<string, { tenantId: string; channelId: string; channelName?: string }>();

/** Liga instanceName → tenant/canal (chamado no connect/restore). */
export function bindWhatsAppSessionMeta(
  instanceName: string,
  meta: { tenantId: string; channelId: string; channelName?: string }
) {
  if (!instanceName) return;
  META.set(instanceName, meta);
}

export function getWhatsAppSessionMeta(instanceName: string) {
  return META.get(instanceName) || null;
}

export async function resolveSessionMeta(instanceName: string) {
  const cached = META.get(instanceName);
  if (cached) return cached;

  const channels = await prisma.channel.findMany({
    where: { type: "WHATSAPP" },
    select: { id: true, tenantId: true, name: true, config: true },
    take: 200,
  });
  for (const ch of channels) {
    const cfg = asConfig(ch.config);
    if (cfg.instanceName === instanceName || cfg.session === instanceName) {
      const meta = { tenantId: ch.tenantId, channelId: ch.id, channelName: ch.name };
      META.set(instanceName, meta);
      return meta;
    }
  }
  return null;
}

async function notifyTenantChannelManagers(
  tenantId: string,
  params: {
    type: string;
    title: string;
    body: string;
    entityId: string;
    actionUrl: string;
  }
) {
  const members = await prisma.membership.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR"] },
    },
    select: { userId: true },
  });

  await Promise.all(
    members.map((m) =>
      createNotification({
        userId: m.userId,
        tenantId,
        type: params.type,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        entityType: "channel",
        entityId: params.entityId,
        dedupe: true,
      }).catch(() => null)
    )
  );
}

/**
 * Emite alerta deduplicado. Seguro chamar várias vezes.
 */
export async function emitWhatsAppAlert(
  instanceName: string,
  kind: WaAlertKind
): Promise<void> {
  try {
    const meta = await resolveSessionMeta(instanceName);
    if (!meta) {
      console.warn(`[wa-alerts] sem meta para ${instanceName} (${kind})`);
      return;
    }

    const name = meta.channelName || "WhatsApp";
    const href = "/app/integrations";

    if (kind === "LOGGED_OUT") {
      await notifyTenantChannelManagers(meta.tenantId, {
        type: "CHANNEL_DISCONNECTED",
        title: "WhatsApp desconectado no aparelho",
        body: `${name}: a sessão foi encerrada. Conecte novamente com QR.`,
        entityId: meta.channelId,
        actionUrl: href,
      });
      return;
    }

    if (kind === "CIRCUIT_OPEN") {
      await notifyTenantChannelManagers(meta.tenantId, {
        type: "CHANNEL_DISCONNECTED",
        title: "WhatsApp com falhas repetidas",
        body: `${name}: reconexão pausada temporariamente (circuit breaker). Verifique a conexão.`,
        entityId: meta.channelId,
        actionUrl: href,
      });
      return;
    }

    await notifyTenantChannelManagers(meta.tenantId, {
      type: "SYSTEM",
      title: "Falha ao reconectar WhatsApp",
      body: `${name}: não foi possível restaurar a conexão automaticamente.`,
      entityId: meta.channelId,
      actionUrl: href,
    });
  } catch (err) {
    console.error(
      "[wa-alerts] emit failed:",
      err instanceof Error ? err.message : err
    );
  }
}
