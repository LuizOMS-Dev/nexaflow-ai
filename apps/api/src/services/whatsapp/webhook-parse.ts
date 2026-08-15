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

/**
 * WAHA — message / session.status
 */
export function parseWahaWebhook(body: unknown): ParsedWebhook {
  const root = asRecord(body) || {};
  const event = String(root.event || root.type || "").toLowerCase();
  const payload = asRecord(root.payload) || asRecord(root.data) || root;

  const result: ParsedWebhook = { messages: [] };

  if (event.includes("session") || event.includes("status") || payload.status) {
    const status = String(payload.status || dig(payload, "session", "status") || "");
    if (status) {
      const runtime = wahaStatusToRuntime(status);
      const meId = dig(payload, "me", "id") || dig(root, "me", "id");
      result.connection = {
        state: runtime.state,
        phone: jidToPhone(meId) || null,
      };
    }
  }

  // message event
  const from =
    (payload.from as string) ||
    (dig(payload, "from") as string) ||
    (dig(payload, "_data", "id", "remote") as string) ||
    "";
  if (typeof from === "string" && from.endsWith("@g.us")) {
    return result;
  }
  const fromMe = Boolean(payload.fromMe ?? dig(payload, "fromMe"));
  const bodyText =
    (typeof payload.body === "string" && payload.body) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof dig(payload, "message", "text") === "string"
      ? (dig(payload, "message", "text") as string)
      : "") ||
    extractText(payload.message) ||
    "";

  const media = asRecord(payload.media);
  const mediaUrl = media && typeof media.url === "string" ? media.url : undefined;
  const mediaMime = media && typeof media.mimetype === "string" ? media.mimetype : undefined;
  const rawId =
    (typeof payload.id === "string" && payload.id) ||
    (typeof dig(payload, "id", "_serialized") === "string"
      ? (dig(payload, "id", "_serialized") as string)
      : undefined);

  const phone = jidToPhone(from) || String(from).replace(/\D/g, "");
  if (phone && (bodyText || event.includes("message") || mediaUrl)) {
    result.messages.push({
      phone,
      name:
        (typeof payload.notifyName === "string" && payload.notifyName) ||
        (typeof payload.pushName === "string" && payload.pushName) ||
        undefined,
      content: bodyText || "[mensagem]",
      externalId: rawId ? `waha:${rawId}` : undefined,
      fromMe,
      mediaUrl,
      mediaMime,
    });
  }

  return result;
}
