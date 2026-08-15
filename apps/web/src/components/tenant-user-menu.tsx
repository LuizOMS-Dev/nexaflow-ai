"use client";

import type { Ref } from "react";
import {
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldAlert,
  Sun,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TenantUserMenuUser = {
  name: string;
  email?: string | null;
  roleBadge?: string | null;
  showRoleBadge?: boolean;
  avatarUrl?: string | null;
  avatarType?: string | null;
  avatarPresetId?: string | null;
  avatarColor?: string | null;
};

/**
 * Menu suspenso de conta (Área do Tenant).
 * Design Linear/Stripe: Topo com identidade completa (Nome, E-mail, Cargo),
 * Ações diretas, Segmented control de Tema (Claro/Escuro/Sistema) e Sair destacado.
 */
export function TenantUserMenu({
  user,
  floating,
  maxHeight,
  impersonating,
  theme = "system",
  onSetTheme,
  onAccount,
  onPreferences,
  onLogout,
  onEndImpersonation,
  panelRef,
  className,
}: {
  user: TenantUserMenuUser;
  dark?: boolean;
  floating?: boolean;
  maxHeight?: number;
  impersonating?: boolean;
  theme?: "light" | "dark" | "system";
  onSetTheme?: (t: "light" | "dark" | "system") => void;
  onAccount: () => void;
  onPreferences: () => void;
  onLogout: () => void;
  onEndImpersonation?: () => void;
  panelRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const role = user.roleBadge || "Membro";

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Menu da conta"
      className={cn(
        "flex w-full min-w-[260px] max-w-[280px] flex-col overflow-hidden rounded-2xl",
        "border border-black/[0.08] bg-white dark:border-white/[0.09] dark:bg-[#12141c]",
        "shadow-2xl shadow-black/15 dark:shadow-black/70",
        floating && "min-w-[270px]",
        className
      )}
      style={{
        height: "auto",
        maxHeight: maxHeight ?? "min(380px, 60vh)",
        boxSizing: "border-box",
      }}
    >
      {/* ── 1. TOPO: Identidade do Usuário (Nome + E-mail + Badge de Cargo) ── */}
      <div className="relative p-3.5 pb-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-gradient-to-br from-violet-500/[0.06] via-transparent to-transparent">
        {/* Glow roxo ambiente discreto */}
        <div
          className="pointer-events-none absolute -top-4 -right-4 h-16 w-24 rounded-full bg-violet-600/10 blur-xl"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span
              className="truncate text-[13px] font-semibold text-ink dark:text-zinc-100 tracking-tight"
              title={user.name}
            >
              {user.name}
            </span>
            <span className="shrink-0 inline-flex items-center rounded-md bg-violet-500/10 dark:bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
              {role}
            </span>
          </div>

          {user.email ? (
            <span
              className="truncate text-[11.5px] text-ink-muted dark:text-zinc-400"
              title={user.email}
            >
              {user.email}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── 2. AÇÕES PRINCIPAIS ── */}
      <div className="p-1.5 space-y-0.5" role="group" aria-label="Ações da conta">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-200 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onAccount}
        >
          <User className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-200 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onPreferences}
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-amber-600 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-400/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* ── 3. APARÊNCIA / TEMA (Segmented Control: Sistema / Claro / Escuro) ── */}
      {onSetTheme ? (
        <>
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          <div className="p-2">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400">
                Tema
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.035] dark:bg-white/[0.04] p-1 border border-black/[0.03] dark:border-white/[0.04]">
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium transition-all",
                  theme === "light"
                    ? "bg-white text-ink shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("light")}
                title="Modo claro"
              >
                <Sun className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                <span>Claro</span>
              </button>

              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium transition-all",
                  theme === "dark"
                    ? "bg-violet-600/15 text-violet-700 dark:bg-violet-600/30 dark:text-violet-200 ring-1 ring-violet-500/30 shadow-xs font-semibold"
                    : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("dark")}
                title="Modo escuro"
              >
                <Moon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                <span>Escuro</span>
              </button>

              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium transition-all",
                  theme === "system"
                    ? "bg-white text-ink shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("system")}
                title="Sincronizar com o sistema"
              >
                <Monitor className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                <span>Auto</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ── 4. RODAPÉ: Sair ── */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />
      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
