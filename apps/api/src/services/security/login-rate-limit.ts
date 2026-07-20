/**
 * Rate limit de login (IP + e-mail).
 * Memória em dev; Redis em produção quando disponível.
 */

import { redisDel, redisGet, redisSet, getRedis } from "./redis";

type Bucket = {
  fails: number;
  firstAt: number;
  lockUntil: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const WINDOW_SEC = 15 * 60;
const MAX_FAILS = 5;
const PREFIX = "nexa:loginrl:";

function key(email: string, ip: string) {
  return `${ip}::${email.toLowerCase()}`;
}

function lockDuration(fails: number): number {
  if (fails < MAX_FAILS) return 0;
  if (fails === MAX_FAILS) return 60_000;
  if (fails === MAX_FAILS + 1) return 5 * 60_000;
  return 15 * 60_000;
}

function parseBucket(raw: string | null): Bucket | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Bucket;
  } catch {
    return null;
  }
}

export async function checkLoginAllowed(
  email: string,
  ip: string
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const k = key(email, ip);
  const now = Date.now();

  const redis = await getRedis();
  if (redis) {
    const b = parseBucket(await redisGet(PREFIX + k));
    if (!b) return { ok: true };
    if (now - b.firstAt > WINDOW_MS) {
      await redisDel(PREFIX + k);
      return { ok: true };
    }
    if (b.lockUntil > now) {
      return { ok: false, retryAfterSec: Math.ceil((b.lockUntil - now) / 1000) };
    }
    return { ok: true };
  }

  const b = buckets.get(k);
  if (!b) return { ok: true };
  if (now - b.firstAt > WINDOW_MS) {
    buckets.delete(k);
    return { ok: true };
  }
  if (b.lockUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.lockUntil - now) / 1000) };
  }
  return { ok: true };
}

export async function recordLoginFailure(email: string, ip: string) {
  const k = key(email, ip);
  const now = Date.now();
  const redis = await getRedis();

  if (redis) {
    const prev = parseBucket(await redisGet(PREFIX + k));
    let b: Bucket =
      !prev || now - prev.firstAt > WINDOW_MS
        ? { fails: 0, firstAt: now, lockUntil: 0 }
        : prev;
    b.fails += 1;
    const lock = lockDuration(b.fails);
    if (lock > 0) b.lockUntil = now + lock;
    await redisSet(PREFIX + k, JSON.stringify(b), WINDOW_SEC);
    return;
  }

  let b = buckets.get(k);
  if (!b || now - b.firstAt > WINDOW_MS) {
    b = { fails: 0, firstAt: now, lockUntil: 0 };
  }
  b.fails += 1;
  const lock = lockDuration(b.fails);
  if (lock > 0) b.lockUntil = now + lock;
  buckets.set(k, b);
}

export async function clearLoginFailures(email: string, ip: string) {
  const k = key(email, ip);
  buckets.delete(k);
  await redisDel(PREFIX + k);
}

/** Sync wrappers kept for call sites that don't await yet — prefer async APIs */
export function checkLoginAllowedSync(email: string, ip: string) {
  // fallback memória only (testes síncronos)
  const k = key(email, ip);
  const now = Date.now();
  const b = buckets.get(k);
  if (!b) return { ok: true as const };
  if (now - b.firstAt > WINDOW_MS) {
    buckets.delete(k);
    return { ok: true as const };
  }
  if (b.lockUntil > now) {
    return { ok: false as const, retryAfterSec: Math.ceil((b.lockUntil - now) / 1000) };
  }
  return { ok: true as const };
}
