/**
 * Probe do gateway WhatsApp (WAHA / Evolution).
 * WAHA autentica com header X-Api-Key — nunca o header Evolution `apikey` sozinho.
 */

export type GatewayProbeResult = {
  provider: string;
  reachable: boolean;
  ok: boolean;
  authFailed: boolean;
  missingKey: boolean;
  hashedKeyMisconfigured: boolean;
  statusCode: number | null;
  path: string | null;
  latencyMs: number;
};

const DUMMY_KEY = "nexaflow-evolution-key";

export function resolveGatewayApiKey(): {
  key: string;
  missing: boolean;
  hashedOnly: boolean;
} {
  const raw = (
    process.env.WA_GATEWAY_API_KEY ||
    process.env.WAHA_API_KEY_PLAIN ||
    process.env.WAHA_API_KEY ||
    process.env.EVOLUTION_API_KEY ||
    ""
  ).trim();

  const hashedOnly = /^sha512:/i.test(raw);
  const dummy = raw === DUMMY_KEY;
  if (!raw || dummy || hashedOnly) {
    return { key: "", missing: true, hashedOnly };
  }
  return { key: raw, missing: false, hashedOnly: false };
}

export function wahaAuthHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = (apiKey || "").trim();
  if (!key || /^sha512:/i.test(key) || key === DUMMY_KEY) return h;
  h["X-Api-Key"] = key;
  return h;
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function fetchStatus(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; ok: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    return { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeWhatsAppGateway(
  opts?: {
    provider?: string;
    baseUrl?: string;
    timeoutMs?: number;
  }
): Promise<GatewayProbeResult> {
  const provider = (opts?.provider || process.env.WA_GATEWAY_PROVIDER || "baileys").toLowerCase();
  const t0 = performance.now();
  const latency = () => Math.max(1, Math.round(performance.now() - t0));

  if (provider === "baileys" || provider === "simulated") {
    return {
      provider,
      reachable: true,
      ok: true,
      authFailed: false,
      missingKey: false,
      hashedKeyMisconfigured: false,
      statusCode: 200,
      path: "embedded",
      latencyMs: 1,
    };
  }

  const base = (opts?.baseUrl || process.env.WA_GATEWAY_URL || process.env.EVOLUTION_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) {
    return {
      provider,
      reachable: false,
      ok: false,
      authFailed: false,
      missingKey: false,
      hashedKeyMisconfigured: false,
      statusCode: null,
      path: null,
      latencyMs: latency(),
    };
  }

  const { key, missing, hashedOnly } = resolveGatewayApiKey();
  const timeoutMs = opts?.timeoutMs ?? 2500;
  const headers = wahaAuthHeaders(key);

  if (hashedOnly) {
    try {
      const ping = await fetchStatus(joinUrl(base, "/ping"), { Accept: "application/json" }, timeoutMs);
      return {
        provider,
        reachable: ping.status > 0,
        ok: false,
        authFailed: true,
        missingKey: true,
        hashedKeyMisconfigured: true,
        statusCode: ping.status,
        path: "/ping",
        latencyMs: latency(),
      };
    } catch {
      return {
        provider,
        reachable: false,
        ok: false,
        authFailed: true,
        missingKey: true,
        hashedKeyMisconfigured: true,
        statusCode: null,
        path: null,
        latencyMs: latency(),
      };
    }
  }

  const authedPaths =
    provider === "waha"
      ? ["/api/sessions?all=true", "/api/server/status"]
      : ["/instance/fetchInstances", "/health"];
  const publicPaths = ["/ping", "/health"];

  let lastStatus: number | null = null;
  let lastPath: string | null = null;
  let reachable = false;

  if (!missing) {
    for (const path of authedPaths) {
      try {
        const res = await fetchStatus(joinUrl(base, path), headers, timeoutMs);
        lastStatus = res.status;
        lastPath = path.split("?")[0];
        reachable = true;
        if (res.status === 401 || res.status === 403) {
          return {
            provider,
            reachable: true,
            ok: false,
            authFailed: true,
            missingKey: false,
            hashedKeyMisconfigured: false,
            statusCode: res.status,
            path: lastPath,
            latencyMs: latency(),
          };
        }
        if (res.ok || res.status === 404) {
          return {
            provider,
            reachable: true,
            ok: true,
            authFailed: false,
            missingKey: false,
            hashedKeyMisconfigured: false,
            statusCode: res.status,
            path: lastPath,
            latencyMs: latency(),
          };
        }
      } catch {
        /* tenta próximo */
      }
    }
  }

  for (const path of publicPaths) {
    try {
      const res = await fetchStatus(joinUrl(base, path), { Accept: "application/json" }, timeoutMs);
      lastStatus = res.status;
      lastPath = path;
      reachable = true;
      break;
    } catch {
      /* tenta próximo */
    }
  }

  return {
    provider,
    reachable,
    ok: false,
    authFailed: reachable && (missing || lastStatus === 401 || lastStatus === 403),
    missingKey: missing,
    hashedKeyMisconfigured: false,
    statusCode: lastStatus,
    path: lastPath,
    latencyMs: latency(),
  };
}
