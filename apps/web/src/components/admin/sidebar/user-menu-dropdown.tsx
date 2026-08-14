"use client";

import type { Ref } from "react";
import { LogOut, Moon, ShieldAlert, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import type { SidebarUserInfo } from "./types";

/**
 * Menu de conta — visual limpo tipo Linear/Clerk.
 * Sem cards coloridos, sem gradientes chamativos.
 */
export function UserMenuDropdown({
  user,
  dark,
  floating,
  maxHeight,
  impersonating,
  onAccount,
  onToggleTheme,
  onLogout,
  onEndImpersonation,
  panelRef,
}: {
  user: SidebarUserInfo;
  dark: boolean;
  floating?: boolean;
  maxHeight?: number;
  impersonating?: boolean;
  onAccount: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onEndImpersonation?: () => void;
  panelRef?: Ref<HTMLDivElement>;
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
        "flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl",
        "border border-white/[0.08] bg-[#14161e]",
        "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.03)_inset]",
        floating && "min-w-[260px]"
      )}
      style={{
        height: "auto",
        maxHeight: maxHeight ?? "min(360px, 52vh)",
        boxSizing: "border-box",
      }}
    >
      {/* Identidade — só informação, sem parecer botão gigante */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-3.5 py-3">
        <UserAvatar user={avatarUser} size="md" ring />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight tracking-[-0.015em] text-zinc-100">
            {user.name}
          </p>
          {user.email ? (
            <p className="mt-0.5 truncate text-[11.5px] leading-tight text-zinc-500">
              {user.email}
            </p>
          ) : null}
          {user.showRoleBadge && user.roleBadge ? (
            <p className="mt-1 truncate text-[10.5px] font-medium leading-tight text-zinc-400">
              {user.roleBadge}
            </p>
          ) : null}
        </div>
      </div>

      {/* Ações */}
      <div className="p-1.5" role="group" aria-label="Conta">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
          onClick={onAccount}
        >
          <UserRound className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1">Minha conta</span>
        </button>

        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={dark}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
          onClick={onToggleTheme}
        >
          {dark ? (
            <Sun className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.75} aria-hidden />
          ) : (
            <Moon className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.75} aria-hidden />
          )}
          <span className="min-w-0 flex-1">Tema</span>
          <span className="text-[11.5px] font-normal text-zinc-500">
            {dark ? "Escuro" : "Claro"}
          </span>
          <span
            className={cn(
              "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
              dark ? "bg-violet-500" : "bg-zinc-600"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                dark && "translate-x-3.5"
              )}
            />
          </span>
        </button>

        {impersonating && onEndImpersonation ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-amber-200/90 transition-colors hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
            onClick={onEndImpersonation}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300/80" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1">Encerrar impersonação</span>
          </button>
        ) : null}
      </div>

      {/* Sair — linha simples, alinhada às outras */}
      <div className="border-t border-white/[0.06] p-1.5">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
