import Redis from "ioredis";
import { env } from "../../lib/env";

let client: Redis | null | undefined;
let connectAttempted = false;

/**
 * Redis para rate limit / locks auxiliares.
 * - RATE_LIMIT_REDIS=0 → desliga (só permitido em production com ALLOW_MEMORY_RATE_LIMIT=1)
 * - RATE_LIMIT_REDIS=1 → força
 * - padrão: usa Redis se REDIS_URL estiver definido (dev e prod)
 */
export function shouldUseRedis(): boolean {
  if (process.env.RATE_LIMIT_REDIS === "0") return false;
  if (process.env.RATE_LIMIT_REDIS === "1") return true;
  return Boolean(env.redisUrl);
}

/** Em production, Redis é dependência crítica (salvo opt-out explícito e inseguro). */
export function isRedisCritical(): boolean {
  if (env.nodeEnv !== "production") return false;
  if (process.env.ALLOW_MEMORY_RATE_LIMIT === "1" && process.env.RATE_LIMIT_REDIS === "0") {
    return false;
  }
  return true;
}

export async function getRedis(): Promise<Redis | null> {
  if (!shouldUseRedis()) return null;
  if (connectAttempted) return client ?? null;
  connectAttempted = true;

  try {
    const redis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    redis.on("error", () => {
      /* evita unhandled; fallback será memória */
    });
    await redis.connect();
    await redis.ping();
    client = redis;
    return client;
  } catch {
    client = null;
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function redisSet(
  key: string,
  value: string,
  ttlSec: number
): Promise<boolean> {
  const r = await getRedis();
  if (!r) return false;
  try {
    await r.set(key, value, "EX", ttlSec);
    return true;
  } catch {
    return false;
  }
}

export async function redisDel(key: string): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    /* ignore */
  }
}

export async function redisIncr(key: string, ttlSec: number): Promise<number | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, ttlSec);
    return n;
  } catch {
    return null;
  }
}
