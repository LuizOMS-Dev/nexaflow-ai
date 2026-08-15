"use client";

import type { Ref } from "react";
import { LogOut, Settings, ShieldAlert, User } from "lucide-react";
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
 * Clean, sem repetição de avatar/nome/cargo e sem controle de tema redundante.
 */
export function TenantUserMenu({
  user,
  floating,
  maxHeight,
  impersonating,
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
  onAccount: () => void;
  onPreferences: () => void;
  onToggleTheme?: () => void;
  onLogout: () => void;
  onEndImpersonation?: () => void;
  panelRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Menu da conta"
      className={cn(
        "flex w-full min-w-0 max-w-full flex-col overflow-hidden",
        "rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#12141c]",
        "shadow-xl shadow-black/10 dark:shadow-black/50",
        floating && "min-w-[240px]",
        className
      )}
      style={{
        height: "auto",
        maxHeight: maxHeight ?? "min(280px, 45vh)",
        boxSizing: "border-box",
      }}
    >
      {/* 1. E-mail da conta no topo, discreto */}
      {user.email ? (
        <div className="px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
          <p className="truncate text-[11.5px] font-medium text-ink-muted dark:text-zinc-400" title={user.email}>
            {user.email}
          </p>
        </div>
      ) : null}

      {/* 2. Ações principais */}
      <div className="p-1" role="group" aria-label="Ações da conta">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-200 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onAccount}
        >
          <User className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-200 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onPreferences}
        >
          <Settings className="h-3.5 w-3.5 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-amber-600 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-400/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-300/80" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* 3. Divisor */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />

      {/* 4. Sair */}
      <div className="p-1">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400/80" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
