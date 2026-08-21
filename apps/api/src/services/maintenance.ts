import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { AppError } from "../lib/errors";
import type { JwtUser } from "../plugins/auth";

export type MaintenanceState = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
  internalReason?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
};

export type PublicMaintenanceStatus = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
};

const DEFAULT_TITLE = "Estamos em manutenção";
const DEFAULT_MESSAGE =
  "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve.";

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  title: DEFAULT_TITLE,
  message: DEFAULT_MESSAGE,
  estimatedEnd: null,
  internalReason: null,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

let cachedState: MaintenanceState | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 10_000; // 10 segundos

/** Helper para testes unitários */
export function _resetMaintenanceCache() {
  cachedState = null;
  cacheExpiresAt = 0;
}

/**
 * Lê o estado soberano de manutenção da plataforma
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const now = Date.now();
  if (cachedState && now < cacheExpiresAt) {
    return cachedState;
  }

  try {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: "global_maintenance" },
    });

    if (!setting || !setting.value || typeof setting.value !== "object") {
      cachedState = DEFAULT_STATE;
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedState;
    }

    const val = setting.value as Record<string, unknown>;
    cachedState = {
      enabled: Boolean(val.enabled),
      title: typeof val.title === "string" && val.title ? val.title : DEFAULT_TITLE,
      message: typeof val.message === "string" && val.message ? val.message : DEFAULT_MESSAGE,
      estimatedEnd: typeof val.estimatedEnd === "string" ? val.estimatedEnd : null,
      internalReason: typeof val.internalReason === "string" ? val.internalReason : null,
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: typeof val.updatedBy === "string" ? val.updatedBy : null,
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cachedState;
  } catch (err) {
    console.warn("[maintenance] Falha ao ler PlatformSetting:", err);
    return cachedState || DEFAULT_STATE;
  }
}

/**
 * Retorna apenas dados públicos seguros (sem internalReason ou dados de infraestrutura)
 */
export async function getPublicMaintenanceStatus(): Promise<PublicMaintenanceStatus> {
  const state = await getMaintenanceState();
  return {
    enabled: state.enabled,
    title: state.title,
    message: state.message,
    estimatedEnd: state.estimatedEnd,
  };
}

/**
 * Verifica rapidamente se o modo de manutenção está ativado
 */
export async function isMaintenanceActive(): Promise<boolean> {
  const state = await getMaintenanceState();
  return state.enabled;
}

/**
 * Atualiza o estado de manutenção pelo Superadmin
 */
export async function setMaintenanceState(
  params: {
    enabled: boolean;
    title?: string;
    message?: string;
    estimatedEnd?: string | null;
    internalReason?: string | null;
  },
  actor?: JwtUser | { id: string; email?: string; name?: string }
): Promise<MaintenanceState> {
  const currentState = await getMaintenanceState();
  const wasEnabled = currentState.enabled;
  const isNowEnabled = params.enabled;

  const nextState: MaintenanceState = {
    enabled: isNowEnabled,
    title: (params.title || currentState.title || DEFAULT_TITLE).trim(),
    message: (params.message || currentState.message || DEFAULT_MESSAGE).trim(),
    estimatedEnd: params.estimatedEnd !== undefined ? params.estimatedEnd : currentState.estimatedEnd,
    internalReason: params.internalReason !== undefined ? params.internalReason : currentState.internalReason,
    updatedAt: new Date().toISOString(),
    updatedBy: actor ? (actor as JwtUser).sub || (actor as { id: string }).id : null,
  };

  await prisma.platformSetting.upsert({
    where: { key: "global_maintenance" },
    create: {
      key: "global_maintenance",
      value: asInputJson(nextState),
    },
    update: {
      value: asInputJson(nextState),
    },
  });

  // Invalida cache imediatamente
  cachedState = nextState;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  // Auditoria
  const action = !wasEnabled && isNowEnabled
    ? "maintenance.enabled"
    : wasEnabled && !isNowEnabled
      ? "maintenance.disabled"
      : "maintenance.updated";

  const userId = actor ? (actor as JwtUser).sub || (actor as { id: string }).id : null;

  try {
    const { AuditService } = await import("./audit");
    await AuditService.record({
      action,
      userId,
      entity: "PlatformSetting",
      entityId: "global_maintenance",
      metadata: {
        enabled: isNowEnabled,
        title: nextState.title,
        estimatedEnd: nextState.estimatedEnd,
        internalReason: nextState.internalReason || undefined,
      },
    });
  } catch (err) {
    console.warn("[maintenance] Falha ao registrar auditoria:", err);
  }

  // Notificação via WebSocket para todos os clientes conectados
  try {
    const { broadcastToAllUsers } = await import("../ws/hub");
    if (typeof broadcastToAllUsers === "function") {
      broadcastToAllUsers("system.maintenance_changed", {
        enabled: nextState.enabled,
        title: nextState.title,
        message: nextState.message,
        estimatedEnd: nextState.estimatedEnd,
      });
    }
  } catch {
    /* ignore */
  }

  return nextState;
}

/**
 * Lança erro 503 padronizado se a manutenção estiver ativa
 */
export function createMaintenanceError(state: MaintenanceState): AppError {
  return new AppError(
    state.message || DEFAULT_MESSAGE,
    503,
    "MAINTENANCE_MODE",
    {
      maintenance: {
        title: state.title,
        message: state.message,
        estimatedEnd: state.estimatedEnd,
      },
    }
  );
}

/**
 * Scheduler para limpeza periódica de sessões e tokens expirados
 */
export function startMaintenanceScheduler(opts?: { log?: (msg: string) => void }) {
  const log = opts?.log || (() => {});
  const intervalMs = 60 * 60 * 1000; // 1 hora

  const runCleanup = async () => {
    try {
      const now = new Date();
      const expiredTokens = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }).catch(() => ({ count: 0 }));

      const expiredSessions = await prisma.authSession.deleteMany({
        where: { expiresAt: { lt: now } },
      }).catch(() => ({ count: 0 }));

      if (expiredTokens.count > 0 || expiredSessions.count > 0) {
        log("[maintenance] Limpeza: " + expiredTokens.count + " tokens e " + expiredSessions.count + " sessões expiradas removidos.");
      }
    } catch (err) {
      log("[maintenance] Erro na limpeza periódica: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  setInterval(runCleanup, intervalMs);
}
