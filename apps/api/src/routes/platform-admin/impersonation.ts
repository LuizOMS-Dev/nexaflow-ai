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
import { hashOpaqueToken } from "../../services/security/password";
import { prisma } from "../../lib/prisma";
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

  // 2. Encerramento de impersonação (100% à prova de falhas: recupera superadmin por bearer, cookie access, ou refresh cookie)
  app.post(
    "/admin/stop-impersonation",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let jwtUser: JwtUser | null = null;
      try {
        const auth = request.headers.authorization;
        if (auth?.startsWith("Bearer ")) {
          jwtUser = (await request.jwtVerify()) as JwtUser;
        } else {
          jwtUser = (await request.jwtVerify({ onlyCookie: true })) as JwtUser;
        }
      } catch {
        jwtUser = null;
      }

      // Se jwtVerify falhou (ex: expiração de 1s), tenta decodificar payload
      if (!jwtUser) {
        const auth = request.headers.authorization;
        const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (request.cookies?.["nexa_access"] as string);
        if (token) {
          try {
            const decoded = app.jwt.decode(token) as { payload?: JwtUser } | JwtUser;
            jwtUser = (decoded && typeof decoded === "object" && "payload" in decoded && decoded.payload
              ? decoded.payload
              : decoded) as JwtUser;
          } catch {
            jwtUser = null;
          }
        }
      }

      // Se ainda não achou, busca no banco pelo cookie de refresh
      if (!jwtUser) {
        const rawRefresh = request.cookies?.[REFRESH_COOKIE];
        if (rawRefresh) {
          const tokenHash = hashOpaqueToken(rawRefresh);
          const authSession = await prisma.authSession.findFirst({
            where: { refreshTokenHash: tokenHash },
          });
          if (authSession) {
            jwtUser = {
              sub: authSession.userId,
              sid: authSession.id,
              tenantId: authSession.tenantId,
              imp: authSession.isImpersonation,
              impBy: authSession.impersonatorId,
            };
          }
        }
      }

      const userToStop: JwtUser = jwtUser || {
        sub: "",
        tenantId: null,
        sid: undefined,
      };

      const result = await stopImpersonationSession(
        userToStop,
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
