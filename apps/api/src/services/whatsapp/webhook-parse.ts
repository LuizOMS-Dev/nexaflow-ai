import { wahaStatusToRuntime } from "./waha-client";

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
};

export type ParsedWebhook = {
  messages: ParsedInboundMessage[];
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

  const phone = jidToPhone(from) || String(from).replace(/\D/g, "");
  if (!phone) return null;

  const name =
    (typeof p.pushName === "string" && p.pushName) ||
    (typeof p.notifyName === "string" && p.notifyName) ||
    (typeof p.name === "string" && p.name) ||
    undefined;

  return {
    phone,
    name,
    content: bodyText || (mediaUrl ? "[mídia]" : "[mensagem]"),
    externalId: rawId ? (rawId.startsWith("waha:") ? rawId : `waha:${rawId}`) : undefined,
    fromMe,
    mediaUrl,
    mediaMime,
  };
}

/**
 * WAHA / Evolution / Baileys — message / session.status / messages.upsert
 */
export function parseWahaWebhook(body: unknown): ParsedWebhook {
  const root = asRecord(body) || {};
  const event = String(root.event || root.type || "").toLowerCase();
  const payload = asRecord(root.payload) || asRecord(root.data) || root;

  const result: ParsedWebhook = { messages: [] };

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
