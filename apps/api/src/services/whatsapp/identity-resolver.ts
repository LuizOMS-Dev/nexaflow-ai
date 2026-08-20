import { prisma } from "../../lib/prisma";
import {
  cleanJid as baseCleanJid,
  formatDisplayPhone,
  normalizePhone,
  phoneLookupVariants,
  resolveContactNameWithPriority,
} from "../../lib/contact-fields";
import { asInputJson } from "../../lib/json";

export type WhatsAppJidType = "LID" | "PHONE_JID" | "GROUP" | "BROADCAST" | "UNKNOWN";

export function detectJidType(jid?: string | null): WhatsAppJidType {
  if (!jid || typeof jid !== "string") return "UNKNOWN";
  const trimmed = jid.trim();
  if (trimmed.endsWith("@lid")) return "LID";
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@s.whatsapp.net")) return "PHONE_JID";
  if (trimmed.endsWith("@g.us")) return "GROUP";
  if (trimmed.includes("broadcast") || trimmed.includes("newsletter") || trimmed.includes("status@")) {
    return "BROADCAST";
  }
  return "UNKNOWN";
}

export function isLid(jid?: string | null): boolean {
  return detectJidType(jid) === "LID";
}

export function isPhoneJid(jid?: string | null): boolean {
  return detectJidType(jid) === "PHONE_JID";
}

export function isGroupJid(jid?: string | null): boolean {
  return detectJidType(jid) === "GROUP";
}

/**
 * Extrai dígitos de telefone APENAS se o JID for um Phone JID legítimo (@c.us ou @s.whatsapp.net).
 * NUNCA extrai dígitos de um @lid como se fosse número de telefone!
 */
export function extractPhoneDigitsFromJid(jid?: string | null): string | null {
  if (!jid || typeof jid !== "string") return null;
  const trimmed = jid.trim();
  if (isLid(trimmed) || isGroupJid(trimmed)) return null;

  const base = trimmed.split("@")[0] || "";
  const digits = base.split(":")[0].replace(/\D/g, "");
  return normalizePhone(digits);
}

/**
 * Extrai identificador LID (ex.: 12345678901234@lid -> 12345678901234@lid)
 */
