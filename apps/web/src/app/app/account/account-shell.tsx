"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  KeyRound,
  MonitorSmartphone,
  Settings2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/store/auth";

const ALL_TABS = [
  {
    id: "profile",
    href: "/app/account",
    label: "Perfil",
    icon: UserRound,
    match: (p: string) => p === "/app/account",
  },
  {
    id: "security",
    href: "/app/account/security",
    label: "Segurança",
    icon: KeyRound,
    match: (p: string) => p.startsWith("/app/account/security"),
  },
  {
    id: "sessions",
    href: "/app/account/sessions",
    label: "Sessões",
    icon: MonitorSmartphone,
    match: (p: string) => p.startsWith("/app/account/sessions"),
  },
  {
    id: "preferences",
    href: "/app/account/preferences",
    label: "Preferências",
    icon: Settings2,
    match: (p: string) => p.startsWith("/app/account/preferences"),
  },
  {
    id: "companies",
    href: "/app/account/companies",
    label: "Empresas",
    icon: Building2,
    match: (p: string) => p.startsWith("/app/account/companies"),
    hideForPlatformAdmin: true as const,
  },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships);
  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && memberships.length === 0;

  const tabs = ALL_TABS.filter(
    (t) => !(isPlatformAdmin && t.hideForPlatformAdmin)
  );

  return (
    <div className="account-page mx-auto w-full min-w-0 max-w-[880px] space-y-4">
      <PageHeader
        title="Minha conta"
      />

      <nav
        className="flex gap-0.5 overflow-x-auto border-b border-line dark:border-white/[0.06] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Seções da minha conta"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.match(pathname);
          return (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-ink-muted hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              <Icon
                className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-60")}
                strokeWidth={1.75}
              />
              {t.label}
              {active ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600 dark:bg-brand-400" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
