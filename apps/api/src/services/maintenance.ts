import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { AppError } from "../lib/errors";
import type { JwtUser } from "../plugins/auth";
import {
  TenantSection,
  ALL_SECTIONS,
  TENANT_SECTIONS,
} from "./maintenance-sections";

export type SectionMaintenanceState = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
  internalReason?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
};

export type MaintenanceState = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
  internalReason?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  sections: Record<TenantSection, SectionMaintenanceState>;
};

export type PublicSectionStatus = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
};

export type PublicMaintenanceStatus = {
  enabled: boolean;
  title: string;
  message: string;
  estimatedEnd?: string | null;
  sections: Record<TenantSection, PublicSectionStatus>;
};

const DEFAULT_GLOBAL_TITLE = "Estamos em manutenção";
const DEFAULT_GLOBAL_MESSAGE =
  "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve.";

function createDefaultSections(): Record<TenantSection, SectionMaintenanceState> {
  const result = {} as Record<TenantSection, SectionMaintenanceState>;
  for (const sec of ALL_SECTIONS) {
    const meta = TENANT_SECTIONS[sec];
    result[sec] = {
      enabled: false,
      title: meta?.defaultTitle || "Módulo em manutenção",
      message:
        meta?.defaultMessage ||
        "Estamos realizando melhorias neste módulo. As demais áreas do NexaFlow continuam funcionando normalmente.",
      estimatedEnd: null,
      internalReason: null,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    };
  }
  return result;
}

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  title: DEFAULT_GLOBAL_TITLE,
  message: DEFAULT_GLOBAL_MESSAGE,
  estimatedEnd: null,
  internalReason: null,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
  sections: createDefaultSections(),
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
 * Lê o estado soberano de manutenção da plataforma (global + seções)
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
      cachedState = {
        ...DEFAULT_STATE,
        sections: createDefaultSections(),
      };
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedState;
    }

    const val = setting.value as Record<string, unknown>;
    const defaultSecs = createDefaultSections();
    const rawSections = (val.sections && typeof val.sections === "object" ? val.sections : {}) as Record<
      string,
      Record<string, unknown>
    >;

    const parsedSections = {} as Record<TenantSection, SectionMaintenanceState>;
    for (const sec of ALL_SECTIONS) {
      const def = defaultSecs[sec];
      const raw = rawSections[sec];
      if (raw && typeof raw === "object") {
        parsedSections[sec] = {
          enabled: Boolean(raw.enabled),
          title: typeof raw.title === "string" && raw.title ? raw.title : def.title,
          message: typeof raw.message === "string" && raw.message ? raw.message : def.message,
          estimatedEnd: typeof raw.estimatedEnd === "string" ? raw.estimatedEnd : null,
          internalReason: typeof raw.internalReason === "string" ? raw.internalReason : null,
          updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : setting.updatedAt.toISOString(),
          updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
        };
      } else {
        parsedSections[sec] = def;
      }
    }

    cachedState = {
      enabled: Boolean(val.enabled),
      title: typeof val.title === "string" && val.title ? val.title : DEFAULT_GLOBAL_TITLE,
      message: typeof val.message === "string" && val.message ? val.message : DEFAULT_GLOBAL_MESSAGE,
      estimatedEnd: typeof val.estimatedEnd === "string" ? val.estimatedEnd : null,
      internalReason: typeof val.internalReason === "string" ? val.internalReason : null,
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: typeof val.updatedBy === "string" ? val.updatedBy : null,
      sections: parsedSections,
    };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return cachedState;
  } catch (err) {
    console.warn("[maintenance] Falha ao ler PlatformSetting:", err);
    return (
      cachedState || {
        ...DEFAULT_STATE,
        sections: createDefaultSections(),
      }
    );
  }
}

/**
 * Retorna apenas dados públicos seguros (sem internalReason ou dados de infraestrutura)
 */
export async function getPublicMaintenanceStatus(): Promise<PublicMaintenanceStatus> {
  const state = await getMaintenanceState();
  const publicSections = {} as Record<TenantSection, PublicSectionStatus>;

  for (const sec of ALL_SECTIONS) {
    const s = state.sections[sec];
    publicSections[sec] = {
      enabled: Boolean(s?.enabled),
      title: s?.title || TENANT_SECTIONS[sec]?.defaultTitle || "Módulo em manutenção",
      message: s?.message || TENANT_SECTIONS[sec]?.defaultMessage || "",
      estimatedEnd: s?.estimatedEnd || null,
    };
  }

  return {
    enabled: state.enabled,
    title: state.title,
    message: state.message,
    estimatedEnd: state.estimatedEnd,
    sections: publicSections,
  };
}

/**
 * Verifica rapidamente se o modo de manutenção global está ativado
 */
export async function isMaintenanceActive(): Promise<boolean> {
  const state = await getMaintenanceState();
  return state.enabled;
}

/**
 * Verifica rapidamente se uma seção específica está em manutenção (ou se global está ativo)
 */
export async function isSectionMaintenanceActive(section: TenantSection): Promise<boolean> {
  const state = await getMaintenanceState();
  if (state.enabled) return true;
  return Boolean(state.sections[section]?.enabled);
}

/**
 * Atualiza o estado de manutenção global pelo Superadmin
 */
