import { api } from "@/lib/api";
import type { Diagnostics, StatusResponse, WaChannel } from "./types";

export function listWhatsAppChannels() {
  return api<WaChannel[]>("/whatsapp/channels");
}

export function connectWhatsApp() {
  return api<WaChannel>("/whatsapp/connect", {
    method: "POST",
    json: { name: "WhatsApp", mode: "platform", riskAcknowledged: true },
  });
}

export function channelStatus(id: string, opts?: { refreshQr?: boolean }) {
  const q = opts?.refreshQr ? "?refresh=1" : "";
  return api<StatusResponse>(`/whatsapp/channels/${id}/status${q}`);
}

export function disconnectChannel(id: string) {
  return api(`/whatsapp/channels/${id}/disconnect`, { method: "POST", json: {}, timeoutMs: 15000 });
}

export function logoutChannel(id: string) {
  return api(`/whatsapp/channels/${id}/logout`, { method: "POST", json: {}, timeoutMs: 15000 });
}

export function reconnectChannel(id: string) {
  return api<StatusResponse & WaChannel>(`/whatsapp/channels/${id}/reconnect`, {
    method: "POST",
    json: {},
    timeoutMs: 20000,
  });
}

export function removeChannel(id: string) {
  return api(`/whatsapp/channels/${id}/remove`, { method: "POST", json: {}, timeoutMs: 15000 });
}

export function channelDiagnostics(id: string) {
  return api<Diagnostics>(`/whatsapp/channels/${id}/diagnostics`);
}
