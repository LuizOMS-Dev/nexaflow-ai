"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  KeyRound,
  Laptop,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantModule } from "@/components/tenant/tenant-module";
import { useAuth } from "@/store/auth";

type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (pathname: string) => boolean;
  group: "conta" | "acesso" | "sistema";
  hideForPlatformAdmin?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "profile",
    href: "/app/account",
    label: "Perfil",
    icon: UserRound,
    match: (p) => p === "/app/account",
    group: "conta",
  },
  {
    id: "security",
    href: "/app/account/security",
    label: "Segurança",
    icon: KeyRound,
    match: (p) => p.startsWith("/app/account/security"),
    group: "acesso",
  },
  {
    id: "sessions",
    href: "/app/account/sessions",
    label: "Sessões",
    icon: Laptop,
    match: (p) => p.startsWith("/app/account/sessions"),
    group: "acesso",
  },
  {
    id: "preferences",
    href: "/app/account/preferences",
    label: "Preferências",
    icon: SlidersHorizontal,
    match: (p) => p.startsWith("/app/account/preferences"),
    group: "sistema",
  },
  {
    id: "companies",
    href: "/app/account/companies",
    label: "Empresas",
    icon: Building2,
    match: (p) => p.startsWith("/app/account/companies"),
    group: "sistema",
    hideForPlatformAdmin: true,
  },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  conta: "Conta",
  acesso: "Acesso",
  sistema: "Sistema",
};

function renderNavLink(item: NavItem, pathname: string, mobile?: boolean) {
  const Icon = item.icon;
  const active = item.match(pathname);

  if (mobile) {
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
          active
            ? "bg-violet-500/12 text-violet-700 font-semibold dark:bg-violet-500/20 dark:text-violet-200"
            : "text-zinc-600 hover:bg-black/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
        )}
      >
        <Icon
          className={cn("h-3.5 w-3.5", active ? "text-violet-600 dark:text-violet-300 opacity-100" : "opacity-70")}
          strokeWidth={active ? 2 : 1.75}
        />
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      key={item.id}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150",
        active
          ? "bg-violet-500/[0.08] text-violet-950 font-semibold dark:bg-violet-500/[0.12] dark:text-violet-100"
          : "text-zinc-600 hover:bg-black/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-violet-600 dark:bg-violet-400 transition-all",
          active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"
        )}
        aria-hidden
      />
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active
            ? "text-violet-600 dark:text-violet-400 opacity-100"
            : "text-zinc-500 dark:text-zinc-400 opacity-70 group-hover:opacity-100"
        )}
        strokeWidth={active ? 2 : 1.75}
      />
      <span className={cn("text-[13px] leading-none tracking-tight", active ? "font-semibold" : "font-medium")}>
        {item.label}
      </span>
    </Link>
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships) || [];

  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && memberships.length === 0;

  const items = NAV_ITEMS.filter(
    (item) => !(isPlatformAdmin && item.hideForPlatformAdmin)
  );

  const groups = (["conta", "acesso", "sistema"] as const).map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <TenantModule
      kind="settings"
      title="Minha conta"
      hideHeader
      className="account-page settings-page settings-page--split"
    >
      {/* 1. Cabeçalho limpo e direto da página */}
      <header className="border-b border-black/[0.06] pb-4.5 dark:border-white/[0.07]">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink dark:text-white">
          Minha conta
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted dark:text-zinc-400">
          Gerencie seu perfil, segurança, sessões e preferências.
        </p>
      </header>

      {/* Mobile: chips de navegação */}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 lg:hidden" aria-label="Seções da conta">
        <div className="flex w-max min-w-full gap-1.5 border-b border-black/[0.05] pb-2 dark:border-white/[0.06]">
          {items.map((item) => renderNavLink(item, pathname, true))}
        </div>
      </div>

      {/* Desktop: navegação lateral compacta + conteúdo principal */}
      <div className="settings-layout flex flex-col gap-6 lg:gap-0">
        <nav
          className="settings-subnav hidden lg:block"
          aria-label="Navegação da conta"
        >
          {groups.map(({ group, label, items: groupItems }, idx) => (
            <div key={group} className={cn(idx > 0 && "mt-5")}>
              <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-zinc-500">
                {label}
              </p>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => renderNavLink(item, pathname))}
              </div>
            </div>
          ))}
        </nav>

        <main className="settings-main relative min-w-0 w-full">
          <div className="account-panel nf-settings-fade space-y-5">{children}</div>
        </main>
      </div>
    </TenantModule>
  );
}
