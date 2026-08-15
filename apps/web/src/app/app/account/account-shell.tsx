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
import { UserAvatar } from "@/components/user-avatar";
import { TenantModule } from "@/components/tenant/tenant-module";
import { useAuth } from "@/store/auth";
import { getRoleLabel } from "./account-utils";
import { AccountStatusBadge } from "./account-ui";

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
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
          active
            ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
            : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05]"
        )}
      >
        <Icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
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
        "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
        active
          ? "bg-violet-500/[0.09] text-ink dark:bg-violet-500/[0.12] dark:text-white"
          : "text-ink-muted hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-violet-500 transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
        aria-hidden
      />
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          active ? "text-violet-600 opacity-100 dark:text-violet-300" : "opacity-45"
        )}
        strokeWidth={1.75}
      />
      <span className={cn("text-[13px] leading-none", active ? "font-semibold" : "font-medium")}>
        {item.label}
      </span>
    </Link>
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships) || [];
  const tenant = useAuth((s) => s.tenant);

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

  const roleLabel = user ? getRoleLabel(user, memberships) : "";
  const kicker = tenant?.name || user?.email || "Conta pessoal";

  return (
    <TenantModule
      kind="settings"
      title="Minha conta"
      kicker={kicker}
      className="account-page settings-page settings-page--split"
    >
      {/* Hero — identidade do usuário */}
      {user ? (
        <div className="account-hero">
          <div className="account-hero__glow" aria-hidden />
          <div className="account-hero__body">
            <UserAvatar user={user} size="xl" className="account-hero__avatar" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] font-bold tracking-tight text-ink dark:text-white">
                {user.name}
              </p>
              {user.email ? (
                <p className="mt-0.5 truncate text-[12px] text-ink-muted dark:text-zinc-400">
                  {user.email}
                </p>
              ) : null}
              <div className="mt-2">
                <AccountStatusBadge tone="brand" label={roleLabel} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile: chips */}
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5 lg:hidden" aria-label="Seções da conta">
        <div className="flex w-max min-w-full gap-1">
          {items.map((item) => renderNavLink(item, pathname, true))}
        </div>
      </div>

      {/* Desktop: nav + conteúdo */}
      <div className="settings-layout flex flex-col gap-5 lg:gap-0">
        <nav
          className="settings-subnav hidden lg:block"
          aria-label="Navegação da conta"
        >
          {groups.map(({ group, label, items: groupItems }, idx) => (
            <div key={group} className={cn(idx > 0 && "mt-4")}>
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {label}
              </p>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => renderNavLink(item, pathname))}
              </div>
            </div>
          ))}
        </nav>

        <div className="settings-main relative min-w-0 w-full">
          <div className="account-panel nf-settings-fade space-y-4">{children}</div>
        </div>
      </div>
    </TenantModule>
  );
}
