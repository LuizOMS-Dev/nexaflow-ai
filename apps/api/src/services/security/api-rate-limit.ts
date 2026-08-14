/**
 * Rate limit por API key — Redis quando disponível, memória só como fallback local.
 */
import { getRedis } from "./redis";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * @returns true se a requisição é permitida
 */
export async function checkApiKeyRateLimit(
  apiKeyId: string,
  max = 120,
  windowSec = 60
): Promise<boolean> {
  const key = `nexa:pubapi:rl:${apiKeyId}`;
  const redis = await getRedis();
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) {
        await redis.expire(key, windowSec);
      }
      return n <= max;
    } catch {
      /* fall through to memory */
    }
  }

  const now = Date.now();
  const b = memoryBuckets.get(apiKeyId);
  if (!b || b.resetAt < now) {
    memoryBuckets.set(apiKeyId, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Test helper */
export function _resetMemoryRateLimitForTests() {
  memoryBuckets.clear();
}
