/**
 * Autenticação de webhooks WAHA.
 * Oficial: HMAC SHA-512 no header X-Webhook-Hmac (chave configurada na sessão).
 * Também aceita SHA-256 e X-Api-Key (customHeaders do createSession).
 * https://waha.devlike.pro/docs/how-to/events/
 */
import { createHmac } from "crypto";
import { timingSafeEqualString } from "./meta-webhook";

export function headerString(
  headers: Record<string, unknown> | undefined,
  name: string
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return String(v[0] || "");
      return typeof v === "string" ? v : "";
    }
  }
  return "";
}

function hmacHex(algo: "sha512" | "sha256", secret: string, raw: Buffer): string {
  return createHmac(algo, secret).update(raw).digest("hex");
}

function normalizeProvidedHmac(raw: string): { algo: "sha512" | "sha256" | null; hex: string } {
  const v = raw.trim();
  if (!v) return { algo: null, hex: "" };
  const sha512 = v.match(/^sha512=([a-fA-F0-9]+)$/);
  if (sha512) return { algo: "sha512", hex: sha512[1].toLowerCase() };
  const sha256 = v.match(/^sha256=([a-fA-F0-9]+)$/);
  if (sha256) return { algo: "sha256", hex: sha256[1].toLowerCase() };
  if (/^[a-fA-F0-9]{128}$/.test(v)) return { algo: "sha512", hex: v.toLowerCase() };
  if (/^[a-fA-F0-9]{64}$/.test(v)) return { algo: "sha256", hex: v.toLowerCase() };
  return { algo: null, hex: v.toLowerCase() };
}

/** Verifica HMAC do corpo bruto contra um secret. Nunca lança. */
export function verifyWahaHmac(
  rawBody: Buffer | string | undefined,
  providedHeader: string | undefined,
  secret: string,
  algorithmHint?: string
): boolean {
  if (!secret || !providedHeader || rawBody == null) return false;
  const raw = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  if (!raw.length) return false;

  const parsed = normalizeProvidedHmac(providedHeader);
  const hint = (algorithmHint || "").toLowerCase();
  const order: Array<"sha512" | "sha256"> =
    parsed.algo === "sha256" || hint.includes("256")
      ? ["sha256", "sha512"]
      : ["sha512", "sha256"];

  for (const algo of order) {
    const expected = hmacHex(algo, secret, raw);
    if (parsed.hex && timingSafeEqualString(expected, parsed.hex)) return true;
    if (!parsed.hex && timingSafeEqualString(expected, providedHeader)) return true;
  }
  return false;
}

export function extractWahaHmacHeader(headers: Record<string, unknown> | undefined): {
  hmac: string;
  algorithm: string;
} {
  return {
    hmac:
      headerString(headers, "x-webhook-hmac") ||
      headerString(headers, "x-hub-signature-256") ||
      headerString(headers, "x-hmac"),
    algorithm: headerString(headers, "x-webhook-hmac-algorithm"),
  };
}

export function extractProvidedApiKey(headers: Record<string, unknown> | undefined): string {
  return (
    headerString(headers, "x-api-key") ||
    headerString(headers, "apikey") ||
    headerString(headers, "authorization").replace(/^Bearer\s+/i, "")
  );
}

export function apiKeyMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqualString(provided, expected);
}
