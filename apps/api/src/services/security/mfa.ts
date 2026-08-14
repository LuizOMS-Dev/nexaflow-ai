import { randomBytes, createHash } from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import { prisma } from "../../lib/prisma";
import { hashOpaqueToken } from "./password";
import { AppError } from "../../lib/errors";
import { decryptSecret, encryptSecret } from "./crypto";

const ISSUER = "NexaFlow AI";
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;
const TOTP_STEP_SECONDS = 30;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return generateURI({
    issuer: ISSUER,
    label: email,
    secret,
  });
}

export function storeTotpSecret(plain: string): string {
  return encryptSecret(plain, 1);
}

export function loadTotpSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored).plain;
  } catch {
    return null;
  }
}

/** Verifica TOTP e anti-replay por timestep */
export function verifyTotpCode(
  secret: string,
  token: string,
  lastStep?: number | null
): { ok: true; step: number } | { ok: false; reason?: string } {
  const code = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "format" };
  try {
    const result = verifySync({ token: code, secret }) as {
      valid?: boolean;
      epoch?: number;
      timeStep?: number;
    };
    if (!result?.valid) return { ok: false, reason: "invalid" };
    const step =
      typeof result.timeStep === "number"
        ? result.timeStep
        : Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    if (lastStep != null && step <= lastStep) {
      return { ok: false, reason: "replay" };
    }
    return { ok: true, step };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    plain.push(code);
    hashed.push(hashOpaqueToken(code));
  }
  return { plain, hashed };
}

export function parseBackupHashes(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function consumeBackupCode(
  storedJson: string | null | undefined,
  code: string
): { ok: true; remainingJson: string } | { ok: false } {
  const hashes = parseBackupHashes(storedJson);
  if (!hashes.length) return { ok: false };
  const target = hashOpaqueToken(String(code || "").replace(/\s/g, "").toUpperCase());
  const idx = hashes.indexOf(target);
  if (idx < 0) return { ok: false };
  const next = [...hashes.slice(0, idx), ...hashes.slice(idx + 1)];
  return { ok: true, remainingJson: JSON.stringify(next) };
}

export async function createMfaChallenge(params: {
  userId: string;
  tenantId?: string | null;
  ip?: string | null;
}): Promise<string> {
  // Invalida challenges anteriores não usados
  await prisma.mfaChallenge.updateMany({
    where: { userId: params.userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = randomBytes(32).toString("base64url");
  await prisma.mfaChallenge.create({
    data: {
      userId: params.userId,
      tokenHash: hashOpaqueToken(raw),
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
      ip: params.ip || null,
      tenantId: params.tenantId || null,
      attempts: 0,
      maxAttempts: 5,
    },
  });
  return raw;
}

/**
 * Valida challenge sem consumir (para checar attempts).
 * Após sucesso, chamar consumeMfaChallengeSuccess.
 */
export async function getValidMfaChallenge(rawToken: string) {
  const tokenHash = hashOpaqueToken(rawToken);
  const row = await prisma.mfaChallenge.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new AppError("Código MFA expirado. Faça login novamente.", 401, "MFA_EXPIRED");
  }
  if (row.attempts >= row.maxAttempts) {
    await prisma.mfaChallenge.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    throw new AppError("Muitas tentativas MFA. Faça login novamente.", 429, "MFA_LOCKED");
  }
  return row;
}

export async function registerMfaFailure(challengeId: string) {
  const row = await prisma.mfaChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
  });
  if (row.attempts >= row.maxAttempts) {
    await prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: { usedAt: new Date() },
    });
    throw new AppError("Muitas tentativas MFA. Faça login novamente.", 429, "MFA_LOCKED");
  }
}

export async function consumeMfaChallengeSuccess(challengeId: string): Promise<{
  userId: string;
  tenantId: string | null;
}> {
  const row = await prisma.mfaChallenge.update({
    where: { id: challengeId },
    data: { usedAt: new Date() },
  });
  return { userId: row.userId, tenantId: row.tenantId };
}

/** @deprecated use getValidMfaChallenge + consume */
export async function consumeMfaChallenge(rawToken: string): Promise<{
  userId: string;
  tenantId: string | null;
}> {
  const row = await getValidMfaChallenge(rawToken);
  return consumeMfaChallengeSuccess(row.id);
}

export function secretFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}
