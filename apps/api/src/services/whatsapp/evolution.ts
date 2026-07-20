import type {
  ConnectionStatus,
  SendTextResult,
  WhatsAppChannelConfig,
  WhatsAppConnector,
} from "./types";
import { normalizePhone } from "./types";
import { resolveWhatsAppQr } from "./qr";

/**
 * Evolution API (não oficial) — alternativa à Meta Cloud API.
 */
export class EvolutionConnector implements WhatsAppConnector {
  private headers(apiKey?: string) {
    return {
      "Content-Type": "application/json",
      apikey: apiKey || "",
    };
  }

  private base(config: WhatsAppChannelConfig) {
    return (config.baseUrl || "").replace(/\/$/, "");
  }

  /**
   * Payload de webhook Evolution v2 — headers com apikey são obrigatórios
   * para a API NexaFlow aceitar MESSAGES_UPSERT (sem isso, mensagens morrem no gateway).
   */
  private webhookPayload(webhookUrl: string, apiKey?: string) {
    const key = apiKey || "";
    const events = [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "SEND_MESSAGE",
    ];
    return {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      // Evolution 2.x aliases
      webhookByEvents: false,
      webhookBase64: true,
      events,
      headers: {
        apikey: key,
        "x-api-key": key,
      },
    };
  }

  /** Garante webhook na instância (create + set) — idempotente */
  async ensureWebhook(config: WhatsAppChannelConfig): Promise<void> {
    const base = this.base(config);
    const name = config.instanceName;
    const webhookUrl = config.webhookUrl;
    if (!base || !name || !webhookUrl) return;

    const body = {
      webhook: this.webhookPayload(webhookUrl, config.apiKey),
      // alguns builds usam campos no root
      ...this.webhookPayload(webhookUrl, config.apiKey),
      url: webhookUrl,
      enabled: true,
    };

    // Evolution 2: POST /webhook/set/{instance}
    await this.fetchWithTimeout(
      `${base}/webhook/set/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: this.headers(config.apiKey),
        body: JSON.stringify(body),
      },
      6000
    ).catch((err) => {
      console.warn(
        "[evolution] webhook/set failed:",
        err instanceof Error ? err.message : err
      );
    });
  }

  async createInstance(config: WhatsAppChannelConfig): Promise<WhatsAppChannelConfig> {
    const base = this.base(config);
    const instanceName = config.instanceName || `nexa-${Date.now()}`;
    const webhookUrl = config.webhookUrl;

    const res = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        // evita conflito com sessão antiga no mesmo número
        webhook: webhookUrl
          ? this.webhookPayload(webhookUrl, config.apiKey)
          : undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      // Instância já existe → reusa e reconfigura webhook
      if (
        !text.toLowerCase().includes("already") &&
        !text.toLowerCase().includes("exist") &&
        res.status !== 403 &&
        res.status !== 409
      ) {
        throw new Error(`Evolution create failed (${res.status}): ${text.slice(0, 300)}`);
      }
    }

    const data = (await res.json().catch(() => ({}))) as {
      qrcode?: { base64?: string; code?: string; pairingCode?: string };
      instance?: { instanceName?: string; status?: string };
      base64?: string;
      code?: string;
    };

    const next: WhatsAppChannelConfig = {
      ...config,
      provider: "evolution",
      instanceName,
      status: data.instance?.status || "connecting",
      webhookUrl,
      lastError: null,
    };

    // Força webhook mesmo se create "already exists" não aplicou
    await this.ensureWebhook(next);

    const qr = await resolveWhatsAppQr({
      base64: data.qrcode?.base64 || data.base64,
      code: data.qrcode?.code || data.code,
      pairingCode: data.qrcode?.pairingCode,
    });

    return {
      ...next,
      qrcode: qr.qrcode,
      qrPayload: qr.payload,
      qrSource: qr.source,
      qrUpdatedAt: new Date().toISOString(),
    };
  }

  async getStatus(config: WhatsAppChannelConfig): Promise<ConnectionStatus> {
    const base = this.base(config);
    const name = config.instanceName!;
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(name)}`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) {
      return { state: "unknown", raw: await res.text() };
    }

    const data = (await res.json()) as {
      instance?: { state?: string; owner?: string };
      state?: string;
    };

    const rawState = (data.instance?.state || data.state || "unknown").toLowerCase();
    let state: ConnectionStatus["state"] = "unknown";
    if (rawState.includes("open")) state = "open";
    else if (rawState.includes("connect")) state = "connecting";
    else if (rawState.includes("close")) state = "close";

    return {
      state,
      phone: data.instance?.owner || config.phone || null,
      raw: data,
    };
  }

  async getQr(config: WhatsAppChannelConfig): Promise<{ qrcode: string | null; state: string }> {
    const base = this.base(config);
    const name = config.instanceName!;

    const res = await fetch(`${base}/instance/connect/${encodeURIComponent(name)}`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) {
      const existing = await resolveWhatsAppQr({ existing: config.qrcode as string });
      return { qrcode: existing.qrcode, state: "unknown" };
    }

    const data = (await res.json()) as {
      base64?: string;
      code?: string;
      pairingCode?: string;
      qrcode?: { base64?: string; code?: string };
    };

    const qr = await resolveWhatsAppQr({
      base64: data.base64 || data.qrcode?.base64,
      code: data.code || data.qrcode?.code,
      pairingCode: data.pairingCode,
      existing: config.qrcode as string,
    });

    const status = await this.getStatus(config);
    return { qrcode: qr.qrcode, state: status.state };
  }

  private async fetchWithTimeout(url: string, init: RequestInit, ms = 5000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async logout(config: WhatsAppChannelConfig): Promise<void> {
    const base = this.base(config);
    if (!base || !config.instanceName) return;
    const name = config.instanceName;
    const headers = this.headers(config.apiKey);

    // Timeout curto: não pode travar o botão do painel
    await this.fetchWithTimeout(
      `${base}/instance/logout/${encodeURIComponent(name)}`,
      { method: "DELETE", headers },
      4000
    ).catch(() => null);

    await this.fetchWithTimeout(
      `${base}/instance/delete/${encodeURIComponent(name)}`,
      { method: "DELETE", headers },
      4000
    ).catch(() => null);
  }

  async sendText(config: WhatsAppChannelConfig, to: string, text: string): Promise<SendTextResult> {
    const base = this.base(config);
    const name = config.instanceName!;
    const number = normalizePhone(to);

    const res = await fetch(`${base}/message/sendText/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({ number, text }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof raw === "object" ? JSON.stringify(raw).slice(0, 300) : String(raw),
        raw,
      };
    }

    const externalId =
      (raw as { key?: { id?: string } })?.key?.id ||
      (raw as { messageId?: string })?.messageId;

    return { ok: true, externalId, raw };
  }
}
