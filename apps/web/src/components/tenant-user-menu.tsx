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
 * Menu suspenso de conta (Área do Tenant e Admin).
 * Design Linear/Stripe: Topo com identidade completa (Nome, E-mail, Cargo),
 * Ações diretas, Segmented control de Tema (Sistema / Claro / Escuro) e Sair com destaque suave.
 */
export function TenantUserMenu({
  user,
  impersonating,
  theme = "system",
  onSetTheme,
  onAccount,
  onPreferences,
  onLogout,
  onEndImpersonation,
  panelRef,
  className,
  maxHeight,
}: {
  user: TenantUserMenuUser;
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
        "border border-black/[0.08] bg-white text-ink shadow-2xl shadow-black/15",
        "dark:border-white/[0.09] dark:bg-[#12141c] dark:text-zinc-200 dark:shadow-black/70",
        "backdrop-blur-md transition-all duration-150 ease-out",
        className
      )}
      style={{
        maxHeight: maxHeight ?? 380,
      }}
    >
      {/* ── 1. CABEÇALHO DO POPOVER: Identidade (Nome + E-mail + Badge discreto) ── */}
      <div className="p-3.5 pb-3 border-b border-black/[0.06] dark:border-white/[0.07] bg-black/[0.015] dark:bg-white/[0.02]">
        <div className="flex flex-col gap-1 min-w-0">
          <p
            className="truncate text-[13.5px] font-bold text-ink dark:text-white tracking-tight"
            title={user.name}
          >
            {user.name}
          </p>

          {user.email ? (
            <p
              className="truncate text-[11.5px] text-ink-muted dark:text-zinc-400"
              title={user.email}
            >
              {user.email}
            </p>
          ) : null}

          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/[0.06] dark:bg-violet-500/[0.1] border border-violet-500/15 px-2 py-0.5 text-[10.5px] font-medium text-violet-700/90 dark:text-violet-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500/60 dark:bg-violet-400/70" />
              {role}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. AÇÕES PRINCIPAIS ── */}
      <div className="p-1.5 space-y-0.5" role="group" aria-label="Navegação da conta">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-secondary hover:bg-violet-500/[0.06] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.12] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onAccount}
        >
          <User className="h-4 w-4 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-secondary hover:bg-violet-500/[0.06] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.12] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onPreferences || onAccount}
        >
          <Settings className="h-4 w-4 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-amber-600 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-400/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* ── 3. APARÊNCIA / TEMA (Segmented Control: Sistema / Claro / Escuro) ── */}
      {onSetTheme ? (
        <>
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.07]" />
          <div className="p-2">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400">
                Aparência
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-black/[0.06] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                  theme === "system"
                    ? "bg-white text-ink shadow-xs dark:bg-[#1f222e] dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("system")}
                title="Sincronizar com o sistema operacional"
              >
                <Monitor className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Sistema</span>
              </button>

              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                  theme === "light"
                    ? "bg-white text-ink shadow-xs dark:bg-[#1f222e] dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("light")}
                title="Modo claro"
              >
                <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Claro</span>
              </button>

              <button
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all",
                  theme === "dark"
                    ? "bg-white text-ink shadow-xs dark:bg-[#1f222e] dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
                onClick={() => onSetTheme("dark")}
                title="Modo escuro"
              >
                <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>Escuro</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ── 4. RODAPÉ: Sair ── */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.07]" />
      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/15 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}

export const UserMenuDropdown = TenantUserMenu;
