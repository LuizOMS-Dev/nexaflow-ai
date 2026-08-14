import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Expande localhost ↔ 127.0.0.1 (mesmo host, IPv4 loopback). */
function expandLoopbackTwins(origins: string[]): string[] {
  const out = new Set<string>();
  for (const o of origins) {
    const t = o.trim();
    if (!t) continue;
    out.add(t);
    try {
      const u = new URL(t);
      if (u.hostname === "localhost") {
        u.hostname = "127.0.0.1";
        out.add(u.origin);
      } else if (u.hostname === "127.0.0.1") {
        u.hostname = "localhost";
        out.add(u.origin);
      } else if (u.hostname === "[::1]" || u.hostname === "::1") {
        out.add(t.replace("[::1]", "localhost").replace("://::1", "://localhost"));
        out.add(t.replace("[::1]", "127.0.0.1").replace("://::1", "://127.0.0.1"));
      }
    } catch {
      /* ignore malformed */
    }
  }
  return [...out];
}

/** Origins permitidos (mesma fonte do CORS + gêmeos loopback em dev) */
export function allowedOrigins(): string[] {
  const raw = env.corsOrigin || "";
  if (!raw || raw === "*") {
    if (env.nodeEnv === "production") return [];
    return expandLoopbackTwins(["http://localhost:3000", "http://127.0.0.1:3000"]);
  }
  const listed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Em dev/test: sempre aceitar localhost e 127.0.0.1 como equivalentes
  if (env.nodeEnv !== "production") {
    return expandLoopbackTwins(listed);
  }
  return listed;
}

function originFromRequest(request: FastifyRequest): string | null {
  const origin = request.headers.origin;
  if (origin) return origin;
  const referer = request.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * CSRF defense-in-depth para mutações autenticadas via cookie.
 *
 * Arquitetura escolhida (Opção A híbrida):
 * - Access preferencialmente via Authorization Bearer (não CSRF-vulnerable da mesma forma)
 * - Refresh/access cookie: mutações exigem Origin/Referer na allowlist
 * - CORS sozinho NÃO é suficiente; esta checagem roda no servidor
 */
export function assertCsrf(request: FastifyRequest) {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return;

  // Webhooks / health internos sem browser origin
  const path = request.url.split("?")[0];
  if (
    path.startsWith("/webhooks/") ||
    path.startsWith("/health") ||
    path === "/"
  ) {
    return;
  }

  const authHeader = request.headers.authorization;
  const hasBearer = Boolean(authHeader?.startsWith("Bearer "));

  // Bearer-only requests from our SPA still send Origin; enforce when present.
  // Cookie-authenticated mutations MUST have valid Origin.
  const origin = originFromRequest(request);
  const allowed = allowedOrigins();

  if (!origin) {
    // Sem Origin: aceitar apenas se Bearer explícito (APIs/scripts) e não production strict?
    // Em production: mutações sem Origin e sem Bearer → bloqueia
    if (hasBearer) return;
    if (env.nodeEnv === "production") {
      throw new AppError("Origin ausente (CSRF)", 403, "CSRF_ORIGIN_MISSING");
    }
    // dev: allow curl without origin when using Bearer or cookie
    return;
  }

  if (allowed.length === 0) {
    throw new AppError("CORS/Origin não configurado", 403, "CSRF_MISCONFIGURED");
  }

  if (!allowed.includes(origin)) {
    throw new AppError("Origin não autorizada", 403, "CSRF_ORIGIN_DENIED");
  }
}

export function registerCsrfGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    assertCsrf(request);
  });
}
