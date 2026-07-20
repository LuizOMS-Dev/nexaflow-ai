import { randomBytes } from "crypto";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { hashOpaqueToken } from "./password";

const REFRESH_DAYS = env.refreshTokenDays;
const ACCESS_MINUTES = env.accessTokenMinutes;

export const ACCESS_TOKEN_TTL = `${ACCESS_MINUTES}m`;
export const ACCESS_TOKEN_SECONDS = ACCESS_MINUTES * 60;
export const REFRESH_COOKIE = "nexa_refresh";
export const REFRESH_MAX_AGE_SEC = REFRESH_DAYS * 24 * 60 * 60;

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function refreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
}

export function deviceLabelFromUa(ua?: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const s = ua.slice(0, 180);
  if (/mobile/i.test(s)) return "Mobile";
  if (/edg\//i.test(s)) return "Edge";
  if (/chrome/i.test(s)) return "Chrome";
  if (/firefox/i.test(s)) return "Firefox";
  if (/safari/i.test(s)) return "Safari";
  return "Desktop";
}

export async function createAuthSession(params: {
  userId: string;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  impersonatorId?: string | null;
  isImpersonation?: boolean;
  impersonationReason?: string | null;
  /** ms; default 2h for impersonation */
  impersonationMaxMs?: number;
}) {
  const raw = generateRefreshToken();
  const hash = hashOpaqueToken(raw);
  const familyId = randomBytes(16).toString("hex");
  const isImp = Boolean(params.isImpersonation);
  const impExpires =
    isImp
      ? new Date(Date.now() + (params.impersonationMaxMs ?? 2 * 60 * 60 * 1000))
      : null;
  const session = await prisma.authSession.create({
    data: {
      userId: params.userId,
      tenantId: params.tenantId || null,
      refreshTokenHash: hash,
      familyId,
      expiresAt: refreshExpiresAt(),
      ip: params.ip || null,
      userAgent: params.userAgent?.slice(0, 500) || null,
      deviceLabel: deviceLabelFromUa(params.userAgent),
      impersonatorId: params.impersonatorId || null,
      isImpersonation: isImp,
      impersonationReason: params.impersonationReason || null,
      impersonationExpiresAt: impExpires,
    },
  });
  return { session, refreshToken: raw };
}

export async function rotateAuthSession(params: {
  rawRefresh: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<
  | {
      ok: true;
      session: {
        id: string;
        userId: string;
        tenantId: string | null;
        isImpersonation: boolean;
        impersonatorId: string | null;
      };
      refreshToken: string;
    }
  | { ok: false; reason: "INVALID" | "REUSE" | "REVOKED" | "EXPIRED" }
> {
  const hash = hashOpaqueToken(params.rawRefresh);
  const existing = await prisma.authSession.findUnique({ where: { refreshTokenHash: hash } });

  if (!existing) {
    // possível reuso de token já rotacionado — tenta achar por family via metadata futura
    return { ok: false, reason: "INVALID" };
  }

  if (existing.revokedAt) {
    // Reuso de token revogado: revoga a família inteira
    await prisma.authSession.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "refresh_reuse_detected" },
    });
    return { ok: false, reason: "REUSE" };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    await prisma.authSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokeReason: "expired" },
    });
    return { ok: false, reason: "EXPIRED" };
  }

  // Rotação: revoga atual e cria nova na mesma family
  const raw = generateRefreshToken();
  const newHash = hashOpaqueToken(raw);

  await prisma.$transaction([
    prisma.authSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokeReason: "rotated" },
    }),
    prisma.authSession.create({
      data: {
        userId: existing.userId,
        tenantId: existing.tenantId,
        refreshTokenHash: newHash,
        familyId: existing.familyId,
        expiresAt: refreshExpiresAt(),
        ip: params.ip || existing.ip,
        userAgent: params.userAgent?.slice(0, 500) || existing.userAgent,
        deviceLabel: deviceLabelFromUa(params.userAgent) || existing.deviceLabel,
        // preserva contexto de impersonação na rotação do refresh
        impersonatorId: existing.impersonatorId,
        isImpersonation: existing.isImpersonation,
        impersonationReason: existing.impersonationReason,
        impersonationExpiresAt: existing.impersonationExpiresAt,
      },
    }),
  ]);

  const created = await prisma.authSession.findUnique({ where: { refreshTokenHash: newHash } });
  if (!created) return { ok: false, reason: "INVALID" };

  return {
    ok: true,
    session: {
      id: created.id,
      userId: created.userId,
      tenantId: created.tenantId,
      isImpersonation: created.isImpersonation,
      impersonatorId: created.impersonatorId,
    },
    refreshToken: raw,
  };
}

export async function revokeSession(sessionId: string, reason: string) {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

export async function revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string) {
  await prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

export async function touchSession(sessionId: string) {
  await prisma.authSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  }).catch(() => null);
}

export async function getValidSessionById(sessionId: string) {
  const s = await prisma.authSession.findUnique({ where: { id: sessionId } });
  if (!s || s.revokedAt) return null;
  if (s.expiresAt.getTime() < Date.now()) return null;
  return s;
}
