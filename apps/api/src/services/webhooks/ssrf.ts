/**
 * Proteção SSRF para URLs de webhook outbound.
 * Bloqueia localhost, IPs privados, metadata cloud, etc.
 */
import { lookup } from "dns/promises";
import { isIP } from "net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "0.0.0.0",
  // Docker / compose comuns (rede interna)
  "host.docker.internal",
  "gateway.docker.internal",
  "postgres",
  "redis",
  "api",
  "web",
  "nexaflow-api",
  "nexaflow-web",
  "nexaflow-postgres",
  "nexaflow-redis",
  "nexaflow-evolution",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / metadata AWS
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1" || n === "::") return true;
  if (n.startsWith("fc") || n.startsWith("fd")) return true; // ULA
  if (n.startsWith("fe80")) return true; // link-local
  // IPv4-mapped
  if (n.startsWith("::ffff:")) {
    const v4 = n.slice(7);
    if (isIP(v4) === 4) return isPrivateIpv4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const ver = isIP(ip);
  if (ver === 4) return isPrivateIpv4(ip);
  if (ver === 6) return isPrivateIpv6(ip);
  return true;
}

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/** Validação síncrona de formato (sem DNS) */
export function validateWebhookUrlFormat(raw: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  // Bloquear file:, ftp:, gopher:, data:, etc.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Somente HTTP ou HTTPS" };
  }
  // Em produção preferir HTTPS
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return { ok: false, reason: "Em produção, use HTTPS" };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "Host inválido" };
  if (hostLooksLikeMetadata(host) || host === "169.254.169.254") {
    return { ok: false, reason: "Host de metadata não permitido" };
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "Host não permitido" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return { ok: false, reason: "Host de rede local não permitido" };
  }
  if (isIP(host) && isBlockedIp(host)) {
    return { ok: false, reason: "IP privado ou de loopback não permitido" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credenciais na URL não são permitidas" };
  }
  return { ok: true, url };
}

/** Resolve DNS e bloqueia se apontar para IP privado (anti-DNS-rebinding básico) */
function hostLooksLikeMetadata(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "169.254.169.254" || h.includes("metadata");
}

/**
 * Resolve DNS e bloqueia se apontar para IP privado (anti-DNS-rebinding básico).
 * Fetch usa redirect:"error" — redirects automáticos são rejeitados (ver dispatch).
 */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  const fmt = validateWebhookUrlFormat(raw);
  if (!fmt.ok) throw new Error(fmt.reason);
  const host = fmt.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("IP privado ou de loopback não permitido");
    return fmt.url;
  }
  try {
    const results = await lookup(host, { all: true, verbatim: true });
    if (!results.length) throw new Error("Host não resolve");
    for (const r of results) {
      if (isBlockedIp(r.address)) {
        throw new Error("Host resolve para rede privada — bloqueado por segurança");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("bloqueado")) throw err;
    if (err instanceof Error && err.message.includes("não resolve")) throw err;
    if (err instanceof Error && err.message.includes("Host não permitido")) throw err;
    if (err instanceof Error && /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(err.message)) {
      throw new Error("Não foi possível validar o host do webhook");
    }
    throw new Error("Não foi possível validar o host do webhook");
  }
  return fmt.url;
}

/**
 * Política de redirect: o fetch de entrega usa `redirect: "error"`.
 * Assim, um 302 para localhost/metadata nunca é seguido automaticamente.
 */
export const WEBHOOK_FETCH_REDIRECT_MODE = "error" as const;
