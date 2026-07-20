/**
 * IP do cliente atrás de proxy confiável (Docker / EasyPanel / reverse proxy).
 * Fastify já resolve X-Forwarded-For quando trustProxy está configurado.
 * Não confiar em headers se trustProxy = false.
 */

const PRIVATE_RE =
  /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|fc00:|fe80:|::ffff:10\.|::ffff:192\.168\.|::ffff:172\.(1[6-9]|2\d|3[0-1])\.|::ffff:127\.)/i;

export type ClientIpInfo = {
  /** IP reportado por Fastify (já considerando trustProxy) */
  ip: string | null;
  /** client = público; private = rede Docker/proxy; unknown */
  kind: "client" | "private" | "unknown";
  /** Rótulo amigável para UI de auditoria */
  label: string;
};

export function analyzeClientIp(raw: string | undefined | null): ClientIpInfo {
  const ip = (raw || "").trim() || null;
  if (!ip) {
    return { ip: null, kind: "unknown", label: "IP indisponível" };
  }
  if (PRIVATE_RE.test(ip) || ip === "localhost") {
    return {
      ip,
      kind: "private",
      label: "Rede interna / proxy",
    };
  }
  return { ip, kind: "client", label: ip };
}

/** Valor a gravar em audit logs (sempre o IP técnico se existir) */
export function auditIp(request: { ip?: string }): string | undefined {
  const ip = request.ip?.trim();
  return ip || undefined;
}
