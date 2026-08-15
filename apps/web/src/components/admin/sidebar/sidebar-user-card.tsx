"use client";

import type { MouseEvent, ReactNode, Ref } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { NotificationBell } from "@/components/notification-bell";
import type { SidebarUserInfo } from "./types";

/**
 * Trigger do menu de conta no rodapé da sidebar admin.
 * Linha simples — sem caixa “glass” pesada.
 */
export function SidebarUserCard({
  user,
  collapsed,
  open,
  onTriggerClick,
  menuSlot,
  triggerRef,
  rootRef,
}: {
  user: SidebarUserInfo;
  collapsed: boolean;
  open: boolean;
  onTriggerClick: (e: MouseEvent<HTMLButtonElement>) => void;
  menuSlot?: ReactNode;
  triggerRef?: Ref<HTMLButtonElement>;
  rootRef?: Ref<HTMLDivElement>;
}) {
  const avatarUser = {
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    avatarType: user.avatarType,
    avatarPresetId: user.avatarPresetId,
    avatarColor: user.avatarColor,
  };

  if (collapsed) {
    return (
      <div className="relative flex w-full flex-col items-center gap-2" ref={rootRef}>
        <NotificationBell collapsed />
        <Tooltip
          content={user.name}
          subtitle={user.showRoleBadge ? user.roleBadge || undefined : undefined}
          side="right"
          delay={200}
          className={open ? "pointer-events-none opacity-0" : undefined}
        >
          <button
            type="button"
            ref={triggerRef}
            onClick={onTriggerClick}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              "hover:bg-white/[0.06]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
              open && "bg-white/[0.08]"
            )}
            aria-label={`Conta de ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <UserAvatar user={avatarUser} size="sm" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="relative z-30 w-full min-w-0" ref={rootRef}>
      {menuSlot}
      <div className="flex w-full min-w-0 items-center gap-0.5">
        <button
          type="button"
          ref={triggerRef}
          onClick={onTriggerClick}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
            "hover:bg-white/[0.05]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
            open && "bg-white/[0.06]"
          )}
          aria-label={`Conta de ${user.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <UserAvatar user={avatarUser} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[12.5px] font-medium leading-tight tracking-[-0.01em] text-zinc-100">
              {user.name}
            </span>
            <span className="truncate text-[10.5px] leading-tight text-zinc-400">
              {user.roleBadge || "Superadministrador"}
            </span>
          </span>
          <ChevronUp
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
              !open && "rotate-180 text-zinc-400",
              open && "text-violet-400"
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <NotificationBell />
        </div>
      </div>
    </div>
  );
}
