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
    icon: Laptop,
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
 * Shell refinado da Minha Conta — estilo Linear / Stripe / Vercel.
 * Clean, moderno, com personalidade e superfície de alto contraste.
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

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[1160px] px-3 py-4 pb-20 sm:px-6">
      {/* ── Ambientação de fundo discreta (Glows + Radial Gradient) ── */}
      {/* 1. Glow roxo amplo e muito difuso no canto superior direito */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-[560px] w-[560px] rounded-full bg-violet-600/[0.06] blur-[150px] dark:bg-violet-500/[0.08]"
        aria-hidden
      />

      {/* 2. Segundo glow azul/roxo suave no canto inferior esquerdo */}
      <div
        className="pointer-events-none absolute -left-20 bottom-10 h-[500px] w-[500px] rounded-full bg-indigo-600/[0.04] blur-[140px] dark:bg-indigo-500/[0.05]"
        aria-hidden
      />

      {/* 3. Radial gradient extremamente sutil cobrindo a área principal */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(139,92,246,0.05),transparent_75%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(139,92,246,0.07),transparent_75%)]"
        aria-hidden
      />

      {/* ── Topo Refinado: Título + Descrição + Divisor ── */}
      <header className="relative z-10 mb-6 pb-5 border-b border-black/[0.06] dark:border-white/[0.07]">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink dark:text-white sm:text-3xl">
            Minha Conta
          </h1>

          <p className="max-w-2xl text-xs sm:text-sm text-ink-muted dark:text-zinc-400">
            Gerencie suas informações pessoais, credenciais de acesso, dispositivos e preferências do sistema.
          </p>
        </div>
      </header>

      {/* ── Layout Principal: Menu Lateral (216px) + Superfície (Restante) ── */}
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
        {/* Menu Lateral */}
        <nav
          className="lg:w-52 lg:shrink-0"
          aria-label="Navegação da conta"
        >
          {/* Mobile: Tabs horizontais fluidas */}
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-150",
                    active
                      ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25 dark:bg-violet-600 dark:text-white"
                      : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop: Lista vertical com barra de acento e fundo sutil */}
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
                      "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-150",
                      active
                        ? "bg-violet-500/[0.08] text-violet-900 dark:bg-violet-500/[0.14] dark:text-violet-200 font-semibold"
                        : "text-ink-secondary hover:bg-black/[0.035] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
                    )}
                  >
                    {/* Barra lateral esquerda indicadora do item ativo */}
                    {active ? (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-violet-600 dark:bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                        aria-hidden
                      />
                    ) : null}

                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors duration-150",
                        active
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-ink-faint group-hover:text-ink dark:text-zinc-500 dark:group-hover:text-zinc-300"
                      )}
                      strokeWidth={active ? 2 : 1.75}
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Superfície Principal de Conteúdo */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
