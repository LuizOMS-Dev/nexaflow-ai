"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Laptop,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { UserAvatar } from "@/components/user-avatar";

type NavItem = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match: (pathname: string) => boolean;
  hideForPlatformAdmin?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Acesso & Perfil",
    items: [
      {
        id: "profile",
        href: "/app/account",
        label: "Perfil",
        description: "Nome, foto e informações",
        icon: UserRound,
        match: (p) => p === "/app/account",
      },
      {
        id: "security",
        href: "/app/account/security",
        label: "Segurança",
        description: "Senha e autenticação 2FA",
        icon: ShieldCheck,
        match: (p) => p.startsWith("/app/account/security"),
      },
      {
        id: "sessions",
        href: "/app/account/sessions",
        label: "Sessões",
        description: "Dispositivos conectados",
        icon: Laptop,
        match: (p) => p.startsWith("/app/account/sessions"),
      },
    ],
  },
  {
    title: "Customização",
    items: [
      {
        id: "preferences",
        href: "/app/account/preferences",
        label: "Preferências",
        description: "Tema, idioma e alertas",
        icon: SlidersHorizontal,
        match: (p) => p.startsWith("/app/account/preferences"),
      },
    ],
  },
  {
    title: "Organização",
    items: [
      {
        id: "companies",
        href: "/app/account/companies",
        label: "Empresas",
        description: "Workspaces e permissões",
        icon: Building2,
        match: (p) => p.startsWith("/app/account/companies"),
        hideForPlatformAdmin: true,
      },
    ],
  },
];

/**
 * Shell pessoal da Minha Conta — redesenhado com estética premium,
 * menu categorizado, avatar integrado e estados visuais sofisticados.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/app/account";
  const user = useAuth((s) => s.user);
  const memberships = useAuth((s) => s.memberships);
  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && memberships.length === 0;

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (item) => !(isPlatformAdmin && item.hideForPlatformAdmin)
    ),
  })).filter((g) => g.items.length > 0);

  const allItems = groups.flatMap((g) => g.items);
  const activeItem = allItems.find((item) => item.match(pathname));

  const roleLabel =
    user?.platformRole === "SUPERADMIN"
      ? "Super Admin"
      : memberships?.[0]?.role === "ADMIN"
        ? "Administrador"
        : "Membro";

  return (
    <div className="nf-account mx-auto w-full min-w-0 max-w-[1040px] pb-12">
      {/* Header Principal */}
      <header className="mb-6 rounded-2xl border border-black/[0.06] bg-white/70 p-5 shadow-xs backdrop-blur-md dark:border-white/[0.07] dark:bg-zinc-900/60 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />
              Configurações Pessoais
            </div>
            <h1 className="mt-1.5 font-display text-[1.45rem] font-bold tracking-tight text-ink dark:text-white sm:text-[1.65rem]">
              Minha Conta
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-muted dark:text-zinc-400">
              Gerencie seus dados de acesso, segurança e preferências individuais.
            </p>
          </div>

          {user ? (
            <div className="flex items-center gap-3 self-start rounded-xl border border-black/[0.05] bg-black/[0.02] px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03] sm:self-auto">
              <UserAvatar user={user} size="md" ring />
              <div className="min-w-0 text-left">
                <p className="truncate text-[13px] font-semibold text-ink dark:text-zinc-100">
                  {user.name}
                </p>
                <span className="inline-block text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                  {roleLabel}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Grid Principal: Sidebar de Navegação + Conteúdo */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-7">
        {/* Navigation Sidebar */}
        <aside
          className="lg:w-[260px] lg:shrink-0"
          aria-label="Menu da minha conta"
        >
          {/* Mobile: Tabs em Chips Horizontais estilizados */}
          <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-black/[0.06] bg-white/60 p-1.5 shadow-2xs backdrop-blur-sm dark:border-white/[0.07] dark:bg-zinc-900/50 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all duration-150",
                    active
                      ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                      : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: Sidebar estruturada com categorias, cartões e microinterações */}
          <div className="hidden space-y-5 rounded-2xl border border-black/[0.06] bg-white/70 p-3.5 shadow-xs backdrop-blur-md dark:border-white/[0.07] dark:bg-zinc-900/60 lg:block">
            {groups.map((group, gIdx) => (
              <div key={group.title} className={cn(gIdx > 0 && "pt-3 border-t border-black/[0.05] dark:border-white/[0.05]")}>
                <h2 className="mb-2 px-2.5 text-[11px] font-bold tracking-wider text-ink-faint uppercase dark:text-zinc-400">
                  {group.title}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(pathname);
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-150 ease-out",
                            active
                              ? "bg-indigo-500/[0.09] text-indigo-950 shadow-2xs dark:bg-white/[0.07] dark:text-white"
                              : "text-ink-secondary hover:bg-black/[0.035] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                                active
                                  ? "bg-indigo-600 text-white shadow-2xs dark:bg-indigo-500 dark:text-white"
                                  : "bg-black/[0.04] text-ink-muted group-hover:bg-black/[0.07] group-hover:text-ink dark:bg-white/[0.05] dark:text-zinc-400 dark:group-hover:bg-white/[0.08] dark:group-hover:text-zinc-200"
                              )}
                            >
                              <Icon className="h-4 w-4" strokeWidth={1.8} />
                            </span>
                            <div className="min-w-0 text-left">
                              <p className={cn(
                                "truncate text-[13px] font-semibold leading-tight",
                                active ? "text-indigo-950 dark:text-white" : "text-ink dark:text-zinc-200"
                              )}>
                                {item.label}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-ink-faint dark:text-zinc-400">
                                {item.description}
                              </p>
                            </div>
                          </div>

                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                              active
                                ? "text-indigo-600 opacity-100 translate-x-0.5 dark:text-indigo-400"
                                : "text-ink-faint opacity-0 group-hover:opacity-60 dark:text-zinc-500"
                            )}
                            strokeWidth={2}
                          />

                          {/* Indicador de borda ativo */}
                          {active ? (
                            <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Área de Conteúdo da Página */}
        <main className="min-w-0 flex-1">
          {activeItem && activeItem.id !== "profile" ? (
            <div className="mb-4 flex items-center justify-between border-b border-black/[0.05] pb-3 dark:border-white/[0.06] lg:hidden">
              <h2 className="font-display text-[16px] font-semibold tracking-tight text-ink dark:text-white">
                {activeItem.label}
              </h2>
              <span className="text-[12px] text-ink-muted dark:text-zinc-400">
                {activeItem.description}
              </span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
