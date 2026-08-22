import type {
  ConnectionStatus,
  SendTextResult,
  WhatsAppChannelConfig,
  WhatsAppConnector,
} from "./types";
import { normalizePhone } from "./types";
import { resolveWhatsAppQr } from "./qr";

/**
 * WAHA (WhatsApp HTTP API) — alternativa não oficial.
 * Endpoints comuns: /api/sessions/start, /api/{session}/auth/qr, /api/sendText
 */
export class WahaConnector implements WhatsAppConnector {
  private headers(apiKey?: string) {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const key = (apiKey || "").trim();
    if (key && !/^sha512:/i.test(key)) h["X-Api-Key"] = key;
    return h;
  }

  private base(config: WhatsAppChannelConfig) {
    return (config.baseUrl || "").replace(/\/$/, "");
  }

  private session(config: WhatsAppChannelConfig) {
    return config.session || config.instanceName || "default";
  }

  async createInstance(config: WhatsAppChannelConfig): Promise<WhatsAppChannelConfig> {
    const base = this.base(config);
    const session = this.session(config);

    const res = await fetch(`${base}/api/sessions/start`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        name: session,
        config: {
          webhooks: config.webhookUrl
            ? [
                {
                  url: config.webhookUrl,
                  events: ["message", "session.status"],
                },
              ]
            : [],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (!text.toLowerCase().includes("already") && res.status !== 422) {
        throw new Error(`WAHA start failed (${res.status}): ${text.slice(0, 300)}`);
      }
    }

    return {
      ...config,
      provider: "waha",
      session,
      instanceName: session,
      status: "connecting",
      lastError: null,
    };
  }

  async getStatus(config: WhatsAppChannelConfig): Promise<ConnectionStatus> {
    const base = this.base(config);
    const session = this.session(config);
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(session)}`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) return { state: "unknown" };

    const data = (await res.json()) as { status?: string; me?: { id?: string } };
    const raw = (data.status || "").toUpperCase();
    let state: ConnectionStatus["state"] = "unknown";
    if (raw.includes("WORKING") || raw.includes("AUTH")) state = "open";
    else if (raw.includes("SCAN") || raw.includes("START")) state = "connecting";
    else if (raw.includes("STOP") || raw.includes("FAIL")) state = "close";

    const phone = data.me?.id?.replace("@c.us", "") || config.phone || null;
    return { state, phone, raw: data };
  }

  async getQr(config: WhatsAppChannelConfig): Promise<{ qrcode: string | null; state: string }> {
    const base = this.base(config);
    const session = this.session(config);
    const res = await fetch(`${base}/api/${encodeURIComponent(session)}/auth/qr?format=image`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) {
      const res2 = await fetch(`${base}/api/${encodeURIComponent(session)}/auth/qr`, {
        headers: this.headers(config.apiKey),
      });
      if (!res2.ok) {
        const existing = await resolveWhatsAppQr({ existing: config.qrcode as string });
        return { qrcode: existing.qrcode, state: "unknown" };
      }
      const data = (await res2.json()) as { value?: string; qr?: string };
      const qr = await resolveWhatsAppQr({
        value: data.value,
        qr: data.qr,
        existing: config.qrcode as string,
      });
      const status = await this.getStatus(config);
      return { qrcode: qr.qrcode, state: status.state };
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image")) {
      const buf = Buffer.from(await res.arrayBuffer());
      const qr = await resolveWhatsAppQr({
        base64: buf.toString("base64"),
      });
      const status = await this.getStatus(config);
      return { qrcode: qr.qrcode, state: status.state };
    }

    const data = (await res.json()) as { value?: string };
    const qr = await resolveWhatsAppQr({
      value: data.value,
      existing: config.qrcode as string,
    });
    const status = await this.getStatus(config);
    return { qrcode: qr.qrcode, state: status.state };
  }

  async logout(config: WhatsAppChannelConfig): Promise<void> {
    const base = this.base(config);
    const session = this.session(config);
    await fetch(`${base}/api/sessions/${encodeURIComponent(session)}/stop`, {
      method: "POST",
      headers: this.headers(config.apiKey),
    }).catch(() => null);
  }

  async sendText(config: WhatsAppChannelConfig, to: string, text: string): Promise<SendTextResult> {
    const base = this.base(config);
    const session = this.session(config);
    const { formatWahaDestinationChatId } = await import("./identity-resolver");
    const chatId = formatWahaDestinationChatId(to);

    const res = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        session,
        chatId,
        text,
      }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: JSON.stringify(raw).slice(0, 300), raw };
    }

    return {
      ok: true,
      externalId: (raw as { id?: string }).id,
      raw,
    };
  }

  async sendMedia(
    config: WhatsAppChannelConfig,
    to: string,
    media: {
      kind: "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT" | "FILE";
      mimetype: string;
      filename?: string;
      dataBase64: string;
      caption?: string;
    }
  ): Promise<SendTextResult> {
    const base = this.base(config);
    const session = this.session(config);
    const { formatWahaDestinationChatId } = await import("./identity-resolver");
    const chatId = formatWahaDestinationChatId(to);

    // Normaliza formato data URI
    let cleanBase64 = media.dataBase64 || "";
    if (cleanBase64.startsWith("data:")) {
      cleanBase64 = cleanBase64.replace(/^data:[^;]+;base64,/, "");
    }
    const formattedDataUri = `data:${media.mimetype};base64,${cleanBase64}`;

    let defaultFilename = media.filename || "arquivo";
    if (media.kind === "VOICE" && !defaultFilename.endsWith(".ogg") && !defaultFilename.endsWith(".opus") && !defaultFilename.endsWith(".mp3") && !defaultFilename.endsWith(".webm")) {
      defaultFilename = "voice.ogg";
    }

    const file = {
      url: formattedDataUri,
      data: formattedDataUri,
      mimetype: media.mimetype,
      filename: defaultFilename,
    };

    let endpoint = "/api/sendFile";
    const body: Record<string, unknown> = { session, chatId, file };

    if (media.kind === "IMAGE") {
      endpoint = "/api/sendImage";
      if (media.caption) body.caption = media.caption;
    } else if (media.kind === "VOICE" || media.kind === "AUDIO") {
      endpoint = "/api/sendVoice";
      const inputMime = media.mimetype || "audio/webm";
      file.mimetype = inputMime;
      file.filename = "voice.ogg";
      file.url = `data:${inputMime};base64,${cleanBase64}`;
      file.data = file.url;
      body.convert = true;
    } else if (media.kind === "VIDEO") {
      endpoint = "/api/sendVideo";
      if (media.caption) body.caption = media.caption;
    } else {
      endpoint = "/api/sendFile";
      if (media.caption) body.caption = media.caption;
    }

    let res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);

    // Se /api/sendVoice com convert falhar, tenta sem convert como fallback
    if ((!res || !res.ok) && (media.kind === "VOICE" || media.kind === "AUDIO") && body.convert) {
      console.warn("[waha-media] /api/sendVoice com convert falhou, tentando fallback sem convert...");
      const fallbackBody = { ...body };
      delete fallbackBody.convert;
      res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: this.headers(config.apiKey),
        body: JSON.stringify(fallbackBody),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
    }

    if (!res) {
      console.error("[waha-media] Gateway indisponível", {
        endpoint,
        kind: media.kind,
        mimetype: media.mimetype,
      });
      return { ok: false, error: "Serviço WhatsApp não respondeu ao envio de mídia (timeout ou desconexão)" };
    }

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      let errorMsg = "";
      if (typeof raw.message === "string") {
        errorMsg = raw.message;
      } else if (raw.exception && typeof (raw.exception as { message?: string }).message === "string") {
        errorMsg = (raw.exception as { message: string }).message;
      } else if (typeof raw.error === "string") {
        errorMsg = raw.error;
      } else if (typeof raw.description === "string") {
        errorMsg = raw.description;
      } else {
        errorMsg = "Falha no gateway WhatsApp";
      }

      console.error("[waha-media] Gateway rejeitou mídia", {
        endpoint,
        status: res.status,
        kind: media.kind,
        mimetype: media.mimetype,
        error: errorMsg.slice(0, 300),
      });
      return { ok: false, error: errorMsg, raw };
    }

    const externalId =
      (typeof raw.id === "string" && raw.id) ||
      (typeof (raw.key as { id?: string })?.id === "string" && (raw.key as { id?: string }).id) ||
      (typeof raw._serialized === "string" && raw._serialized) ||
      undefined;

    return {
      ok: true,
      externalId,
      raw,
    };
  }
}
