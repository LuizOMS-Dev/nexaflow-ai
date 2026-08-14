/**
 * Sanitização central de logs / metadata para Superadmin e armazenamento.
 * Nunca vazar secrets, JWT, chaves, URLs com senha, etc.
 */

const SECRET_KEY =
  /password|passwd|pwd|passwordhash|secret|token|refresh|authorization|cookie|bearer|apikey|api_key|webhook.?secret|totp|mfa|backup.?code|private.?key|connection.?string|database.?url|redis.?url|jwt/i;

const SECRET_VALUE =
  /\b(sk|pk|nxf)[-_][a-zA-Z0-9]{8,}\b|Bearer\s+[A-Za-z0-9._~+/=-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi;

export function maskApiKeyPrefix(prefix: string | null | undefined): string {
  if (!prefix) return "—";
  const p = String(prefix);
  if (p.length <= 8) return `${p.slice(0, 4)}****`;
  return `${p.slice(0, 12)}********${p.slice(-4)}`;
}

export function redactString(input: string, maxLen = 800): string {
  let s = input.replace(SECRET_VALUE, "[redacted]");
  s = s.replace(
    /(?:postgres|postgresql|redis|rediss|mysql|mongodb):\/\/[^\s"']+/gi,
    "[redacted-url]"
  );
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

export function redactMetadata(
  meta: unknown,
  depth = 0
): Record<string, unknown> | unknown[] | string | number | boolean | null {
  if (meta == null) return null;
  if (depth > 6) return "[truncated]";
  if (typeof meta === "string") return redactString(meta, 400);
  if (typeof meta === "number" || typeof meta === "boolean") return meta;
  if (Array.isArray(meta)) {
    return meta.slice(0, 40).map((x) => redactMetadata(x, depth + 1));
  }
  if (typeof meta === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) {
        out[k] = "[omitido]";
        continue;
      }
      out[k] = redactMetadata(v, depth + 1);
    }
    return out;
  }
  return String(meta);
}

export function isVersionFormat(version: string): boolean {
  return /^\d+\.\d+\.\d+([.-][a-zA-Z0-9.]+)?$/.test(version.trim());
}
