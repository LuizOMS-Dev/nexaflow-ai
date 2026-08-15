"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  KeyRound,
  MonitorSmartphone,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";

type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (pathname: string) => boolean;
  hideForPlatformAdmin?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "profile",
    href: "/app/account",
    label: "Perfil",
    icon: UserRound,
    match: (p) => p === "/app/account",
  },
  {
    id: "security",
    href: "/app/account/security",
    label: "Segurança",
    icon: KeyRound,
    match: (p) => p.startsWith("/app/account/security"),
  },
  {
    id: "sessions",
    href: "/app/account/sessions",
    label: "Sessões",
    icon: MonitorSmartphone,
    match: (p) => p.startsWith("/app/account/sessions"),
  },
  {
    id: "preferences",
    href: "/app/account/preferences",
    label: "Preferências",
    icon: SlidersHorizontal,
    match: (p) => p.startsWith("/app/account/preferences"),
  },
  {
    id: "companies",
    href: "/app/account/companies",
    label: "Empresas",
    icon: Building2,
    match: (p) => p.startsWith("/app/account/companies"),
    hideForPlatformAdmin: true,
  },
];

/**
 * Shell limpo e premium da Minha Conta — foco em tipografia,
 * hierarquia de conteúdo e ausência de caixas/cards redundantes.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships) || [];
  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && memberships.length === 0;

  const items = NAV_ITEMS.filter(
    (item) => !(isPlatformAdmin && item.hideForPlatformAdmin)
  );

  const activeItem = items.find((item) => item.match(pathname));

  return (
    <div className="mx-auto w-full min-w-0 max-w-[980px] pb-16">
      {/* Cabeçalho Direto (sem caixas ou cards externos) */}
      <header className="mb-8 border-b border-black/[0.06] pb-5 dark:border-white/[0.07]">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-white sm:text-3xl">
          Minha Conta
        </h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-zinc-400">
          Gerencie suas informações pessoais, segurança, sessões e preferências.
        </p>
      </header>

      {/* Layout: Menu Lateral Limpo + Superfície de Conteúdo */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Menu Lateral */}
        <nav
          className="lg:w-48 lg:shrink-0"
          aria-label="Navegação da conta"
        >
          {/* Mobile: Tabs horizontais limpas */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-violet-600 text-white dark:bg-violet-500"
                      : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: Lista vertical limpa sem card/caixa externa */}
          <ul className="hidden space-y-1 lg:block">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                      active
                        ? "bg-violet-500/12 text-violet-700 dark:bg-violet-500/18 dark:text-violet-300 font-semibold"
                        : "text-ink-secondary hover:bg-black/[0.035] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-ink-faint dark:text-zinc-500"
                      )}
                      strokeWidth={active ? 2 : 1.75}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Conteúdo da Página */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
