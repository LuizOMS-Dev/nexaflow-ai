import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../lib/env";
import { AppError } from "../lib/errors";
import type { MemberRole } from "@prisma/client";
import { hasPermission, type Permission } from "../services/security/permissions";
import { getValidSessionById, touchSession } from "../services/security/session";
import { ACCESS_TOKEN_TTL } from "../services/security/session";
import { prisma } from "../lib/prisma";
import { requireSuperadminMfa } from "../services/security/step-up";

/**
 * Arquitetura de tokens (Opção A — documentada):
 *
 * - Access JWT: preferencialmente em memória do client + header Authorization Bearer
 *   (também pode ir em cookie HttpOnly nexa_access para same-origin bootstrap)
 * - Refresh: SOMENTE cookie HttpOnly nexa_refresh (nunca localStorage, nunca legível por JS)
 * - Payload: sub, sid (jti de sessão), tenantId, role, platformRole, iss, aud, iat, exp, imp?, impBy?
 * - Sessão revogada invalida access mesmo com JWT ainda “assinado”
 */

export type JwtUser = {
  sub: string;
  email?: string;
  name?: string;
  platformRole?: string | null;
  tenantId?: string | null;
  role?: MemberRole | null;
  sid?: string;
  /** jti = session id (alias) */
  jti?: string;
  iss?: string;
  aud?: string | string[];
  imp?: boolean;
  impBy?: string | null;
};

export default fp(async (app) => {
  await app.register(fjwt, {
    secret: env.jwtSecret,
    sign: {
      expiresIn: ACCESS_TOKEN_TTL,
      iss: env.jwtIssuer,
      aud: env.jwtAudience,
    },
    decode: { complete: true },
    verify: {
      allowedIss: env.jwtIssuer,
      allowedAud: env.jwtAudience,
      // algoritmos: @fastify/jwt usa HS256 por padrão com secret string
    },
    cookie: {
      cookieName: "nexa_access",
      signed: false,
    },
  });

  app.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        await request.jwtVerify();
      } else {
        await request.jwtVerify({ onlyCookie: true });
      }
    } catch {
      throw new AppError("Não autenticado", 401, "UNAUTHORIZED");
    }

    const payload = request.user as JwtUser;

    // Validação explícita iss/aud (defense in depth além do verify)
    if (payload.iss && payload.iss !== env.jwtIssuer) {
      throw new AppError("Token inválido (iss)", 401, "TOKEN_ISS");
    }
    const aud = payload.aud;
    if (aud) {
      const ok = Array.isArray(aud) ? aud.includes(env.jwtAudience) : aud === env.jwtAudience;
      if (!ok) throw new AppError("Token inválido (aud)", 401, "TOKEN_AUD");
    }

    const sessionId = payload.sid || payload.jti;
    if (!sessionId) {
      throw new AppError("Token sem sessão", 401, "TOKEN_NO_SESSION");
    }

    const session = await getValidSessionById(sessionId);
    if (!session) {
      throw new AppError("Sessão revogada ou expirada", 401, "SESSION_REVOKED");
    }

    // Impersonação com hard cap
    if (session.isImpersonation && session.impersonationExpiresAt) {
      if (session.impersonationExpiresAt.getTime() < Date.now()) {
        throw new AppError("Impersonação expirada", 401, "IMPERSONATION_EXPIRED");
      }
    }

    if (session.isImpersonation) {
      (request.user as JwtUser).imp = true;
      (request.user as JwtUser).impBy = session.impersonatorId;
    }
    (request.user as JwtUser).sid = sessionId;
    if (session.tenantId) {
      (request.user as JwtUser).tenantId = session.tenantId;
    }

    void touchSession(session.id);

    // ── ACCESS GATE (fonte única) ──
    const { evaluateAccessGate, assertAccessAllowsRequest } = await import(
      "../services/access-gate"
    );
    const decision = await evaluateAccessGate({
      userId: payload.sub,
      tenantId: session.tenantId || payload.tenantId || null,
      role: (payload.role || null) as MemberRole | null,
      platformRole: payload.platformRole,
      impersonating: Boolean(session.isImpersonation),
    });

    // Anexa resumo no request (para handlers/UI)
    (request as FastifyRequest & { accessGate?: typeof decision }).accessGate = decision;

    const path = (request.url || "/").split("?")[0] || "/";
    const method = request.method || "GET";
    assertAccessAllowsRequest(decision, { path, method });
  });

  app.decorate("requireSuperadmin", async (request: FastifyRequest, _reply: FastifyReply) => {
    await app.authenticate(request, _reply);
    const user = request.user as JwtUser;

    // Em impersonação: bloquear /admin e diferenciar MFA ausente na conta REAL
    if (user.imp) {
      if (user.impBy) {
        const real = await (
          await import("../lib/prisma")
        ).prisma.user.findUnique({
          where: { id: user.impBy },
          select: { twoFactorEnabled: true, platformRole: true },
        });
        if (
          real?.platformRole === "SUPERADMIN" &&
          !real.twoFactorEnabled &&
          (await import("../lib/env")).env.superadminMfaRequired
        ) {
          throw new AppError(
            "Para acessar a administração, encerre o acesso à empresa e ative o MFA na sua conta de superadministrador.",
            403,
            "MFA_REQUIRED_WHILE_IMPERSONATING"
          );
        }
      }
      throw new AppError(
        "Encerre a impersonação antes de acessar a administração da plataforma.",
        403,
        "IMPERSONATION_ACTIVE"
      );
    }

    if (user.platformRole !== "SUPERADMIN") {
      throw new AppError("Acesso restrito ao superadministrador", 403, "FORBIDDEN");
    }
    await requireSuperadminMfa(user);
  });

  app.decorate(
    "requireRoles",
    (roles: MemberRole[]) =>
      async (request: FastifyRequest, _reply: FastifyReply) => {
        await app.authenticate(request, _reply);
        const user = request.user as JwtUser;
        if (user.platformRole === "SUPERADMIN" && !user.imp) return;
        if (!user.role || !roles.includes(user.role)) {
          throw new AppError("Sem permissão", 403, "FORBIDDEN");
        }
      }
  );

  app.decorate(
    "requirePermission",
    (permission: Permission) =>
      async (request: FastifyRequest, _reply: FastifyReply) => {
        await app.authenticate(request, _reply);
        const user = request.user as JwtUser;
        if (
          !hasPermission(user.role, user.platformRole, permission, {
            impersonating: Boolean(user.imp),
          })
        ) {
          throw new AppError("Sem permissão", 403, "FORBIDDEN");
        }
      }
  );

  app.decorate("requireTenant", async (request: FastifyRequest, _reply: FastifyReply) => {
    await app.authenticate(request, _reply);
    const user = request.user as JwtUser;
    if (!user.tenantId && (user.platformRole !== "SUPERADMIN" || user.imp)) {
      throw new AppError("Empresa não selecionada", 400, "TENANT_REQUIRED");
    }
  });
});

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (
      roles: MemberRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuperadmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
