import { prisma } from "../../lib/prisma";
import { asInputJsonOpt } from "../../lib/json";

export async function recordSecurityEvent(params: {
  type: string;
  userId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.securityEvent.create({
      data: {
        type: params.type,
        userId: params.userId || null,
        tenantId: params.tenantId || null,
        ip: params.ip || null,
        userAgent: params.userAgent?.slice(0, 500) || null,
        metadata: asInputJsonOpt(params.metadata),
      },
    });
  } catch (err) {
    console.error("[security-event]", err instanceof Error ? err.message : err);
  }
}

export async function recordLoginAttempt(params: {
  email: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  success: boolean;
  reason?: string;
}) {
  try {
    await prisma.loginAttempt.create({
      data: {
        email: params.email.toLowerCase(),
        userId: params.userId || null,
        ip: params.ip || null,
        userAgent: params.userAgent?.slice(0, 500) || null,
        success: params.success,
        reason: params.reason || null,
      },
    });
  } catch (err) {
    console.error("[login-attempt]", err instanceof Error ? err.message : err);
  }
}
