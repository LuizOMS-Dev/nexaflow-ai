import { wahaStatusToRuntime } from "./waha-client";
import { isValidPersonName } from "../../lib/contact-fields";

/**
 * Parser de webhook WAHA → formato interno do NexaFlow.
 */

export type ParsedInboundMessage = {
  phone: string;
  name?: string;
  content: string;
  externalId?: string;
  fromMe: boolean;
  mediaUrl?: string;
  mediaMime?: string;
  chatId?: string;
  from?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  addressingMode?: string;
};

export type ParsedAckEvent = {
  externalId: string;
  ack: number;
  ackName?: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  error?: string;
};

export type ParsedWebhook = {
  messages: ParsedInboundMessage[];
  acks?: ParsedAckEvent[];
  qrcode?: string | null;
  connection?: { state?: string; phone?: string | null };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    const r = asRecord(cur);
    if (!r) return undefined;
    cur = r[k];
  }
  return cur;
}

function jidToPhone(jid: unknown): string {
  if (!jid || typeof jid !== "string") return "";
  // 5511999999999@s.whatsapp.net | 5511999999999:xx@lid | status@broadcast
  const base = jid.split("@")[0] || "";
  const digits = base.split(":")[0].replace(/\D/g, "");
  return digits;
}

function extractText(message: unknown): string {
  const m = asRecord(message);
  if (!m) return "";

  if (typeof m.conversation === "string" && m.conversation.trim()) return m.conversation.trim();

  const ext = asRecord(m.extendedTextMessage);
  if (ext && typeof ext.text === "string") return ext.text.trim();

  const img = asRecord(m.imageMessage);
  if (img) {
    const cap = typeof img.caption === "string" ? img.caption.trim() : "";
    return cap || "[imagem]";
  }

  const vid = asRecord(m.videoMessage);
  if (vid) {
    const cap = typeof vid.caption === "string" ? vid.caption.trim() : "";
    return cap || "[vídeo]";
  }

  if (m.audioMessage || m.pttMessage) return "[áudio]";
  if (m.stickerMessage) return "[sticker]";
  if (m.documentMessage || m.documentWithCaptionMessage) {
    const doc =
      asRecord(m.documentMessage) ||
      asRecord(dig(m.documentWithCaptionMessage, "message", "documentMessage"));
    const name = doc && typeof doc.fileName === "string" ? doc.fileName : "arquivo";
    const cap = doc && typeof doc.caption === "string" ? doc.caption : "";
    return cap ? `[documento: ${name}] ${cap}` : `[documento: ${name}]`;
  }
  if (m.contactMessage) return "[contato]";
  if (m.locationMessage || m.liveLocationMessage) return "[localização]";
  if (m.buttonsResponseMessage) {
    const b = asRecord(m.buttonsResponseMessage);
    return ((b && (b.selectedDisplayText || b.selectedButtonId)) as string) || "[botão]";
  }
  if (m.listResponseMessage) {
    const l = asRecord(m.listResponseMessage);
    const title = dig(l, "singleSelectReply", "selectedRowId") || dig(l, "title");
    return typeof title === "string" ? title : "[lista]";
  }
  if (m.reactionMessage) return "";

  // fallback: template / ephemeral wrapper
  const ephemeral = dig(m, "ephemeralMessage", "message");
  if (ephemeral) return extractText(ephemeral);
  const viewOnce = dig(m, "viewOnceMessage", "message") || dig(m, "viewOnceMessageV2", "message");
  if (viewOnce) return extractText(viewOnce);

  return "";
}

