"use client";

import type { Ref } from "react";
import {
  Check,
  LogOut,
  Monitor,
  Moon,
  ShieldAlert,
  SlidersHorizontal,
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
 * Menu popover do usuário no rodapé da sidebar (Tenant e Superadmin).
 * Espaçamento equilibrado, confortável e elegante:
 * 1. Topo com identidade clara e respiro proporcional
 * 2. Minha conta e Preferências com altura de 36px e padding de 12px
 * 3. Opções de tema em lista vertical de 36px com indicador suave
 * 4. Sair no rodapé com espaçamento harmonioso
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

  const themeOptions = [
    { id: "system" as const, label: "Sistema", Icon: Monitor },
    { id: "light" as const, label: "Claro", Icon: Sun },
    { id: "dark" as const, label: "Escuro", Icon: Moon },
  ];

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Menu da conta"
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl",
        "border border-black/[0.08] bg-white/95 text-ink shadow-2xl shadow-black/15",
        "dark:border-white/[0.09] dark:bg-[#12141c]/95 dark:text-zinc-200 dark:shadow-black/70",
        "backdrop-blur-md select-none",
        className
      )}
      style={{
        maxHeight: maxHeight ?? 440,
      }}
    >
      {/* ── 1. IDENTIDADE DO USUÁRIO ── */}
      <div className="p-3.5 pb-3">
        <div className="flex flex-col min-w-0">
          <p
            className="truncate text-[13.5px] font-semibold text-ink dark:text-white tracking-tight leading-tight"
            title={user.name}
          >
            {user.name}
          </p>

          {user.email ? (
            <p
              className="truncate text-[11.5px] text-ink-muted dark:text-zinc-400 leading-tight mt-1"
              title={user.email}
            >
              {user.email}
            </p>
          ) : null}

          <div className="pt-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/[0.05] dark:bg-violet-500/[0.09] border border-violet-500/10 dark:border-violet-400/15 px-2 py-0.5 text-[10px] font-medium text-violet-700/85 dark:text-violet-300/85">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500/60 dark:bg-violet-400/70" />
              {role}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. NAVEGAÇÃO: Minha conta e Preferências ── */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.07]" />
      <div className="p-1.5 space-y-1" role="group" aria-label="Ações da conta">
        <button
          type="button"
          role="menuitem"
          className="group flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium text-zinc-700 hover:bg-violet-500/[0.05] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.08] dark:hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 cursor-pointer"
          onClick={onAccount}
        >
          <User className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-violet-600 dark:text-zinc-400 dark:group-hover:text-violet-300 transition-colors duration-150" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="group flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium text-zinc-700 hover:bg-violet-500/[0.05] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.08] dark:hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 cursor-pointer"
          onClick={onPreferences || onAccount}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-violet-600 dark:text-zinc-400 dark:group-hover:text-violet-300 transition-colors duration-150" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium text-amber-600 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-400/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30 cursor-pointer"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* ── 3. APARÊNCIA (LISTA VERTICAL: Sistema, Claro, Escuro) ── */}
      {onSetTheme ? (
        <>
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.07]" />
          <div className="p-1.5 space-y-1" role="group" aria-label="Aparência da interface">
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500 select-none">
              Aparência
            </p>
            {themeOptions.map(({ id, label, Icon }) => {
              const isSelected = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => onSetTheme(id)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[12.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 cursor-pointer",
                    isSelected
                      ? "bg-violet-500/[0.05] text-violet-950 font-medium dark:bg-violet-500/[0.08] dark:text-violet-200"
                      : "text-zinc-600 hover:bg-black/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200"
                  )}
                  title={`Tema ${label}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors duration-150",
                        isSelected
                          ? "text-violet-600 dark:text-violet-400 opacity-100"
                          : "opacity-60"
                      )}
                      strokeWidth={isSelected ? 2 : 1.75}
                    />
                    <span className="truncate">{label}</span>
                  </div>
                  {isSelected ? (
                    <Check
                      className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {/* ── 4. SAIR (LOGOUT) ── */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.07]" />
      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          className="flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[12.5px] font-medium text-rose-600/90 hover:bg-rose-500/[0.06] hover:text-rose-700 dark:text-rose-400/90 dark:hover:bg-rose-500/[0.10] dark:hover:text-rose-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/30 cursor-pointer"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}

export const UserMenuDropdown = TenantUserMenu;