export function extractLid(jid?: string | null): string | null {
  if (!jid || typeof jid !== "string") return null;
  const trimmed = jid.trim();
  if (!isLid(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Resolve o chatId definitivo para envio pelo WAHA (/api/sendText).
 * - Se for @lid: preserva @lid exatamente.
 * - Se for @c.us: preserva @c.us.
 * - Se for @s.whatsapp.net: converte para @c.us mantendo os dígitos.
 * - Se for telefone puro: formata @c.us.
 */
export function formatWahaDestinationChatId(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  if (isLid(trimmed)) {
    return trimmed;
  }
  if (trimmed.endsWith("@c.us")) {
    return trimmed;
  }
  if (trimmed.endsWith("@s.whatsapp.net")) {
    const digits = trimmed.split("@")[0].split(":")[0].replace(/\D/g, "");
    return `${digits}@c.us`;
  }

  // Telefone puro / formatado
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${digits}@c.us` : trimmed;
}

export type WhatsAppIdentityInput = {
  tenantId: string;
  chatId?: string | null;
  from?: string | null;
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  addressingMode?: string | null;
  pushName?: string | null;
  phone?: string | null;
  rawPayload?: Record<string, unknown>;
};

export type ResolvedWhatsAppIdentity = {
  contactId: string;
  contactName: string;
  phoneNormalized: string | null;
  displayPhone: string;
  deliveryChatId: string;
  wahaLid: string | null;
  contactWasCreated: boolean;
};

/**
 * Motor central de resolução de identidade, deduplicação e roteamento WhatsApp.
 */
export async function resolveWhatsAppIdentity(
  input: WhatsAppIdentityInput
): Promise<ResolvedWhatsAppIdentity> {
  const { tenantId } = input;

  // 1. Extração estruturada de identificadores
  const rawChatId = (input.chatId || input.remoteJid || input.from || "").trim();
  const rawAlt = (input.remoteJidAlt || "").trim();

  const lidFound =
    extractLid(rawChatId) ||
    extractLid(input.from) ||
    extractLid(input.remoteJid) ||
    extractLid(rawAlt);

  // Telefone pode vir de: input.phone, remoteJidAlt, ou do próprio remoteJid/from (se for phone JID)
  const phoneFromAlt = extractPhoneDigitsFromJid(rawAlt);
  const phoneFromChat = extractPhoneDigitsFromJid(rawChatId);
  const phoneFromFrom = extractPhoneDigitsFromJid(input.from);
  const phoneFromDirect = input.phone ? normalizePhone(input.phone) : null;

  const canonicalPhone =
    phoneFromDirect || phoneFromAlt || phoneFromChat || phoneFromFrom || null;

  // Destino WAHA prioritário: se temos um chatId ativo no webhook, preservamos ele
  const deliveryChatId = rawChatId ? formatWahaDestinationChatId(rawChatId) : (canonicalPhone ? `${canonicalPhone}@c.us` : "");

  // 2. Busca de contato existente por múltiplos canais (Telefone ou LID em customData)
  const orClauses: Array<Record<string, unknown>> = [];

  if (canonicalPhone) {
    const variants = phoneLookupVariants(canonicalPhone);
    if (variants.length) orClauses.push({ phone: { in: variants } });
    if (canonicalPhone.length >= 10) {
      orClauses.push({ phone: { contains: canonicalPhone.slice(-11) } });
    }
  }

  let contact = orClauses.length
    ? await prisma.contact.findFirst({
        where: { tenantId, OR: orClauses },
      })
    : null;

  // Se não achou por telefone mas tem LID, busca no customData.whatsappAliases
  if (!contact && lidFound) {
    const contactsWithCustomData = await prisma.contact.findMany({
      where: { tenantId, customData: { not: null as unknown as undefined } },
      select: { id: true, name: true, phone: true, customData: true },
      take: 100,
    });

    for (const c of contactsWithCustomData) {
      const cd = (c.customData || {}) as Record<string, unknown>;
      if (
        cd.wahaLid === lidFound ||
        cd.wahaChatId === lidFound ||
        (Array.isArray(cd.whatsappAliases) && cd.whatsappAliases.includes(lidFound))
      ) {
        contact = c as unknown as typeof contact;
        break;
      }
    }
  }

  const contactWasCreated = !contact;

  // 3. Resolução de nome com prioridade estrita
  const initialName = resolveContactNameWithPriority({
    currentName: contact?.name || null,
    pushName: input.pushName || null,
    phone: canonicalPhone || lidFound || "Cliente",
  });

  // 4. Preparação de metadata de aliases
  const currentCustomData = (contact?.customData || {}) as Record<string, unknown>;
  const currentAliases = new Set<string>(
    Array.isArray(currentCustomData.whatsappAliases)
      ? (currentCustomData.whatsappAliases as string[])
      : []
  );

  if (lidFound) currentAliases.add(lidFound);
  if (canonicalPhone) currentAliases.add(canonicalPhone);
  if (rawChatId) currentAliases.add(rawChatId);

  const updatedCustomData = {
    ...currentCustomData,
    wahaChatId: deliveryChatId,
    ...(lidFound ? { wahaLid: lidFound } : {}),
    ...(canonicalPhone ? { phoneJid: `${canonicalPhone}@c.us` } : {}),
    whatsappAliases: Array.from(currentAliases),
    lastAddressingMode: input.addressingMode || (lidFound ? "lid" : "pn"),
    lastIdentifiedAt: new Date().toISOString(),
  };

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        tenantId,
        name: initialName,
        phone: canonicalPhone || null,
        source: "whatsapp",
        consentWhatsapp: true,
        lastInteractionAt: new Date(),
        customData: asInputJson(updatedCustomData),
      },
    });
  } else {
    const updatedName = resolveContactNameWithPriority({
      currentName: contact.name,
      pushName: input.pushName || null,
      phone: canonicalPhone || contact.phone || lidFound || "Cliente",
    });

    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        lastInteractionAt: new Date(),
        ...(contact.stage === "archived" ? { stage: null } : {}),
        ...(canonicalPhone && contact.phone !== canonicalPhone ? { phone: canonicalPhone } : {}),
        ...(updatedName && updatedName !== contact.name ? { name: updatedName } : {}),
        customData: asInputJson(updatedCustomData),
      },
    });
  }

  return {
    contactId: contact.id,
    contactName: contact.name,
    phoneNormalized: contact.phone || canonicalPhone,
    displayPhone: contact.phone ? formatDisplayPhone(contact.phone) : (canonicalPhone ? formatDisplayPhone(canonicalPhone) : ""),
    deliveryChatId,
    wahaLid: lidFound,
    contactWasCreated,
  };
}