function parseSingleMessage(item: unknown): ParsedInboundMessage | null {
  const p = asRecord(item);
  if (!p) return null;

  const key = asRecord(p.key) || asRecord(dig(p, "_data", "key")) || asRecord(p);
  const from =
    (typeof p.from === "string" && p.from) ||
    (typeof key?.remoteJid === "string" && key.remoteJid) ||
    (typeof p.remoteJid === "string" && p.remoteJid) ||
    (typeof p.sender === "string" && p.sender) ||
    (typeof p.phone === "string" && p.phone) ||
    (typeof dig(p, "_data", "id", "remote") === "string" ? (dig(p, "_data", "id", "remote") as string) : "") ||
    "";

  if (
    typeof from === "string" &&
    (from.endsWith("@g.us") ||
      from.includes("broadcast") ||
      from.includes("newsletter") ||
      from.includes("status@"))
  ) {
    return null;
  }

  const fromMe = Boolean(
    p.fromMe ??
    key?.fromMe ??
    dig(p, "_data", "key", "fromMe") ??
    dig(p, "key", "fromMe")
  );

  const to =
    (typeof p.to === "string" && p.to) ||
    (typeof dig(p, "_data", "to") === "string" ? (dig(p, "_data", "to") as string) : "") ||
    (typeof dig(p, "to") === "string" ? (dig(p, "to") as string) : "") ||
    "";

  const targetJid: string = fromMe
    ? ((typeof key?.remoteJid === "string" && key.remoteJid) ||
       to ||
       (typeof p.chatId === "string" && p.chatId) ||
       (typeof p.remoteJid === "string" && p.remoteJid) ||
       from ||
       "")
    : (from ||
       (typeof key?.remoteJid === "string" && key.remoteJid) ||
       (typeof p.chatId === "string" && p.chatId) ||
       "");

  const rawMsg =
    asRecord(p.message) ||
    asRecord(dig(p, "data", "message")) ||
    asRecord(dig(p, "_data", "message")) ||
    p;

  const bodyText =
    (typeof p.body === "string" && p.body) ||
    (typeof p.text === "string" && p.text) ||
    (typeof p.content === "string" && p.content) ||
    (typeof rawMsg?.conversation === "string" && rawMsg.conversation) ||
    extractText(rawMsg) ||
    "";

  const media =
    asRecord(p.media) ||
    asRecord(dig(p, "message", "imageMessage")) ||
    asRecord(dig(p, "message", "documentMessage")) ||
    asRecord(dig(p, "message", "audioMessage")) ||
    asRecord(dig(p, "message", "videoMessage"));

  const mediaUrl =
    media && typeof media.url === "string"
      ? media.url
      : typeof p.mediaUrl === "string"
        ? p.mediaUrl
        : undefined;

  const mediaMime =
    media && typeof media.mimetype === "string"
      ? media.mimetype
      : typeof p.mimetype === "string"
        ? p.mimetype
        : undefined;

  const rawId =
    (typeof p.id === "string" && p.id) ||
    (typeof key?.id === "string" && key.id) ||
    (typeof dig(p, "id", "_serialized") === "string"
      ? (dig(p, "id", "_serialized") as string)
      : undefined);

  const chatId: string =
    (typeof p.chatId === "string" && p.chatId) ||
    (typeof dig(p, "_data", "id", "remote") === "string"
      ? (dig(p, "_data", "id", "remote") as string)
      : "") ||
    targetJid ||
    from ||
    "";

  const remoteJid: string =
    (typeof key?.remoteJid === "string" && key.remoteJid) ||
    (typeof p.remoteJid === "string" && p.remoteJid) ||
    targetJid ||
    from ||
    "";

  const remoteJidAlt =
    (typeof key?.remoteJidAlt === "string" && key.remoteJidAlt) ||
    (typeof dig(p, "_data", "key", "remoteJidAlt") === "string"
      ? (dig(p, "_data", "key", "remoteJidAlt") as string)
      : undefined) ||
    (typeof p.remoteJidAlt === "string" && p.remoteJidAlt) ||
    (typeof dig(p, "_data", "remoteJidAlt") === "string"
      ? (dig(p, "_data", "remoteJidAlt") as string)
      : undefined);

  const addressingMode =
    (typeof key?.addressingMode === "string" && key.addressingMode) ||
    (typeof dig(p, "_data", "key", "addressingMode") === "string"
      ? (dig(p, "_data", "key", "addressingMode") as string)
      : undefined) ||
    (typeof p.addressingMode === "string" && p.addressingMode) ||
    undefined;

  const phone =
    jidToPhone(remoteJidAlt) ||
    jidToPhone(targetJid) ||
    jidToPhone(remoteJid) ||
    jidToPhone(chatId) ||
    jidToPhone(from) ||
    String(targetJid).replace(/\D/g, "");
  if (!phone && !chatId) return null;

  const rawName =
    (typeof p.pushName === "string" && p.pushName) ||
    (typeof p.notifyName === "string" && p.notifyName) ||
    (typeof dig(p, "_data", "notifyName") === "string" && (dig(p, "_data", "notifyName") as string)) ||
    (typeof dig(p, "_data", "pushName") === "string" && (dig(p, "_data", "pushName") as string)) ||
    (typeof dig(p, "_data", "name") === "string" && (dig(p, "_data", "name") as string)) ||
    (typeof dig(p, "_data", "verifiedName") === "string" && (dig(p, "_data", "verifiedName") as string)) ||
    (typeof dig(p, "sender", "pushName") === "string" && (dig(p, "sender", "pushName") as string)) ||
    (typeof dig(p, "sender", "name") === "string" && (dig(p, "sender", "name") as string)) ||
    (typeof dig(p, "data", "pushName") === "string" && (dig(p, "data", "pushName") as string)) ||
    (typeof p.name === "string" && p.name) ||
    (typeof p.verifiedName === "string" && p.verifiedName) ||
    undefined;

  let name: string | undefined = undefined;
  if (rawName && typeof rawName === "string") {
    const cleaned = rawName.replace(/@(c\.us|s\.whatsapp\.net|g\.us|broadcast|lid)$/i, "").trim();
    if (isValidPersonName(cleaned)) {
      name = cleaned.slice(0, 200);
    }
  }

  return {
    phone: phone || chatId,
    name,
    content: bodyText || (mediaUrl ? "[mídia]" : "[mensagem]"),
    externalId: rawId ? (rawId.startsWith("waha:") ? rawId : `waha:${rawId}`) : undefined,
    fromMe,
    mediaUrl,
    mediaMime,
    chatId,
    from,
    remoteJid,
    remoteJidAlt,
    addressingMode,
  };
}

