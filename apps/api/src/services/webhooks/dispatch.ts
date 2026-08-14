/**
 * Entrega assíncrona de webhooks outbound.
 * Não bloqueia o fluxo principal (setImmediate / fire-and-forget).
 */
import { createHmac, randomBytes, randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { asInputJson } from "../../lib/json";
import { assertSafeWebhookUrl } from "./ssrf";
import { WEBHOOK_EVENT_TYPES } from "./events";

const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000]; // 0, 30s, 2m, 10m

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(secret: string, body: string, timestamp: string): string {
  const base = `${timestamp}.${body}`;
  const sig = createHmac("sha256", secret).update(base).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

function sanitizeData(data: unknown): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map(sanitizeData);
  if (typeof data !== "object") return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (
      key.includes("password") ||
      key.includes("secret") ||
      key.includes("token") ||
      key.includes("apikey") ||
      key.includes("api_key") ||
      key === "authorization"
    ) {
      continue;
    }
    out[k] = sanitizeData(v);
  }
  return out;
}

export type EmitWebhookParams = {
  tenantId: string;
  type: string;
  data: unknown;
  /** ID estável; se omitido gera novo */
  eventId?: string;
};

/**
 * Emite evento para todos os webhooks ativos do tenant inscritos no type.
 * Nunca lança para o caller — erros só em log/delivery.
 * Async (setImmediate) — não bloqueia fluxo principal.
 */
export function emitWebhookEvent(params: EmitWebhookParams): void {
  setImmediate(() => {
    void deliverToTenant(params).catch((err) => {
      console.warn(
        "[webhooks] emit failed:",
        err instanceof Error ? err.message : err
      );
    });
  });
}

/** Versão awaitable para testes E2E e operações síncronas controladas. */
export async function emitWebhookEventAwait(
  params: EmitWebhookParams
): Promise<{ deliveryIds: string[] }> {
  return deliverToTenant(params);
}

async function deliverToTenant(
  params: EmitWebhookParams
): Promise<{ deliveryIds: string[] }> {
  const deliveryIds: string[] = [];
  if (!WEBHOOK_EVENT_TYPES.has(params.type) && params.type !== "webhook.test") {
    return { deliveryIds };
  }

  // Access Gate: não despachar se empresa bloqueada/suspensa/inadimplente
  try {
    const { assertTenantCanDispatchWebhooks } = await import("../access-gate");
    const ok = await assertTenantCanDispatchWebhooks(params.tenantId);
    if (!ok) {
      console.log(`[webhooks] skip tenant=${params.tenantId} (access gate paused)`);
      return { deliveryIds };
    }
  } catch {
    return { deliveryIds };
  }

  // Isolamento absoluto: só endpoints do tenantId autenticado/emitente
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: params.tenantId, isActive: true },
  });
  if (!endpoints.length) return { deliveryIds };

  const eventId = params.eventId || `evt_${randomUUID().replace(/-/g, "")}`;
  const createdAt = new Date().toISOString();
  const envelope = {
    id: eventId,
    type: params.type,
    createdAt,
    tenantId: params.tenantId,
    data: sanitizeData(params.data),
  };

  for (const ep of endpoints) {
    // Defesa em profundidade: nunca entregar se endpoint.tenantId divergir
    if (ep.tenantId !== params.tenantId) continue;

    const events = Array.isArray(ep.events)
      ? (ep.events as string[])
      : typeof ep.events === "object" && ep.events
        ? Object.values(ep.events as object).filter((x) => typeof x === "string")
        : [];
    if (params.type !== "webhook.test" && !events.includes(params.type)) {
      continue;
    }

    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: ep.id,
        tenantId: params.tenantId,
        eventId,
        event: params.type,
        payload: asInputJson(envelope),
        status: "pending",
        attempts: 0,
      },
    });
    deliveryIds.push(delivery.id);

    // Em teste: aguarda entrega; em prod: fire-and-forget com scheduler de retry
    if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
      await attemptDelivery(delivery.id).catch(() => null);
    } else {
      void attemptDelivery(delivery.id).catch(() => null);
    }
  }
  return { deliveryIds };
}

