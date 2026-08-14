import type { HumanState } from "./types";

const QR_TTL_MS = 45_000;

export function isQrFresh(qrUpdatedAt?: string | null, expiresIn?: number | null): boolean {
  if (!qrUpdatedAt) return Boolean(expiresIn && expiresIn > 0);
  const ttl = (expiresIn ?? 45) * 1000;
  const age = Date.now() - new Date(qrUpdatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < (ttl || QR_TTL_MS);
}

/**
 * Estados humanos da tela Canais > WhatsApp.
 * Nunca expõe provider, socket ou nome de sessão.
 */
export function resolveHumanState(params: {
  hasChannel: boolean;
  runtimeState?: string | null;
  hasQr?: boolean;
  qrFresh?: boolean;
  error?: string | null;
  busy?: boolean;
}): HumanState {
  if (!params.hasChannel) return "not_configured";
  if (params.busy) return "preparing";

  const st = (params.runtimeState || "").toLowerCase().trim();
  const err = params.error?.trim();

  if (st === "open" || st === "working") return "connected";
  if (st === "logged_out" || st === "logout") return "logged_out";
  if (st === "reconnecting") return "reconnecting";
  if (st === "error") return "error";

  if (st === "scan_qr_code" || st.includes("scan_qr") || st === "connecting" || st === "starting") {
    if (params.hasQr && params.qrFresh === false) return "qr_expired";
    if (params.hasQr) return "qr_visible";
    return st === "starting" || !params.hasQr ? "preparing" : "awaiting_qr";
  }

  if (st === "failed") return params.hasQr ? "qr_expired" : "error";

  if (st === "close" || st === "closed" || st === "disconnected" || st === "stopped") {
    if (params.hasQr && params.qrFresh !== false) return "qr_visible";
    if (params.hasQr) return "qr_expired";
    return "disconnected";
  }

  if (st === "unknown" || !st) {
    if (params.hasQr && params.qrFresh === false) return "qr_expired";
    if (params.hasQr) return "qr_visible";
    if (err) return "error";
    return "preparing";
  }

  if (err && st !== "connecting" && st !== "open") return "error";
  if (params.hasQr) return params.qrFresh === false ? "qr_expired" : "qr_visible";
  return "disconnected";
}

export function humanBadgeClass(state: HumanState): string {
  switch (state) {
    case "connected":
      return "badge-success";
    case "awaiting_qr":
    case "qr_visible":
    case "preparing":
    case "reconnecting":
      return "badge-brand";
    case "qr_expired":
    case "disconnected":
    case "not_configured":
    case "logged_out":
    case "session_lost":
      return "badge-warning";
    case "error":
      return "badge-danger";
    default:
      return "badge-neutral";
  }
}

export function healthHuman(raw?: string | null): string {
  if (!raw) return "—";
  const s = raw.toUpperCase();
  if (s.includes("OPER") || s === "OK" || s === "HEALTHY" || s === "UP") return "Operando";
  if (s.includes("ATEN") || s.includes("WARN") || s.includes("DEGRAD")) return "Atenção";
  if (s.includes("DOWN") || s.includes("INDISP") || s.includes("ERROR")) return "Indisponível";
  if (s.includes("SEM") || s.includes("EMPTY") || s.includes("UNKNOWN")) return "Sem dados";
  if (/^[A-Z_]+$/.test(raw) && raw.length > 12) return "—";
  return raw;
}

export function sanitizePublicError(raw?: string | null): string | null {
  if (!raw) return null;
  if (/baileys|evolution|socket|instance|wwebjs|waha|apikey|api.?key/i.test(raw)) {
    return null;
  }
  return raw;
}
