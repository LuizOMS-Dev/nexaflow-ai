/**
 * Saúde da IA da plataforma (NIA + agentes AUTO).
 * Em rate limit / indisponibilidade: NIA não aparece "Online".
 * Estado em memória por processo — sem menu, só efeito operacional.
 */

export type PlatformAiHealth = {
  /** Provider configurado e sem instabilidade marcada */
  online: boolean;
  /** Instável (rate limit, erro recente, etc.) */
  unstable: boolean;
  reason: "ok" | "not_configured" | "rate_limit" | "provider_error" | "disabled";
  /** ISO — até quando considerar instável (cooldown) */
  unstableUntil: string | null;
  message: string | null;
};

/**
 * Cooldown após rate limit do provedor (ex.: Groq free TPM).
 * Antes: 90s — 2ª mensagem da NIA já caía no hard-block “instável”.
 * Groq free reseta TPM em ~60s; cooldown curto + NIA sempre tenta de novo.
 */
const RATE_LIMIT_COOLDOWN_MS = 22_000;
const ERROR_COOLDOWN_MS = 18_000;

let unstableUntil = 0;
let lastReason: PlatformAiHealth["reason"] = "ok";

export function markPlatformAiUnstable(
  reason: "rate_limit" | "provider_error",
  opts?: { cooldownMs?: number }
) {
  const ms =
    opts?.cooldownMs ??
    (reason === "rate_limit" ? RATE_LIMIT_COOLDOWN_MS : ERROR_COOLDOWN_MS);
  const until = Date.now() + ms;
  // Estende se já houver cooldown maior
  unstableUntil = Math.max(unstableUntil, until);
  lastReason = reason;
}

export function markPlatformAiHealthy() {
  unstableUntil = 0;
  lastReason = "ok";
}

export function isPlatformAiUnstableNow(): boolean {
  if (unstableUntil <= 0) return false;
  if (Date.now() >= unstableUntil) {
    unstableUntil = 0;
    lastReason = "ok";
    return false;
  }
  return true;
}

export function getPlatformAiHealth(params: {
  configured: boolean;
  enabled?: boolean;
}): PlatformAiHealth {
  if (params.enabled === false) {
    return {
      online: false,
      unstable: false,
      reason: "disabled",
      unstableUntil: null,
      message: "A NIA está desativada no momento.",
    };
  }
  if (!params.configured) {
    return {
      online: false,
      unstable: false,
      reason: "not_configured",
      unstableUntil: null,
      message: "A NIA está temporariamente indisponível.",
    };
  }
  if (isPlatformAiUnstableNow()) {
    const reason = lastReason === "rate_limit" ? "rate_limit" : "provider_error";
    return {
      online: false,
      unstable: true,
      reason,
      unstableUntil: new Date(unstableUntil).toISOString(),
      message:
        reason === "rate_limit"
          ? "A NIA está instável no momento. Tente de novo em alguns minutos."
          : "A NIA está temporariamente indisponível. Tente novamente em alguns instantes.",
    };
  }
  return {
    online: true,
    unstable: false,
    reason: "ok",
    unstableUntil: null,
    message: null,
  };
}
