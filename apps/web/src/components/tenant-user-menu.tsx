"use client";

import type { Ref } from "react";
import {
  LogOut,
  Moon,
  Settings2,
  ShieldAlert,
  Sun,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

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
 * Menu suspenso do usuário — área da empresa.
 * Compacto, grafite, sem cards internos (nível Linear/Vercel).
 */
export function TenantUserMenu({
  user,
  dark,
  floating,
  maxHeight,
  impersonating,
  onAccount,
  onPreferences,
  onToggleTheme,
  onLogout,
  onEndImpersonation,
  panelRef,
  className,
}: {
  user: TenantUserMenuUser;
  dark: boolean;
  floating?: boolean;
  maxHeight?: number;
  impersonating?: boolean;
  onAccount: () => void;
  onPreferences: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onEndImpersonation?: () => void;
  panelRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const avatarUser = {
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    avatarType: user.avatarType,
    avatarPresetId: user.avatarPresetId,
    avatarColor: user.avatarColor,
  };

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Menu da conta"
      className={cn(
        "nf-tum flex w-full min-w-0 max-w-full flex-col overflow-hidden",
        "rounded-[11px] border border-white/[0.08] bg-[#12141a]",
        "shadow-[0_12px_32px_-10px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)_inset]",
        floating && "w-[280px] min-w-[270px] max-w-[300px]",
        className
      )}
      style={{
        height: "auto",
        maxHeight: maxHeight ?? "min(340px, 50vh)",
        boxSizing: "border-box",
      }}
    >
      {/* 1. Cabeçalho — só identidade, sem botão/seta */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <UserAvatar user={avatarUser} size="md" className="!h-9 !w-9 text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight tracking-[-0.01em] text-zinc-100">
            {user.name}
          </p>
          {user.email ? (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-zinc-500" title={user.email}>
              {user.email}
            </p>
          ) : null}
          {user.showRoleBadge && user.roleBadge ? (
            <span className="mt-1 inline-flex max-w-full truncate rounded-md bg-white/[0.06] px-1.5 py-px text-[10px] font-medium leading-4 text-zinc-400">
              {user.roleBadge}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mx-2.5 h-px bg-white/[0.06]" aria-hidden />

      {/* 2. Opções principais */}
      <div className="p-1" role="group" aria-label="Conta">
        <button
          type="button"
          role="menuitem"
          className="nf-tum-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35"
          onClick={onAccount}
        >
          <UserRound className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.7} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="nf-tum-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35"
          onClick={onPreferences}
        >
          <Settings2 className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.7} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Preferências</span>
        </button>

        {/* 3. Tema — uma linha */}
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={dark}
          className="nf-tum-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35"
          onClick={onToggleTheme}
        >
          {dark ? (
            <Sun className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.7} aria-hidden />
          ) : (
            <Moon className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.7} aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{dark ? "Tema escuro" : "Tema claro"}</span>
          <span
            className={cn(
              "relative h-[16px] w-[28px] shrink-0 rounded-full transition-colors duration-150",
              dark ? "bg-violet-500" : "bg-zinc-600"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-[2px] left-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-150",
                dark && "translate-x-3"
              )}
            />
          </span>
        </button>
      </div>

      {/* 4. Impersonação */}
      {impersonating && onEndImpersonation ? (
        <>
          <div className="mx-2.5 h-px bg-white/[0.06]" aria-hidden />
          <div className="p-1" role="group" aria-label="Impersonação">
            <button
              type="button"
              role="menuitem"
              className="nf-tum-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-amber-400/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/30"
              onClick={onEndImpersonation}
            >
              <ShieldAlert
                className="h-4 w-4 shrink-0 text-amber-400/85"
                strokeWidth={1.7}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-tight text-amber-100/90">
                  Encerrar impersonação
                </span>
                <span className="mt-0.5 block text-[11px] font-normal leading-tight text-amber-200/50">
                  Voltar à administração
                </span>
              </span>
            </button>
          </div>
        </>
      ) : null}

      {/* 5. Sair */}
      <div className="mx-2.5 h-px bg-white/[0.06]" aria-hidden />
      <div className="p-1">
        <button
          type="button"
          role="menuitem"
          className="nf-tum-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-red-300/85 transition-colors duration-100 hover:bg-red-500/[0.08] hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.7} aria-hidden />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );
}
