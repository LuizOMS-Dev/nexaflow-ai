/**
 * Tour da plataforma — estado por USUÁRIO (não por tenant).
 * Persistido em User.preferences.platformTour.
 * Independente do onboarding operacional da empresa.
 */

export const PLATFORM_TOUR_VERSION = 1;

/**
 * Usuários criados antes desta data não recebem convite automático
 * (legado). O tour manual continua disponível.
 * Ajuste apenas se precisar reabrir auto-offer em massa (não é o caso).
 */
/** Usuários criados a partir deste instante podem receber convite automático. */
export const PLATFORM_TOUR_AUTO_OFFER_FROM = new Date("2026-07-16T00:00:00.000Z");

export type PlatformTourStatus =
  | "NOT_OFFERED"
  | "OFFERED"
  | "STARTED"
  | "COMPLETED"
  | "DISMISSED";

export type PlatformTourState = {
  status: PlatformTourStatus;
  version: number;
  offeredAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  dismissedAt?: string | null;
  lastStep?: string | null;
  /** legacy = usuário antigo; manual_exit = saiu do tour; explore_alone = explorar sozinho */
  dismissReason?: "legacy" | "explore_alone" | "manual_exit" | "unknown" | null;
  restartedAt?: string | null;
};

export type PlatformTourAction =
  | "offer"
  | "dismiss"
  | "start"
  | "exit"
  | "complete"
  | "restart"
  | "step";

const TERMINAL: PlatformTourStatus[] = ["COMPLETED", "DISMISSED"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function readPreferences(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? { ...raw } : {};
}

export function parseTourState(raw: unknown): PlatformTourState | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (
    status !== "NOT_OFFERED" &&
    status !== "OFFERED" &&
    status !== "STARTED" &&
    status !== "COMPLETED" &&
    status !== "DISMISSED"
  ) {
    return null;
  }
  return {
    status,
    version: Number(raw.version) || PLATFORM_TOUR_VERSION,
    offeredAt: typeof raw.offeredAt === "string" ? raw.offeredAt : null,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    dismissedAt: typeof raw.dismissedAt === "string" ? raw.dismissedAt : null,
    lastStep: typeof raw.lastStep === "string" ? raw.lastStep : null,
    dismissReason:
      raw.dismissReason === "legacy" ||
      raw.dismissReason === "explore_alone" ||
      raw.dismissReason === "manual_exit" ||
      raw.dismissReason === "unknown"
        ? raw.dismissReason
        : null,
    restartedAt: typeof raw.restartedAt === "string" ? raw.restartedAt : null,
  };
}

/**
 * Resolve estado atual sem gravar.
 *
 * Sem platformTour salvo → NOT_OFFERED (convite automático uma vez).
 * Após dismiss/complete/exit → nunca mais automático.
 * Tour manual (Minha Conta) sempre disponível via action restart.
 *
 * Nota: o flag "legacy" só se aplica se o usuário JÁ tiver
 * preferences.platformTour.dismissReason === "legacy" gravado.
 */
export function resolveTourState(
  preferences: unknown,
  _userCreatedAt?: Date
): { state: PlatformTourState; needsBackfill: boolean } {
  const prefs = readPreferences(preferences);
  const existing = parseTourState(prefs.platformTour);
  if (existing) {
    return { state: existing, needsBackfill: false };
  }

  return {
    state: {
      status: "NOT_OFFERED",
      version: PLATFORM_TOUR_VERSION,
    },
    needsBackfill: false,
  };
}

export function shouldAutoOffer(state: PlatformTourState): boolean {
  return state.status === "NOT_OFFERED" || state.status === "OFFERED";
}

export function applyTourAction(
  current: PlatformTourState,
  action: PlatformTourAction,
  opts?: { stepId?: string | null }
): PlatformTourState {
  const now = new Date().toISOString();
  const next: PlatformTourState = {
    ...current,
    version: PLATFORM_TOUR_VERSION,
  };

  switch (action) {
    case "offer": {
      if (TERMINAL.includes(current.status) || current.status === "STARTED") {
        return current;
      }
      next.status = "OFFERED";
      next.offeredAt = current.offeredAt || now;
      return next;
    }
    case "dismiss": {
      if (TERMINAL.includes(current.status)) return current;
      next.status = "DISMISSED";
      next.dismissedAt = now;
      next.dismissReason = "explore_alone";
      return next;
    }
    case "start": {
      next.status = "STARTED";
      next.startedAt = now;
      next.lastStep = opts?.stepId ?? current.lastStep ?? null;
      return next;
    }
    case "exit": {
      if (current.status === "COMPLETED") return current;
      next.status = "DISMISSED";
      next.dismissedAt = now;
      next.dismissReason = "manual_exit";
      if (opts?.stepId) next.lastStep = opts.stepId;
      return next;
    }
    case "complete": {
      next.status = "COMPLETED";
      next.completedAt = now;
      if (opts?.stepId) next.lastStep = opts.stepId;
      return next;
    }
    case "restart": {
      // Não apaga completedAt / histórico; só reabre sessão de tour.
      next.status = "STARTED";
      next.startedAt = now;
      next.restartedAt = now;
      next.lastStep = null;
      return next;
    }
    case "step": {
      if (opts?.stepId) next.lastStep = opts.stepId;
      return next;
    }
    default:
      return current;
  }
}

export function mergeTourIntoPreferences(
  preferences: unknown,
  tour: PlatformTourState
): Record<string, unknown> {
  const prefs = readPreferences(preferences);
  return {
    ...prefs,
    platformTour: tour,
  };
}

export function auditActionForTour(action: PlatformTourAction): string {
  switch (action) {
    case "offer":
      return "tour.offered";
    case "dismiss":
      return "tour.dismissed";
    case "start":
      return "tour.started";
    case "exit":
      return "tour.exited";
    case "complete":
      return "tour.completed";
    case "restart":
      return "tour.restarted";
    case "step":
      return "tour.step";
    default:
      return "tour.unknown";
  }
}
