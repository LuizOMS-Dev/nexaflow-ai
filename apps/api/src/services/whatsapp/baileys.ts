import type {
  ConnectionStatus,
  SendTextResult,
  WhatsAppChannelConfig,
  WhatsAppConnector,
} from "./types";
import {
  getBaileysSession,
  getSessionDiagnostics,
  sendBaileysText,
  startBaileysSession,
  stopBaileysSession,
} from "./baileys-manager";

/**
 * Conector nativo Baileys — roda DENTRO da API NexaFlow.
 * Clientes só escaneiam QR. Sem Docker, sem Evolution, sem Meta.
 */
export class BaileysConnector implements WhatsAppConnector {
  async createInstance(config: WhatsAppChannelConfig): Promise<WhatsAppChannelConfig> {
    const instanceName = config.instanceName || `nf-${Date.now()}`;
    const state = await startBaileysSession(instanceName);
    return {
      ...config,
      provider: "baileys" as any,
      instanceName,
      session: instanceName,
      status: state.status === "logged_out" ? "close" : state.status,
      qrcode: state.qrcode,
      phone: state.phone,
      lastError: state.lastError,
      mode: config.mode || "platform",
    };
  }

  async getStatus(config: WhatsAppChannelConfig): Promise<ConnectionStatus> {
    const name = config.instanceName || config.session || "";
    let state = getBaileysSession(name);
    if (!state) {
      try {
        state = await startBaileysSession(name);
      } catch {
        return { state: "close", phone: null };
      }
    }
    if (state.status === "logged_out") {
      return { state: "logged_out", phone: state.phone, health: state.health };
    }
    return {
      state:
        state.status === "open"
          ? "open"
          : state.status === "connecting"
            ? "connecting"
            : "close",
      phone: state.phone,
      qrcode: state.qrcode,
      health: state.health,
    };
  }

  async getQr(config: WhatsAppChannelConfig): Promise<{ qrcode: string | null; state: string }> {
    const name = config.instanceName || config.session || "";
    let state = getBaileysSession(name);
    if (!state || (state.status !== "open" && !state.qrcode && state.status !== "logged_out")) {
      state = await startBaileysSession(name);
    }
    for (let i = 0; i < 20 && !state.qrcode && state.status !== "open"; i++) {
      await new Promise((r) => setTimeout(r, 250));
      state = getBaileysSession(name) || state;
    }
    return {
      qrcode: state.qrcode,
      state: state.status,
    };
  }

  async logout(config: WhatsAppChannelConfig): Promise<void> {
    const name = config.instanceName || config.session || "";
    await stopBaileysSession(name, true);
  }

  async disconnect(config: WhatsAppChannelConfig): Promise<void> {
    const name = config.instanceName || config.session || "";
    // socket down, creds preservadas
    await stopBaileysSession(name, false);
  }

  async reconnect(config: WhatsAppChannelConfig): Promise<ConnectionStatus> {
    const name = config.instanceName || config.session || "";
    await stopBaileysSession(name, false);
    const state = await startBaileysSession(name);
    return this.getStatus({ ...config, instanceName: name });
  }

  async getHealth(config: WhatsAppChannelConfig) {
    const name = config.instanceName || config.session || "";
    const d = getSessionDiagnostics(name);
    return { health: d.health, detail: d };
  }

  async sendText(config: WhatsAppChannelConfig, to: string, text: string): Promise<SendTextResult> {
    const name = config.instanceName || config.session || "";
    return sendBaileysText(name, to, text);
  }
}