export async function setGlobalMaintenanceState(
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
    ...currentState,
    enabled: isNowEnabled,
    title: (params.title || currentState.title || DEFAULT_GLOBAL_TITLE).trim(),
    message: (params.message || currentState.message || DEFAULT_GLOBAL_MESSAGE).trim(),
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
    ? "maintenance.global.enabled"
    : wasEnabled && !isNowEnabled
      ? "maintenance.global.disabled"
      : "maintenance.global.updated";

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
    console.warn("[maintenance] Falha ao registrar auditoria global:", err);
  }

  // Notificação via WebSocket
  try {
    const { broadcastToAllUsers } = await import("../ws/hub");
    if (typeof broadcastToAllUsers === "function") {
      broadcastToAllUsers("system.maintenance_changed", {
        global: {
          enabled: nextState.enabled,
          title: nextState.title,
          message: nextState.message,
          estimatedEnd: nextState.estimatedEnd,
        },
      });
    }
  } catch {
    /* ignore */
  }

  return nextState;
}

/**
 * Atualiza o estado de manutenção de uma seção específica pelo Superadmin
 */
export async function setSectionMaintenanceState(
  section: TenantSection,
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
  const currentSec = currentState.sections[section] || {
    enabled: false,
    title: TENANT_SECTIONS[section]?.defaultTitle || "Módulo em manutenção",
    message: TENANT_SECTIONS[section]?.defaultMessage || "",
    estimatedEnd: null,
    internalReason: null,
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  };

  const wasEnabled = currentSec.enabled;
  const isNowEnabled = params.enabled;

  const nextSecState: SectionMaintenanceState = {
    enabled: isNowEnabled,
    title: (params.title || currentSec.title || TENANT_SECTIONS[section]?.defaultTitle || "Módulo em manutenção").trim(),
    message: (params.message || currentSec.message || TENANT_SECTIONS[section]?.defaultMessage || "").trim(),
    estimatedEnd: params.estimatedEnd !== undefined ? params.estimatedEnd : currentSec.estimatedEnd,
    internalReason: params.internalReason !== undefined ? params.internalReason : currentSec.internalReason,
    updatedAt: new Date().toISOString(),
    updatedBy: actor ? (actor as JwtUser).sub || (actor as { id: string }).id : null,
  };

  const nextSections = {
    ...currentState.sections,
    [section]: nextSecState,
  };

  const nextState: MaintenanceState = {
    ...currentState,
    sections: nextSections,
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
    ? "maintenance.section.enabled"
    : wasEnabled && !isNowEnabled
      ? "maintenance.section.disabled"
      : "maintenance.section.updated";

  const userId = actor ? (actor as JwtUser).sub || (actor as { id: string }).id : null;

  try {
    const { AuditService } = await import("./audit");
    await AuditService.record({
      action,
      userId,
      entity: "PlatformSetting",
      entityId: `maintenance_section_${section.toLowerCase()}`,
      metadata: {
        section,
        enabled: isNowEnabled,
        title: nextSecState.title,
        estimatedEnd: nextSecState.estimatedEnd,
        internalReason: nextSecState.internalReason || undefined,
      },
    });
  } catch (err) {
    console.warn("[maintenance] Falha ao registrar auditoria de seção:", err);
  }

  // Notificação via WebSocket
  try {
    const { broadcastToAllUsers } = await import("../ws/hub");
    if (typeof broadcastToAllUsers === "function") {
      broadcastToAllUsers("system.maintenance_changed", {
        section,
        state: {
          enabled: nextSecState.enabled,
          title: nextSecState.title,
          message: nextSecState.message,
          estimatedEnd: nextSecState.estimatedEnd,
        },
      });
    }
  } catch {
    /* ignore */
  }

  return nextState;
}

/** Compatibilidade com código legado que chamava setMaintenanceState */
export const setMaintenanceState = setGlobalMaintenanceState;

/**
 * Lança erro 503 padronizado se a manutenção global estiver ativa
 */
export function createMaintenanceError(state: { title: string; message: string; estimatedEnd?: string | null }): AppError {
  return new AppError(
    state.message || DEFAULT_GLOBAL_MESSAGE,
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
 * Lança erro 503 padronizado para uma seção específica em manutenção
 */
export function createSectionMaintenanceError(
  section: TenantSection,
  state: SectionMaintenanceState
): AppError {
  return new AppError(
    state.message || "Este módulo está temporariamente em manutenção.",
    503,
    "SECTION_MAINTENANCE",
    {
      section,
      maintenance: {
        title: state.title,
        message: state.message,
        estimatedEnd: state.estimatedEnd,
      },
    }
  );
}

/**
 * Guarda central para validar disponibilidade de uma seção para a requisição
 */
export async function assertSectionAvailable(
  section: TenantSection,
  user?: JwtUser | null
): Promise<void> {
  // Superadmin não é bloqueado por manutenção
  if (user?.platformRole === "SUPERADMIN" && !user.imp) {
    return;
  }

  const state = await getMaintenanceState();

  // 1. Manutenção Global tem prioridade máxima
  if (state.enabled) {
    throw createMaintenanceError(state);
  }

  // 2. Manutenção da Seção específica
  const secState = state.sections[section];
  if (secState?.enabled) {
    throw createSectionMaintenanceError(section, secState);
  }
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
