export type WaChannel = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  config: {
    provider?: string;
    status?: string;
    phone?: string | null;
    qrcode?: string | null;
    qrUpdatedAt?: string | null;
    lastError?: string | null;
    mode?: string;
  };
};

export type StatusResponse = {
  state: string;
  phone?: string | null;
  qrcode?: string | null;
  qrExpiresIn?: number | null;
  provider?: string;
  mode?: string;
  error?: string;
};

export type HumanState =
  | "not_configured"
  | "preparing"
  | "awaiting_qr"
  | "qr_visible"
  | "qr_expired"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "session_lost"
  | "error"
  | "logged_out";

export const HUMAN_LABEL: Record<HumanState, string> = {
  not_configured: "Não configurado",
  preparing: "Preparando conexão",
  awaiting_qr: "Aguardando QR",
  qr_visible: "Escaneie o QR",
  qr_expired: "QR expirado",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
  session_lost: "Sessão perdida",
  error: "Erro",
  logged_out: "Desconectado no celular",
};

export type Diagnostics = {
  diagnostics?: {
    status?: string;
    health?: string;
    connected?: boolean;
    uptimeSeconds?: number | null;
    lastActivityAt?: string | null;
    reconnectCount24h?: number;
    hasPersistedAuth?: boolean;
    lastError?: string | null;
  };
};
