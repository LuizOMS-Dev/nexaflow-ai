import { api } from "@/lib/api";
import type { TenantInfo } from "@/store/auth";

export type GatewayState = {
  maintenance: boolean;
  product: string;
  message: string | null;
};

export type GatewayUser = {
  id: string;
  email: string;
  name: string;
  platformRole?: string | null;
  avatarUrl?: string | null;
};

export type GatewayOk = {
  status: "authenticated" | "challenge";
  challengeId?: string;
  message?: string;
  accessToken?: string;
  user?: GatewayUser;
  tenant?: TenantInfo | null;
  memberships?: Array<{ tenantId: string; role: string; tenant: TenantInfo }>;
  next?: "admin" | "app" | "onboarding";
};

export function fetchGatewayState() {
  return api<GatewayState>("/auth/gateway/state");
}

export function gatewaySignIn(email: string, password: string) {
  return api<GatewayOk>("/auth/gateway/signin", {
    method: "POST",
    json: { email, password },
  });
}

export function gatewayChallenge(challengeId: string, code: string) {
  return api<GatewayOk>("/auth/gateway/challenge", {
    method: "POST",
    json: { challengeId, code },
  });
}

export function gatewayRecover(email: string) {
  return api<{ ok: boolean; message: string }>("/auth/gateway/recover", {
    method: "POST",
    json: { email },
  });
}

export function gatewayRecoverConfirm(token: string, password: string) {
  return api<{ ok: boolean; message: string }>("/auth/gateway/recover/confirm", {
    method: "POST",
    json: { token, password },
  });
}

export function gatewayInvite(token: string, password: string, name?: string) {
  return api<GatewayOk>("/auth/gateway/invite", {
    method: "POST",
    json: { token, password, name },
  });
}