function parseAck(body: Record<string, unknown>, event: string): ParsedAckEvent | null {
  if (!event.includes("ack") && body.ack === undefined && body.ackName === undefined) {
    return null;
  }

  const payload = asRecord(body.payload) || asRecord(body.data) || body;
  const key = asRecord(payload.key) || payload;
  const rawId =
    (typeof payload.id === "string" && payload.id) ||
    (typeof key.id === "string" && key.id) ||
    (typeof payload.messageId === "string" && payload.messageId);

  if (!rawId) return null;

  const externalId = rawId.startsWith("waha:") ? rawId : `waha:${rawId}`;
  const ackVal = payload.ack !== undefined ? Number(payload.ack) : undefined;
  const ackName = typeof payload.ackName === "string" ? payload.ackName.toUpperCase() : "";

  let status: ParsedAckEvent["status"] = "SENT";
  if (ackVal === 3 || ackName === "READ" || ackName === "PLAYED") {
    status = "READ";
  } else if (ackVal === 2 || ackName === "DELIVERY_ACK" || ackName === "RECEIVED") {
    status = "DELIVERED";
  } else if (ackVal === 1 || ackName === "SERVER_ACK" || ackName === "SENT") {
    status = "SENT";
  } else if (ackVal === -1 || ackName === "ERROR" || payload.isSendFailure === true) {
    status = "FAILED";
  }

  return {
    externalId,
    ack: ackVal ?? 0,
    ackName: ackName || undefined,
    status,
    error: status === "FAILED" ? (payload.error as string) || "Erro reportado pelo WhatsApp" : undefined,
  };
}

/**
 * WAHA / Evolution / Baileys — message / session.status / messages.upsert / message.ack
 */
export function parseWahaWebhook(body: unknown): ParsedWebhook {
  const root = asRecord(body) || {};
  const event = String(root.event || root.type || "").toLowerCase();
  const payload = asRecord(root.payload) || asRecord(root.data) || root;

  const result: ParsedWebhook = { messages: [] };

  // ACK events
  const ack = parseAck(root, event) || parseAck(payload, event);
  if (ack) {
    result.acks = [ack];
  }

  // Status / Conexão
  if (
    event.includes("session") ||
    event.includes("status") ||
    event.includes("connection") ||
    payload.status ||
    payload.state
  ) {
    const status = String(
      payload.status ||
      payload.state ||
      dig(payload, "session", "status") ||
      dig(payload, "connection", "state") ||
      ""
    );
    if (status) {
      const runtime = wahaStatusToRuntime(status);
      const meId =
        dig(payload, "me", "id") ||
        dig(root, "me", "id") ||
        dig(payload, "user", "id");
      result.connection = {
        state: runtime.state,
        phone: jidToPhone(meId) || null,
      };
    }
  }

  // QR Code
  const qr =
    (typeof payload.qrcode === "string" && payload.qrcode) ||
    (typeof root.qrcode === "string" && root.qrcode) ||
    (typeof payload.qr === "string" && payload.qr) ||
    (typeof dig(payload, "qrcode", "base64") === "string"
      ? (dig(payload, "qrcode", "base64") as string)
      : null);
  if (qr) {
    result.qrcode = qr;
  }

  // Mensagens em lote/array
  const candidateLists = [
    Array.isArray(payload.messages) ? payload.messages : null,
    Array.isArray(root.messages) ? root.messages : null,
    Array.isArray(dig(payload, "data", "messages"))
      ? (dig(payload, "data", "messages") as unknown[])
      : null,
    Array.isArray(dig(root, "data", "messages"))
      ? (dig(root, "data", "messages") as unknown[])
      : null,
  ];

  let foundArray = false;
  for (const list of candidateLists) {
    if (list && list.length > 0) {
      foundArray = true;
      for (const item of list) {
        const parsed = parseSingleMessage(item);
        if (parsed) result.messages.push(parsed);
      }
      break;
    }
  }

  // Mensagem única
  if (!foundArray) {
    const single = parseSingleMessage(payload) || parseSingleMessage(root);
    if (single) {
      result.messages.push(single);
    }
  }

  return result;
}
