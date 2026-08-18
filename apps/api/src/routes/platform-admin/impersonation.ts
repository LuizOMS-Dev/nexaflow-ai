import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  startImpersonationSession,
  stopImpersonationSession,
} from "../../services/platform-admin/impersonation";
import { env } from "../../lib/env";
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SEC,
} from "../../services/security/session";
import type { JwtUser } from "../../plugins/auth";

function cookieSecure() {
  return env.nodeEnv === "production";
}

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE_SEC,
  });
}

function setAccessCookie(reply: FastifyReply, token: string) {
  reply.setCookie("nexa_access", token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_SECONDS,
  });
}

export async function adminImpersonationRoutes(app: FastifyInstance) {
  // 1. Início de impersonação (Requer Superadmin limpo)
  app.post(
    "/admin/impersonate",
    { preHandler: [app.requireSuperadmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = z
        .object({
          tenantId: z.string(),
          userId: z.string().optional(),
          reason: z.string().min(8, "O motivo da impersonação deve ter pelo menos 8 caracteres").max(500),
        })
        .parse(request.body);

      const result = await startImpersonationSession(
        request.user as unknown as JwtUser,
        body,
        {
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          jwtSign: (payload) => app.jwt.sign(payload),
        }
      );

      setRefreshCookie(reply, result.refreshToken);
      setAccessCookie(reply, result.accessToken);

      const { refreshToken: _r, ...responseBody } = result;
      return responseBody;
    }
  );

  // 2. Encerramento de impersonação (Requer apenas autenticação ativa da sessão impersonada)
  app.post(
    "/admin/stop-impersonation",
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await stopImpersonationSession(
        request.user as unknown as JwtUser,
        {
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          jwtSign: (payload) => app.jwt.sign(payload),
        }
      );

      setRefreshCookie(reply, result.refreshToken);
      setAccessCookie(reply, result.accessToken);

      const { refreshToken: _r, ...responseBody } = result;
      return responseBody;
    }
  );
}
