/**
 * Parsers de webhook Evolution API e WAHA → formato interno do NexaFlow.
 */

export type ParsedInboundMessage = {
  phone: string;
  name?: string;
  content: string;
  externalId?: string;
  fromMe: boolean;
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
    return (b && (b.selectedDisplayText || b.selectedButtonId)) as string || "[botão]";
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

function normalizeEventName(event: unknown): string {
  if (typeof event !== "string") return "";
  return event.toLowerCase().replace(/_/g, ".");
}

/**
 * Evolution API (v1/v2) — messages.upsert, connection.update, qrcode.updated
 */
export function parseEvolutionWebhook(body: unknown): ParsedWebhook {
  const root = asRecord(body) || {};
  const event = normalizeEventName(root.event || root.type || root.action);
  const data = root.data ?? root.payload ?? root;

  const result: ParsedWebhook = { messages: [] };

  // QR code
  if (event.includes("qrcode") || dig(data, "qrcode") || dig(root, "qrcode")) {
    const qr =
      (dig(data, "qrcode", "base64") as string) ||
      (dig(data, "base64") as string) ||
      (dig(root, "qrcode", "base64") as string) ||
      (dig(root, "base64") as string) ||
      (typeof dig(data, "qrcode") === "string" ? (dig(data, "qrcode") as string) : null);
    if (qr) result.qrcode = qr;
  }

  // Connection
  if (event.includes("connection") || dig(data, "state") || dig(data, "instance", "state")) {
    const state =
      (dig(data, "state") as string) ||
      (dig(data, "status") as string) ||
      (dig(data, "instance", "state") as string) ||
      (dig(root, "state") as string);
    const phone =
      (dig(data, "instance", "owner") as string) ||
      (dig(data, "owner") as string) ||
      (dig(data, "wuid") as string) ||
      null;
    if (state) {
      result.connection = {
        state: String(state),
        phone: phone ? jidToPhone(phone) || String(phone) : null,
      };
    }
  }

  // Messages — data pode ser 1 msg, array, ou { messages: [] }
  // Evolution 2.x: event "messages.upsert" | "MESSAGES_UPSERT", data = { key, message, pushName }
  const rawList: unknown[] = [];
  if (Array.isArray(data)) {
    rawList.push(...data);
  } else {
    const d = asRecord(data);
    if (d) {
      if (Array.isArray(d.messages)) rawList.push(...d.messages);
      else if (d.key || d.message || d.messageStubType != null) rawList.push(d);
      else if (Array.isArray(d.message)) rawList.push(...(d.message as unknown[]));
      // nested: data.data
      const nested = asRecord(d.data);
      if (nested && (nested.key || nested.message)) rawList.push(nested);
    }
  }

  // Fallback: qualquer evento de mensagem com payload no root
  if (!rawList.length) {
    const looksLikeMsg =
      event.includes("message") ||
      event.includes("messages") ||
      Boolean(asRecord(root)?.key) ||
      Boolean(dig(root, "data", "key"));
    if (looksLikeMsg) {
      const d = asRecord(data) || asRecord(root);
      if (d) rawList.push(d);
    }
  }

  for (const item of rawList) {
    const msg = asRecord(item);
    if (!msg) continue;

    const key = asRecord(msg.key) || asRecord(dig(msg, "key"));
    const fromMe = Boolean(key?.fromMe ?? msg.fromMe);
    const remoteJid = (key?.remoteJid || key?.remoteJidAlt || msg.remoteJid || "") as string;

    // ignora grupos / status / newsletters
    if (
      typeof remoteJid === "string" &&
      (remoteJid.endsWith("@g.us") ||
        remoteJid.includes("status@broadcast") ||
        remoteJid.includes("@newsletter"))
    ) {
      continue;
    }

    const phone = jidToPhone(remoteJid) || jidToPhone(msg.participant);
    if (!phone) continue;

    const content = extractText(msg.message) || extractText(msg) || "";
    if (!content && !fromMe) continue; // reações vazias etc.

    const name =
      (typeof msg.pushName === "string" && msg.pushName) ||
      (typeof dig(msg, "pushName") === "string" ? (dig(msg, "pushName") as string) : undefined) ||
      undefined;

    const externalId =
      (typeof key?.id === "string" && key.id) ||
      (typeof msg.id === "string" && msg.id) ||
      undefined;

    result.messages.push({
      phone,
      name,
      content: content || "[mensagem]",
      externalId,
      fromMe,
    });
  }

  return result;
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
      result.connection = {
        state: status,
        phone: jidToPhone(dig(payload, "me", "id")) || null,
      };
    }
  }

  // message event
  const from =
    (payload.from as string) ||
    (dig(payload, "from") as string) ||
    (dig(payload, "_data", "id", "remote") as string) ||
    "";
  const fromMe = Boolean(payload.fromMe ?? dig(payload, "fromMe"));
  const bodyText =
    (typeof payload.body === "string" && payload.body) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof dig(payload, "message", "text") === "string"
      ? (dig(payload, "message", "text") as string)
      : "") ||
    extractText(payload.message) ||
    "";

  const phone = jidToPhone(from) || String(from).replace(/\D/g, "");
  if (phone && (bodyText || event.includes("message"))) {
    result.messages.push({
      phone,
      name:
        (typeof payload.notifyName === "string" && payload.notifyName) ||
        (typeof payload.pushName === "string" && payload.pushName) ||
        undefined,
      content: bodyText || "[mensagem]",
      externalId:
        (typeof payload.id === "string" && payload.id) ||
        (typeof dig(payload, "id", "_serialized") === "string"
          ? (dig(payload, "id", "_serialized") as string)
          : undefined),
      fromMe,
    });
  }

  return result;
}
