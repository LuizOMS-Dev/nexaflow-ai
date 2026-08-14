/**
 * Classificação de desconexões Baileys — sem reconectar indiscriminadamente.
 * Não apaga credenciais em erros de transporte.
 */

export type DisconnectClass =
  | "TRANSIENT_NETWORK_ERROR"
  | "RESTART_REQUIRED"
  | "CONNECTION_CLOSED"
  | "TIMED_OUT"
  | "LOGGED_OUT"
  | "BAD_SESSION"
  | "MULTIDEVICE_MISMATCH"
  | "UNKNOWN";

/** Códigos comuns do Baileys DisconnectReason (podem variar por versão) */
const CODES = {
  loggedOut: 401,
  timedOut: 408,
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  restartRequired: 515,
  badSession: 500,
  multideviceMismatch: 411,
} as const;

export function classifyDisconnect(
  statusCode: number | undefined | null,
  DisconnectReason?: Record<string, number>
): DisconnectClass {
  const code = statusCode ?? -1;
  const R = DisconnectReason || {};

  const is = (key: keyof typeof CODES, fallback: number) =>
    code === (R[key] ?? fallback) || code === fallback;

  if (is("loggedOut", CODES.loggedOut) || code === 401) return "LOGGED_OUT";
  if (is("restartRequired", CODES.restartRequired) || code === 515) return "RESTART_REQUIRED";
  if (is("badSession", CODES.badSession) || code === 500) {
    // 500 genérico pode ser transitório — só BAD_SESSION se nome explícito no reason
    if (R.badSession != null && code === R.badSession) return "BAD_SESSION";
    return "TRANSIENT_NETWORK_ERROR";
  }
  if (is("multideviceMismatch", CODES.multideviceMismatch) || code === 411) {
    return "MULTIDEVICE_MISMATCH";
  }
  if (is("timedOut", CODES.timedOut) || code === 408) return "TIMED_OUT";
  if (is("connectionClosed", CODES.connectionClosed) || code === 428) {
    return "CONNECTION_CLOSED";
  }
  if (code === 440 || is("connectionReplaced", CODES.connectionReplaced)) {
    // outro cliente assumiu — não apagar auth; não loop infinito
    return "CONNECTION_CLOSED";
  }

  // códigos de rede / websocket
  if (code === -1 || code === 0 || code === 1006 || code === 503 || code === 502) {
    return "TRANSIENT_NETWORK_ERROR";
  }

  return "UNKNOWN";
}

/** Deve tentar reconectar? */
export function shouldReconnect(klass: DisconnectClass): boolean {
  return (
    klass === "TRANSIENT_NETWORK_ERROR" ||
    klass === "RESTART_REQUIRED" ||
    klass === "CONNECTION_CLOSED" ||
    klass === "TIMED_OUT" ||
    klass === "UNKNOWN"
  );
}

/** Deve invalidar / apagar credenciais no disco? */
export function shouldInvalidateAuth(klass: DisconnectClass): boolean {
  return klass === "LOGGED_OUT" || klass === "BAD_SESSION" || klass === "MULTIDEVICE_MISMATCH";
}

/**
 * Backoff exponencial com jitter técnico (evita thundering herd na infra).
 * NÃO é randomização para “parecer humano”.
 */
export function reconnectDelayMs(attempt: number, opts?: { baseMs?: number; maxMs?: number }): number {
  const base = opts?.baseMs ?? 1000;
  const max = opts?.maxMs ?? 60_000;
  const exp = Math.min(max, base * Math.pow(2, Math.min(attempt, 6)));
  const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.2));
  return Math.min(max, exp + jitter);
}
