/**
 * URL do WebSocket da API NexaFlow.
 * Em Docker o browser fala em localhost:4000 (porta publicada da API).
 */
export function resolveWsUrl(): string {
  const envWs = (process.env.NEXT_PUBLIC_WS_URL || "").trim().replace(/\/$/, "");
  let base: string;

  if (envWs && !/localhost|127\.0\.0\.1/.test(envWs)) {
    base = envWs;
  } else {
    const api = (process.env.NEXT_PUBLIC_API_URL || "").trim();
    if (api.startsWith("http://") || api.startsWith("https://")) {
      base = api.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
    } else if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Produção: wss://<host-da-página>/ws exige o domínio da API (NEXT_PUBLIC_WS_URL).
      // Fallback local: mesma máquina na porta 4000.
      const host = window.location.hostname || "localhost";
      base =
        window.location.protocol === "https:"
          ? `${proto}//${host}/ws`
          : `${proto}//${host}:4000/ws`;
    } else {
      base = "ws://localhost:4000/ws";
    }
  }

  return base;
}

export type RealtimeEvent =
  | "connected"
  | "message.created"
  | "conversation.created"
  | "conversation.updated"
  | "conversation.deleted"
  | "error"
  | string;

export type RealtimeMessage = {
  event: RealtimeEvent;
  payload?: unknown;
  at?: string;
};
