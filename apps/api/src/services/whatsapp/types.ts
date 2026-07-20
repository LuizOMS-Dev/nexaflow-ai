/**
 * Provedores suportados pela abstração WhatsAppConnector.
 * CLOUD_API reservado para migração futura (Meta) — stub sem implementação completa.
 */
export type WhatsAppProvider =
  | "evolution"
  | "waha"
  | "baileys"
  | "simulated"
  | "cloud_api";

export type WhatsAppChannelConfig = {
  provider: WhatsAppProvider;
  baseUrl?: string;
  apiKey?: string;
  instanceName?: string;
  session?: string;
  status?: string;
  phone?: string | null;
  qrcode?: string | null;
  lastError?: string | null;
  riskAcknowledged?: boolean;
  webhookUrl?: string;
  // campos extras livres
  [key: string]: unknown;
};

export type ConnectionStatus = {
  state: "open" | "connecting" | "close" | "unknown" | "logged_out";
  phone?: string | null;
  qrcode?: string | null;
  raw?: unknown;
  health?: string;
};

export type SendTextResult = {
  ok: boolean;
  externalId?: string;
  raw?: unknown;
  error?: string;
};

/**
 * Interface comum de conectores (Baileys hoje; Cloud API no futuro).
 * Inbox/CRM/IA não devem acoplar a APIs específicas do Baileys.
 */
export interface WhatsAppConnector {
  createInstance(config: WhatsAppChannelConfig): Promise<WhatsAppChannelConfig>;
  getStatus(config: WhatsAppChannelConfig): Promise<ConnectionStatus>;
  getQr(config: WhatsAppChannelConfig): Promise<{ qrcode: string | null; state: string }>;
  /** Logout real no WhatsApp (invalida sessão) */
  logout(config: WhatsAppChannelConfig): Promise<void>;
  sendText(config: WhatsAppChannelConfig, to: string, text: string): Promise<SendTextResult>;
  /** Opcional: desliga socket sem logout */
  disconnect?(config: WhatsAppChannelConfig): Promise<void>;
  /** Opcional: força reconexão com credenciais existentes */
  reconnect?(config: WhatsAppChannelConfig): Promise<ConnectionStatus>;
  getHealth?(config: WhatsAppChannelConfig): Promise<{ health: string; detail?: unknown }>;
}

export function asConfig(value: unknown): WhatsAppChannelConfig {
  const c = (value || {}) as WhatsAppChannelConfig;
  return {
    ...c,
    provider: c.provider || "simulated",
  };
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
