/**
 * Webhook Meta Cloud API — verificação de assinatura e resolução de canal.
 * Nunca faz fallback para "primeiro canal ativo" (evita injeção cross-tenant).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../../lib/prisma";

export function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Valida header X-Hub-Signature-256 = sha256=<hex>
 * rawBody deve ser o corpo bruto da requisição (bytes).
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | string[] | undefined,
  appSecret: string
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header || !header.startsWith("sha256=")) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret)
      .update(typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)
      .digest("hex");
  return timingSafeEqualString(expected, header);
}

/** Resolve canal WhatsApp ativo pelo phone_number_id (externalId). Sem fallback global. */
export async function resolveWhatsAppChannelByPhoneNumberId(phoneNumberId: string | undefined) {
  if (!phoneNumberId || !phoneNumberId.trim()) return null;
  return prisma.channel.findFirst({
    where: {
      type: "WHATSAPP",
      isActive: true,
      externalId: phoneNumberId.trim(),
    },
  });
}

export type MetaInboundMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
};

export type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaInboundMessage[];
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
      };
    }>;
  }>;
};
