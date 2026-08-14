"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui";
import { tourHrefToDataAttr } from "@/lib/platform-tour";
import type { SidebarIcon } from "./types";
import { isAdminNavActive } from "./nav-active";

export function SidebarItem({
  href,
  label,
  group,
  icon: Icon,
  pathname,
  collapsed,
  onNavigate,
  disabled,
  disabledReason,
}: {
  href: string;
  label: string;
  group?: string;
  icon: SidebarIcon;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const active = !disabled && isAdminNavActive(pathname, href);
  const tourAttr = tourHrefToDataAttr(href);

  const className = cn(
    "group/item relative flex w-full items-center rounded-[10px] text-[13px] font-medium tracking-[-0.01em] outline-none transition-all duration-150",
    collapsed
      ? "mx-auto h-10 w-10 justify-center"
      : "min-h-[38px] gap-2.5 px-2 py-1.5",
    disabled && "pointer-events-none opacity-40",
    !disabled && !active && "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    active &&
      !collapsed &&
      "bg-violet-500/[0.14] text-violet-50 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18)]",
    active &&
      collapsed &&
      "bg-violet-500/[0.18] text-violet-50 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.28)]",
    "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-0"
  );

  const body = (
    <>
      {!collapsed && active ? (
        <span
          className="absolute left-0 top-1/2 h-3.5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-violet-400"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150",
          collapsed ? "h-full w-full rounded-[10px]" : "h-7 w-7",
          active
            ? "bg-violet-500/20 text-violet-300"
            : "bg-white/[0.035] text-zinc-500 group-hover/item:bg-violet-500/10 group-hover/item:text-violet-300"
        )}
        aria-hidden
      >
        <Icon
          className={cn(collapsed ? "h-[18px] w-[18px]" : "h-4 w-4")}
          strokeWidth={active ? 2 : 1.65}
        />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate leading-none">{label}</span>
      ) : null}
    </>
  );

  const link = disabled ? (
    <button
      type="button"
      className={className}
      aria-disabled="true"
      disabled
      onClick={(e) => e.preventDefault()}
      {...(tourAttr ? { "data-tour": tourAttr } : {})}
    >
      {body}
    </button>
  ) : (
    <Link
      href={href}
      onClick={onNavigate}
      className={className}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? (group ? `${label} · ${group}` : label) : undefined}
      {...(tourAttr ? { "data-tour": tourAttr } : {})}
    >
      {body}
    </Link>
  );

  if (collapsed || disabled) {
    return (
      <Tooltip
        content={label}
        subtitle={disabled ? disabledReason || "Indisponível" : group || "Administração"}
        side="right"
        delay={collapsed ? 100 : 220}
        className={cn("flex w-full", collapsed && "justify-center")}
      >
        {link}
      </Tooltip>
    );
  }

  return link;
}
