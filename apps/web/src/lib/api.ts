/**
 * Client HTTP da NexaFlow.
 * - credentials: include → cookies HttpOnly (refresh + access)
 * - access token em memória (não localStorage)
 * - proxy same-origin /nexa-api
 */

function resolveApiUrl(): string {
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) {
    return envUrl;
  }
  if (envUrl.startsWith("/")) {
    return envUrl;
  }
  return "/nexa-api";
}

const API_URL = resolveApiUrl();

/** Access JWT só em memória de runtime (não localStorage) */
let memoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
  if (typeof window !== "undefined") {
    // limpa legado inseguro
    try {
      localStorage.removeItem("nexaflow_token");
    } catch {
      /* ignore */
    }
  }
}

export function getAccessToken() {
  return memoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** MFA de SUPERADMIN bloqueando /admin — UI do gate, não "erro de carregamento". */
export function isSuperadminMfaRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "MFA_REQUIRED_SUPERADMIN" ||
      error.code === "MFA_REQUIRED_WHILE_IMPERSONATING")
  );
}

/** Step-up: senha/MFA recentes exigidos para impersonação e ações sensíveis. */
export function isStepUpRequiredError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "STEP_UP_REQUIRED";
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await res.json()) as { accessToken?: string };
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { json?: unknown; timeoutMs?: number; _retry?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const method = (options.method || "GET").toUpperCase();
  const needsJsonBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  let body: BodyInit | undefined | null =
    options.json !== undefined ? JSON.stringify(options.json) : options.body;
  if (needsJsonBody && (body === undefined || body === null)) {
    headers.set("Content-Type", "application/json");
    body = "{}";
  }

  const timeoutMs = options.timeoutMs ?? 20000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "include",
    });

    // tenta refresh automático em 401 (exceto nas rotas de auth)
    if (
      res.status === 401 &&
      !options._retry &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/refresh") &&
      !path.includes("/auth/logout")
    ) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return api<T>(path, { ...options, _retry: true });
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        (data as { message?: string }).message || "Erro na requisição",
        res.status,
        (data as { error?: string }).error
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const msg = err instanceof Error ? err.message : "Erro de rede";
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError("A requisição demorou demais. Tente de novo.", 0, "TIMEOUT");
    }
    if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("fetch")) {
      throw new ApiError(
        `Não foi possível falar com a API (${url}). Confira se a API está no ar e recarregue com Ctrl+F5.`,
        0,
        "NETWORK_ERROR"
      );
    }
    throw new ApiError(msg, 0, "NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

export { API_URL };
