"use client";

import { create } from "zustand";
import { api, setAccessToken, getAccessToken } from "@/lib/api";

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  primaryColor?: string;
  logoUrl?: string | null;
  role?: string;
  plan?: unknown;
  settings?: unknown;
  /** true = empresa já passou pelo cadastro inicial */
  onboardingCompleted?: boolean;
};

export type UserInfo = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  avatarType?: "UPLOAD" | "INITIALS" | "NEXA_AVATAR" | string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
  preferences?: {
    theme?: "light" | "dark" | "system";
    language?: string;
    notifyMentions?: boolean;
    notifyAssigned?: boolean;
    notifySecurity?: boolean;
    /** Tour da plataforma — por usuário (não por empresa) */
    platformTour?: {
      status?: string;
      version?: number;
      offeredAt?: string | null;
      startedAt?: string | null;
      completedAt?: string | null;
      dismissedAt?: string | null;
      lastStep?: string | null;
      dismissReason?: string | null;
      restartedAt?: string | null;
    };
  } | null;
  platformRole?: string | null;
};

/** SUPERADMIN global nunca herda tenant no cliente, exceto sob impersonação explícita. */
function sanitizeTenantForUser(
  user: UserInfo,
  tenant: TenantInfo | null | undefined,
  impersonating?: boolean
): TenantInfo | null {
  if (user.platformRole === "SUPERADMIN" && !impersonating) {
    return null;
  }
  return tenant ?? null;
}

type MembershipEntry = { tenantId: string; role: string; tenant: TenantInfo };

function sanitizeMembershipsForUser(
  user: UserInfo,
  memberships: MembershipEntry[] | undefined,
  impersonating?: boolean
): MembershipEntry[] {
  // SUPERADMIN global: não carrega lista de empresas no seletor
  if (user.platformRole === "SUPERADMIN" && !impersonating) {
    return [];
  }
  return memberships || [];
}

function syncImpersonationFlag(
  active: boolean | undefined,
  platformRole?: string | null,
  tenant?: TenantInfo | null
) {
  try {
    if (active) {
      sessionStorage.setItem("nexaflow_impersonating", "1");
    } else if (platformRole === "SUPERADMIN" && !tenant) {
      sessionStorage.removeItem("nexaflow_impersonating");
    } else if (!active) {
      sessionStorage.removeItem("nexaflow_impersonating");
    }
  } catch {
    /* ignore */
  }
}

type AuthState = {
  /** Access token em memória (espelho do cookie/API) */
  token: string | null;
  user: UserInfo | null;
  tenant: TenantInfo | null;
  memberships: MembershipEntry[];
  hydrated: boolean;
  setSession: (data: {
    token: string;
    user: UserInfo;
    tenant?: TenantInfo | null;
    memberships?: MembershipEntry[];
  }) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  /** SUPERADMIN global: remove tenant residual da UI/sessão cliente */
  clearTenant: () => void;
};

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  tenant: null,
  memberships: [],
  hydrated: false,

  setSession: ({ token, user, tenant, memberships }) => {
    setAccessToken(token);
    let imp = false;
    try {
      imp = sessionStorage.getItem("nexaflow_impersonating") === "1";
    } catch {
      /* ignore */
    }
    set({
      token,
      user,
      tenant: sanitizeTenantForUser(user, tenant, imp),
      memberships: sanitizeMembershipsForUser(
        user,
        memberships !== undefined ? memberships : get().memberships,
        imp
      ),
    });
  },

  hydrate: async () => {
    // limpa legado localStorage
    try {
      localStorage.removeItem("nexaflow_token");
    } catch {
      /* ignore */
    }

    try {
      // Descobre primeiro se há cookie válido sem gerar 401 esperado em páginas públicas.
      if (!getAccessToken()) {
        const status = await api<{ authenticated: boolean; refreshAvailable: boolean }>(
          "/auth/session-status"
        );
        if (!status.authenticated && !status.refreshAvailable) {
          set({ hydrated: true, token: null, user: null, tenant: null, memberships: [] });
          return;
        }
        if (!status.authenticated && status.refreshAvailable) {
          try {
            const refreshed = await api<{ accessToken: string }>("/auth/refresh", {
              method: "POST",
            });
            if (refreshed.accessToken) setAccessToken(refreshed.accessToken);
          } catch {
            set({ hydrated: true, token: null, user: null, tenant: null, memberships: [] });
            return;
          }
        }
      }

      if (!getAccessToken()) {
        // Cookie access válido: /auth/me restaura os dados em memória.
        try {
          const me = await api<{
            user: UserInfo;
            tenant: TenantInfo | null;
            memberships: MembershipEntry[];
            impersonation?: { active?: boolean };
          }>("/auth/me");
          const imp = Boolean(me.impersonation?.active);
          syncImpersonationFlag(imp, me.user.platformRole, me.tenant);
          set({
            token: getAccessToken(),
            user: me.user,
            tenant: sanitizeTenantForUser(me.user, me.tenant, imp),
            memberships: sanitizeMembershipsForUser(me.user, me.memberships, imp),
            hydrated: true,
          });
          return;
        } catch {
          set({ hydrated: true, token: null, user: null, tenant: null, memberships: [] });
          return;
        }
      }

      const me = await api<{
        user: UserInfo;
        tenant: TenantInfo | null;
        memberships: MembershipEntry[];
        impersonation?: { active?: boolean };
      }>("/auth/me");
      const imp = Boolean(me.impersonation?.active);
      syncImpersonationFlag(imp, me.user.platformRole, me.tenant);
      set({
        token: getAccessToken(),
        user: me.user,
        tenant: sanitizeTenantForUser(me.user, me.tenant, imp),
        memberships: sanitizeMembershipsForUser(me.user, me.memberships, imp),
        hydrated: true,
      });
    } catch {
      setAccessToken(null);
      set({ token: null, user: null, tenant: null, memberships: [], hydrated: true });
    }
  },

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    set({ token: null, user: null, tenant: null, memberships: [] });
  },

  switchTenant: async (tenantId: string) => {
    const user = get().user;
    // SUPERADMIN não troca de empresa via switch-tenant — usa impersonação no Admin
    if (user?.platformRole === "SUPERADMIN") {
      throw new Error(
        "Superadministrador acessa empresas pela Administração (Impersonar), não pela troca de empresa."
      );
    }
    const data = await api<{ accessToken?: string; token?: string; tenant: TenantInfo }>(
      "/auth/switch-tenant",
      {
        method: "POST",
        json: { tenantId },
      }
    );
    const tok = data.accessToken || data.token || getAccessToken();
    if (tok) setAccessToken(tok);
    set({ token: tok, tenant: data.tenant ?? null });
  },

  clearTenant: () => {
    try {
      sessionStorage.removeItem("nexaflow_impersonating");
    } catch {
      /* ignore */
    }
    set({ tenant: null });
  },
}));
