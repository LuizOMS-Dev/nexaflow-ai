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

/**
 * Shell pessoal da Minha Conta — não é settings da empresa.
 * Nav leve, sem card de usuário duplicado no header.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships);
  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && memberships.length === 0;

  const tabs = ALL_TABS.filter(
    (t) => !(isPlatformAdmin && "hideForPlatformAdmin" in t && t.hideForPlatformAdmin)
  );

  const activeTab = tabs.find((t) => t.match(pathname));

  return (
    <div className="nf-account mx-auto w-full min-w-0 max-w-[920px]">
      <header className="mb-5 border-b border-black/[0.06] pb-4 dark:border-white/[0.07]">
        <h1 className="font-display text-[1.4rem] font-semibold leading-tight tracking-[-0.035em] text-ink dark:text-white sm:text-[1.5rem]">
          Minha conta
        </h1>
        {user ? (
          <p className="mt-1 truncate text-[13px] text-ink-muted dark:text-zinc-400">
            <span className="font-medium text-ink dark:text-zinc-200">{user.name}</span>
            <span className="text-ink-faint dark:text-zinc-500"> · {user.email}</span>
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-ink-muted dark:text-zinc-400">
            Perfil, segurança e preferências pessoais
          </p>
        )}
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-7">
        <nav
          className="lg:w-[168px] lg:shrink-0"
          aria-label="Seções da minha conta"
        >
          {/* Mobile: chips horizontais */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.match(pathname);
              return (
                <Link
                  key={t.id}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
                      : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 opacity-80" strokeWidth={1.75} />
                  {t.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: lista compacta sem card fechado */}
          <ul className="hidden space-y-0.5 lg:block">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.match(pathname);
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-violet-500/[0.1] text-violet-800 dark:bg-violet-500/[0.14] dark:text-violet-100"
                        : "text-ink-secondary hover:bg-black/[0.035] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-violet-600 dark:text-violet-300"
                          : "text-ink-faint dark:text-zinc-500"
                      )}
                      strokeWidth={1.7}
                    />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab && activeTab.id !== "profile" ? (
            <h2 className="mb-3 font-display text-[15px] font-semibold tracking-[-0.02em] text-ink dark:text-white lg:hidden">
              {activeTab.label}
            </h2>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
