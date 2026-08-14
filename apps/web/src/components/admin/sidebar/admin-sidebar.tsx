"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui";
import { Logo } from "@/components/brand/logo";
import { CollapseToggleButton } from "./collapse-toggle-button";
import { SidebarSection } from "./sidebar-section";
import type { SidebarNavGroup } from "./types";

/**
 * Sidebar da área administrativa (Superadmin).
 * Visual graphite + violet, Tailwind-first — distinto da sidebar tenant.
 */
export function AdminSidebar({
  collapsed,
  pathname,
  homeHref = "/admin",
  navGroups,
  onNavigate,
  onToggleCollapsed,
  navLocked,
  navLockReason,
  userMenuOpen,
  footer,
  className,
}: {
  collapsed: boolean;
  pathname: string;
  homeHref?: string;
  navGroups: SidebarNavGroup[];
  onNavigate?: () => void;
  onToggleCollapsed: () => void;
  navLocked?: boolean;
  navLockReason?: string;
  userMenuOpen?: boolean;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "nf-app-enter-aside nf-sidebar nf-asb relative isolate flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
        "border-r border-white/[0.07]",
        "bg-[#07080c]",
        "shadow-[1px_0_0_rgba(139,92,246,0.08)]",
        collapsed && "nf-sidebar-collapsed nf-asb--collapsed",
        className
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-platform="true"
      data-admin-sidebar="v5"
      data-user-menu-open={userMenuOpen ? "true" : "false"}
      aria-label="Navegação da administração"
    >
      {/* Accent edge + ambient */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-violet-500/40 via-violet-500/10 to-transparent" />
        <div className="absolute -left-1/2 -top-1/4 h-[50%] w-[200%] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_65%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-black/20" />
      </div>

      <div className="relative z-[1] flex h-full min-h-0 min-w-0 w-full flex-1 flex-col">
        {/* ── TOPO ── */}
        <header
          className={cn(
            "flex shrink-0 flex-col",
            collapsed ? "items-center gap-2 px-2 pb-2 pt-3.5" : "gap-2.5 px-3 pb-2 pt-3.5"
          )}
        >
          {collapsed ? (
            <>
              <Tooltip content="NexaFlow AI" subtitle="Administração" side="right" delay={100}>
                <Link
                  href={homeHref}
                  onClick={onNavigate}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45"
                  aria-label="NexaFlow Administração"
                >
                  <Logo size="sm" variant="mark" />
                </Link>
              </Tooltip>
              <CollapseToggleButton
                collapsed
                onToggle={onToggleCollapsed}
                className="hidden lg:inline-flex"
              />
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Link
                  href={homeHref}
                  onClick={onNavigate}
                  className="min-w-0 rounded-lg opacity-95 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45"
                  aria-label="NexaFlow Administração"
                >
                  <Logo size="sm" variant="full-white" />
                </Link>
                <CollapseToggleButton
                  collapsed={false}
                  onToggle={onToggleCollapsed}
                  className="hidden lg:inline-flex"
                />
              </div>
              <div
                className="inline-flex max-w-full items-center gap-1.5 self-start rounded-md border border-violet-400/20 bg-violet-500/[0.1] px-2 py-1"
                role="status"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.2)]" />
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200/90">
                  Administração
                </span>
              </div>
            </>
          )}
        </header>

        <div
          className={cn(
            "mx-3 h-px shrink-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent",
            collapsed && "mx-4 via-violet-400/30"
          )}
          aria-hidden
        />

        {/* ── NAV ── */}
        <nav
          className={cn(
            "nf-sidebar-nav min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain py-3",
            collapsed ? "px-2" : "px-2.5"
          )}
          aria-label="Navegação da plataforma"
        >
          <div className={cn("flex flex-col", collapsed ? "gap-2" : "gap-4")}>
            {navGroups.map((group, gi) => (
              <SidebarSection
                key={group.label}
                group={group}
                pathname={pathname}
                collapsed={collapsed}
                showDivider={gi > 0}
                onNavigate={onNavigate}
                disabled={navLocked}
                disabledReason={navLockReason}
              />
            ))}
          </div>
        </nav>

        {/* ── RODAPÉ ── */}
        <footer
          className={cn(
            "nf-sidebar-footer relative z-20 shrink-0 border-t border-white/[0.06]",
            "bg-gradient-to-t from-black/40 to-transparent",
            collapsed ? "flex flex-col items-center px-2 py-3" : "px-2.5 py-3"
          )}
        >
          {footer}
        </footer>
      </div>
    </aside>
  );
}
