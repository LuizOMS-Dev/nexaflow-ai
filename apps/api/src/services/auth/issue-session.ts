import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { audit } from "../audit";
import {
  createAuthSession,
  ACCESS_TOKEN_SECONDS,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SEC,
} from "../security/session";
import { recordLoginAttempt, recordSecurityEvent } from "../security/security-event";
import { clearLoginFailures } from "../security/login-rate-limit";
import { getSecurityFlags } from "../security/step-up";
import { tenantNeedsOnboarding } from "../onboarding/company-onboarding";

export function clientMeta(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers["user-agent"] || null,
  };
}

function cookieSecure() {
  return env.nodeEnv === "production";
}

export function setSessionCookies(reply: FastifyReply, refreshToken: string, accessToken: string) {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE_SEC,
  });
  reply.setCookie("nexa_access", accessToken, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_SECONDS,
  });
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarType?: string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
  preferences?: unknown;
  platformRole?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    avatarType: (user.avatarType as "UPLOAD" | "INITIALS" | "NEXA_AVATAR") || "INITIALS",
    avatarPresetId: user.avatarPresetId ?? null,
    avatarColor: user.avatarColor ?? null,
    preferences: user.preferences ?? null,
    platformRole: user.platformRole,
  };
}

type MembershipRow = {
  tenantId: string;
  role: MemberRole;
  tenant: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
    logoUrl?: string | null;
    plan?: unknown;
    settings?: unknown;
  };
};

export async function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  params: {
    user: {
      id: string;
      email: string;
      name: string;
      phone?: string | null;
      avatarUrl?: string | null;
      avatarType?: string | null;
      avatarPresetId?: string | null;
      avatarColor?: string | null;
      preferences?: unknown;
      platformRole?: string | null;
      memberships: MembershipRow[];
    };
    membership?: MembershipRow | null;
    ip: string | null;
    userAgent: string | null;
    email: string;
    reason?: string;
  }
) {
  const { user, membership, ip, userAgent, email } = params;
  const { session, refreshToken } = await createAuthSession({
    userId: user.id,
    tenantId: membership?.tenantId || null,
    ip,
    userAgent,
  });

  const accessToken = app.jwt.sign({
    sub: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole || null,
    tenantId: membership?.tenantId || null,
    role: membership?.role || null,
    sid: session.id,
    jti: session.id,
    imp: false,
    impBy: null,
  });

  setSessionCookies(reply, refreshToken, accessToken);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastStrongAuthAt: new Date() },
  });
  await clearLoginFailures(email, ip || "");
  await recordLoginAttempt({
    email,
    userId: user.id,
    ip,
    userAgent,
    success: true,
    reason: params.reason || "ok",
  });
  await recordSecurityEvent({
    type: "LOGIN_SUCCESS",
    userId: user.id,
    tenantId: membership?.tenantId,
    ip,
    userAgent,
  });
  await audit({
    tenantId: membership?.tenantId,
    userId: user.id,
    action: "auth.gateway.signin",
    ip: ip || undefined,
    metadata: { sessionId: session.id },
  });

  const onboardingCompleted = membership
    ? !tenantNeedsOnboarding(membership.tenant.settings)
    : false;

  return {
    status: "authenticated" as const,
    accessToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    user: publicUser(user),
    tenant: membership
      ? {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          primaryColor: membership.tenant.primaryColor,
          logoUrl: membership.tenant.logoUrl,
          role: membership.role,
          plan: membership.tenant.plan,
          settings: membership.tenant.settings,
          onboardingCompleted,
        }
      : null,
    memberships: user.memberships.map((m) => ({
      tenantId: m.tenantId,
      role: m.role,
      tenant: {
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        primaryColor: m.tenant.primaryColor,
      },
    })),
    security: await getSecurityFlags(user.id, user.platformRole),
    next:
      user.platformRole === "SUPERADMIN"
        ? "admin"
        : onboardingCompleted
          ? "app"
          : "onboarding",
  };
}
