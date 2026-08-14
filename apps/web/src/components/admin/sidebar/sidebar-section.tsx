"use client";

import { cn } from "@/lib/utils";
import { SidebarItem } from "./sidebar-item";
import type { SidebarNavGroup } from "./types";

export function SidebarSection({
  group,
  pathname,
  collapsed,
  showDivider,
  onNavigate,
  disabled,
  disabledReason,
}: {
  group: SidebarNavGroup;
  pathname: string;
  collapsed: boolean;
  showDivider?: boolean;
  onNavigate?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col", collapsed ? "items-center gap-1" : "gap-0.5")}
      data-group={group.label}
    >
      {collapsed && showDivider ? (
        <div
          className="my-1 h-px w-5 bg-gradient-to-r from-transparent via-violet-400/40 to-transparent"
          aria-hidden
        />
      ) : null}

      {!collapsed ? (
        <div className="mb-1.5 flex items-center gap-2 px-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500/80">
            {group.label}
          </p>
          <span className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" aria-hidden />
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col",
          collapsed ? "w-full items-center gap-1" : "gap-0.5"
        )}
        role="group"
        aria-label={group.label}
      >
        {group.items.map((item) => (
          <SidebarItem
            key={item.href}
            href={item.href}
            label={item.label}
            group={group.label}
            icon={item.icon}
            pathname={pathname}
            collapsed={collapsed}
            onNavigate={onNavigate}
            disabled={disabled}
            disabledReason={disabledReason}
          />
        ))}
      </div>
    </div>
  );
}
