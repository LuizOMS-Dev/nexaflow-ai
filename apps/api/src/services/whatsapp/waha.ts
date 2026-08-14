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
    if (apiKey) h["X-Api-Key"] = apiKey;
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
    const chatId = `${normalizePhone(to)}@c.us`;

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
}
