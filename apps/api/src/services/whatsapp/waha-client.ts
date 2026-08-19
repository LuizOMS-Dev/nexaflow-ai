/**
 * Cliente HTTP centralizado para WAHA (WhatsApp HTTP API).
 * Toda comunicação NexaFlow → WAHA passa por aqui (sem secrets no browser).
 *
 * Docs oficiais: https://waha.devlike.pro/docs/how-to/sessions/
 * Engine default do stack NexaFlow: NOWEB (multi-sessão, store, QR, mídia).
 */
import { env } from "../../lib/env";

export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED"
  | "PASSKEY_REQUIRED"
  | "PASSKEY_CONFIRMATION_REQUIRED"
  | string;

export type WahaSession = {
  name: string;
  status: WahaSessionStatus;
  me?: { id?: string; pushName?: string } | null;
  engine?: { engine?: string };
  config?: unknown;
};

export type WahaClientOptions = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export class WahaHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, path: string) {
    super(`WAHA ${path} → ${status}: ${body.slice(0, 280)}`);
    this.status = status;
    this.body = body;
  }
}

export class WahaClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(opts: WahaClientOptions) {
    this.baseUrl = (opts.baseUrl || "").replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 25_000;
  }

  static fromEnv(overrides?: Partial<WahaClientOptions>) {
    const hashed = /^sha512:/i.test((env.waGatewayApiKey || "").trim());
    return new WahaClient({
      baseUrl: overrides?.baseUrl || env.waGatewayUrl || "http://waha:3000",
      apiKey: overrides?.apiKey || (hashed ? undefined : env.waGatewayApiKey),
      timeoutMs: overrides?.timeoutMs,
    });
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/json",
      ...(extra || {}),
    };
    const key = (this.apiKey || "").trim();
    if (key && !/^sha512:/i.test(key)) h["X-Api-Key"] = key;
    return h;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    init?: { accept?: string; raw?: boolean }
  ): Promise<{ status: number; data: T; headers: Headers }> {
    if (!this.baseUrl) {
      throw new Error("WAHA baseUrl ausente");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers = this.headers(
        body !== undefined
          ? { "Content-Type": "application/json", Accept: init?.accept || "application/json" }
          : { Accept: init?.accept || "application/json" }
      );
      const res = await fetch(joinUrl(this.baseUrl, path), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (init?.raw) {
        return { status: res.status, data: (await res.arrayBuffer()) as T, headers: res.headers };
      }
      const text = await res.text();
      let data: T;
      try {
        data = (text ? JSON.parse(text) : null) as T;
      } catch {
        data = text as T;
      }
      if (!res.ok) {
        throw new WahaHttpError(res.status, text || res.statusText, path);
      }
      return { status: res.status, data, headers: res.headers };
    } finally {
      clearTimeout(t);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.request("GET", "/ping");
      return r.status >= 200 && r.status < 500;
    } catch {
      try {
        const r = await this.request("GET", "/api/server/status");
        return r.status < 500;
      } catch {
        return false;
      }
    }
  }

  async listSessions(all = true): Promise<WahaSession[]> {
    const q = all ? "?all=true" : "";
    const { data } = await this.request<WahaSession[]>("GET", `/api/sessions${q}`);
    return Array.isArray(data) ? data : [];
  }

  async getSession(name: string): Promise<WahaSession | null> {
    try {
      const { data } = await this.request<WahaSession>(
        "GET",
        `/api/sessions/${encodeURIComponent(name)}`
      );
      return data;
    } catch (e) {
      if (e instanceof WahaHttpError && (e.status === 404 || e.status === 422)) return null;
      throw e;
    }
  }

  async createSession(input: {
    name: string;
    start?: boolean;
    webhooks?: Array<{
      url: string;
      events: string[];
      hmac?: { key: string };
      customHeaders?: Array<{ name: string; value: string }>;
    }>;
    metadata?: Record<string, string>;
    engine?: string;
  }): Promise<WahaSession> {
    const body: Record<string, unknown> = {
      name: input.name,
      start: input.start !== false,
      config: {
        metadata: input.metadata || {},
        webhooks: input.webhooks || [],
        noweb: {
          store: { enabled: true, fullSync: false },
        },
        ignore: {
          status: true,
          groups: false,
          channels: true,
          broadcast: true,
        },
      },
    };
    const { data } = await this.request<WahaSession>("POST", "/api/sessions", body);
    return data;
  }

  async startSession(name: string): Promise<void> {
    try {
      await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/start`, {});
    } catch (e) {
      // idempotente: já rodando
      if (e instanceof WahaHttpError && (e.status === 422 || e.status === 409)) return;
      throw e;
    }
  }

  async stopSession(name: string): Promise<void> {
    try {
      await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/stop`, {});
    } catch (e) {
      if (e instanceof WahaHttpError && e.status === 404) return;
      throw e;
    }
  }

  async restartSession(name: string): Promise<void> {
    await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/restart`, {});
  }

  async logoutSession(name: string): Promise<void> {
    await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/logout`, {});
  }

  async deleteSession(name: string): Promise<void> {
    try {
      await this.request("DELETE", `/api/sessions/${encodeURIComponent(name)}`);
    } catch (e) {
      if (e instanceof WahaHttpError && e.status === 404) return;
      throw e;
    }
  }

  /**
   * QR em data URL (image/png;base64,...) ou null se indisponível.
   * API: GET /api/{session}/auth/qr com Accept: application/json → { mimetype, data }
   */
  async getQrDataUrl(name: string): Promise<string | null> {
    try {
      const { data } = await this.request<{ mimetype?: string; data?: string; value?: string }>(
        "GET",
        `/api/${encodeURIComponent(name)}/auth/qr?format=image`,
        undefined,
        { accept: "application/json" }
      );
      if (data?.data) {
        const mime = data.mimetype || "image/png";
        return `data:${mime};base64,${data.data}`;
      }
      if (data?.value) {
        // raw string — frontend gera QR; devolvemos como text payload especial
        return `raw:${data.value}`;
      }
    } catch {
      /* tenta binary */
    }

    try {
      const { data, headers } = await this.request<ArrayBuffer>(
        "GET",
        `/api/${encodeURIComponent(name)}/auth/qr?format=image`,
        undefined,
        { accept: "image/png", raw: true }
      );
      const buf = Buffer.from(data);
      if (buf.length < 32) return null;
      const ct = headers.get("content-type") || "image/png";
      return `data:${ct};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async sendText(session: string, chatId: string, text: string) {
    const { data } = await this.request<{ id?: string; key?: { id?: string } }>(
      "POST",
      "/api/sendText",
      { session, chatId, text }
    );
    return data;
  }

  async sendImage(
    session: string,
    chatId: string,
    file: { mimetype: string; filename?: string; data: string },
    caption?: string
  ) {
    const { data } = await this.request("POST", "/api/sendImage", {
      session,
      chatId,
      file,
      caption,
    });
    return data;
  }

  async sendFile(
    session: string,
    chatId: string,
    file: { mimetype: string; filename?: string; data: string },
    caption?: string
  ) {
    const { data } = await this.request("POST", "/api/sendFile", {
      session,
      chatId,
      file,
      caption,
    });
    return data;
  }

  async sendVoice(
    session: string,
    chatId: string,
    file: { mimetype: string; data: string }
  ) {
    const { data } = await this.request("POST", "/api/sendVoice", {
      session,
      chatId,
      file,
      convert: true,
    });
    return data;
  }

  async getMe(session: string) {
    try {
      const { data } = await this.request<{ id?: string; pushName?: string } | null>(
        "GET",
        `/api/sessions/${encodeURIComponent(session)}/me`
      );
      return data;
    } catch {
      return null;
    }
  }
}

/** Status WAHA → estado runtime NexaFlow (open | connecting | close | logged_out | unknown) */
export function wahaStatusToRuntime(status?: string | null): {
  state: "open" | "connecting" | "close" | "logged_out" | "unknown";
  needsQr: boolean;
} {
  const s = (status || "").toUpperCase();
  if (s === "WORKING") return { state: "open", needsQr: false };
  if (s === "SCAN_QR_CODE" || s === "PASSKEY_REQUIRED" || s === "PASSKEY_CONFIRMATION_REQUIRED") {
    return { state: "connecting", needsQr: true };
  }
  if (s === "STARTING") return { state: "connecting", needsQr: false };
  if (s === "FAILED") return { state: "close", needsQr: true };
  if (s === "STOPPED") return { state: "close", needsQr: false };
  return { state: "unknown", needsQr: false };
}