export async function attemptDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.success) return;
  if (delivery.attempts >= MAX_ATTEMPTS) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed" },
    });
    return;
  }

  const ep = delivery.endpoint;
  if (!ep.isActive) return;

  const body = JSON.stringify(delivery.payload ?? {});
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(ep.secret, body, timestamp);
  const attempt = delivery.attempts + 1;
  const started = Date.now();

  let statusCode: number | null = null;
  let success = false;
  let error: string | null = null;
  let responseBody: string | null = null;

  try {
    await assertSafeWebhookUrl(ep.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "NexaFlow-Webhooks/1.0",
          "X-NexaFlow-Signature": signature,
          "X-NexaFlow-Event": delivery.event,
          "X-NexaFlow-Delivery": delivery.id,
          "X-NexaFlow-Event-Id": delivery.eventId,
          "X-NexaFlow-Timestamp": timestamp,
        },
        body,
        signal: controller.signal,
        redirect: "error",
      });
      statusCode = res.status;
      success = res.status >= 200 && res.status < 300;
      const text = await res.text().catch(() => "");
      responseBody = text.slice(0, 500);
      if (!success) error = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : "Falha no envio";
  }

  const durationMs = Date.now() - started;
  const willRetry = !success && attempt < MAX_ATTEMPTS;
  const nextRetryAt = willRetry
    ? new Date(Date.now() + (RETRY_DELAYS_MS[attempt] ?? 600_000))
    : null;

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts: attempt,
      statusCode: statusCode ?? undefined,
      success,
      error: error || undefined,
      durationMs,
      responseBody: responseBody || undefined,
      status: success ? "success" : willRetry ? "retrying" : "failed",
      nextRetryAt: nextRetryAt || undefined,
    },
  });

  if (success) {
    await prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data: {
        lastSuccessAt: new Date(),
        lastDeliveryAt: new Date(),
        failureCount: 0,
        healthStatus: "active",
      },
    });
  } else {
    const failCount = ep.failureCount + 1;
    await prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data: {
        lastFailureAt: new Date(),
        lastDeliveryAt: new Date(),
        failureCount: failCount,
        healthStatus: failCount >= 5 ? "failing" : ep.healthStatus,
      },
    });
  }

  if (willRetry && nextRetryAt) {
    const delay = nextRetryAt.getTime() - Date.now();
    setTimeout(() => {
      void attemptDelivery(deliveryId).catch(() => null);
    }, Math.max(delay, 1000));
  }
}

export async function resendDelivery(params: {
  tenantId: string;
  deliveryId: string;
}) {
  const d = await prisma.webhookDelivery.findFirst({
    where: { id: params.deliveryId, tenantId: params.tenantId },
  });
  if (!d) return null;
  // nova tentativa manual: reseta status mas mantém eventId
  await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: {
      status: "pending",
      success: false,
      nextRetryAt: null,
      // não zera attempts — continua contagem
    },
  });
  await attemptDelivery(d.id);
  return prisma.webhookDelivery.findUnique({ where: { id: d.id } });
}

/** Scheduler leve de retries pendentes (boot) */
let retryTimer: ReturnType<typeof setInterval> | null = null;

export function startWebhookRetryScheduler() {
  if (retryTimer) return;
  const tick = () => {
    void prisma.webhookDelivery
      .findMany({
        where: {
          status: "retrying",
          nextRetryAt: { lte: new Date() },
          success: false,
          attempts: { lt: MAX_ATTEMPTS },
        },
        take: 20,
        select: { id: true },
      })
      .then((rows) => {
        for (const r of rows) void attemptDelivery(r.id).catch(() => null);
      })
      .catch(() => null);
  };
  setTimeout(tick, 60_000);
  retryTimer = setInterval(tick, 60_000);
  if (typeof retryTimer.unref === "function") retryTimer.unref();
}
