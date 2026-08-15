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
import type { SidebarUserInfo } from "./types";

/**
 * Menu suspenso de conta (Admin / Superadministrador).
 * Design Linear/Stripe: Topo com identidade completa (Nome, E-mail, Cargo),
 * Ações diretas, Segmented control de Tema (Claro/Escuro/Sistema) e Sair destacado.
 */
export function UserMenuDropdown({
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
}: {
  user: SidebarUserInfo;
  dark?: boolean;
  floating?: boolean;
  maxHeight?: number;
  impersonating?: boolean;
  theme?: "light" | "dark" | "system";
  onSetTheme?: (t: "light" | "dark" | "system") => void;
  onAccount: () => void;
  onPreferences?: () => void;
  onLogout: () => void;
  onEndImpersonation?: () => void;
  panelRef?: Ref<HTMLDivElement>;
}) {
  const role = user.roleBadge || "Superadministrador";

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Menu da conta"
      className={cn(
        "flex w-full min-w-[260px] max-w-[280px] flex-col overflow-hidden rounded-2xl",
        "border border-white/[0.09] bg-[#12141c]",
        "shadow-2xl shadow-black/70",
        floating && "min-w-[270px]"
      )}
      style={{
        height: "auto",
        maxHeight: maxHeight ?? "min(380px, 60vh)",
        boxSizing: "border-box",
      }}
    >
      {/* ── 1. TOPO: Identidade do Usuário (Nome + E-mail + Badge de Cargo) ── */}
      <div className="relative p-3.5 pb-3 border-b border-white/[0.07] bg-gradient-to-br from-violet-500/[0.08] via-transparent to-transparent">
        {/* Glow roxo ambiente discreto */}
        <div
          className="pointer-events-none absolute -top-4 -right-4 h-16 w-24 rounded-full bg-violet-600/10 blur-xl"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span
              className="truncate text-[13px] font-semibold text-zinc-100 tracking-tight"
              title={user.name}
            >
              {user.name}
            </span>
            <span className="shrink-0 inline-flex items-center rounded-md bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
              {role}
            </span>
          </div>

          {user.email ? (
            <span
              className="truncate text-[11.5px] text-zinc-400"
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
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onAccount}
        >
          <User className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onPreferences || onAccount}
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* ── 3. APARÊNCIA / TEMA (Segmented Control: Sistema / Claro / Escuro) ── */}
      {onSetTheme ? (
        <>
          <div className="h-px bg-white/[0.06]" />
          <div className="p-2">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Tema
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.04]">
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium transition-all",
                  theme === "light"
                    ? "bg-white/[0.12] text-white shadow-xs"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
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
                    ? "bg-violet-600/30 text-violet-200 ring-1 ring-violet-500/30 shadow-xs"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
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
                    ? "bg-white/[0.12] text-white shadow-xs"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
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
      <div className="h-px bg-white/[0.06]" />
      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
