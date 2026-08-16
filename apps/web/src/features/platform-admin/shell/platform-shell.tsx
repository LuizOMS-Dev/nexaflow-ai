"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  ChartColumn,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Shield,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/brand/logo";
import { SuperadminMfaGate } from "@/components/superadmin-mfa-gate";
import { Spinner } from "@/components/ui";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";

/** Seções canônicas da administração da plataforma (gestão total). */
const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    exact?: boolean;
  }>;
}> = [
  {
    label: "Operação",
    items: [
      { href: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { href: "/admin/companies", label: "Empresas", icon: Building2 },
      { href: "/admin/users", label: "Usuários", icon: Users },
      { href: "/admin/leads", label: "Leads comerciais", icon: UserPlus },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/admin/plans", label: "Planos e limites", icon: ChartColumn },
      { href: "/admin/finance", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    label: "Controle",
    items: [
      { href: "/admin/audit", label: "Auditoria", icon: Shield },
      { href: "/admin/system", label: "Sistema", icon: Activity },
      { href: "/admin/deploy", label: "Deploy", icon: Rocket },
    ],
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/admin/companies") {
    return pathname.startsWith("/admin/companies") || pathname.startsWith("/admin/tenants");
  }
  if (href === "/admin/leads") {
    return pathname.startsWith("/admin/leads") || pathname.startsWith("/admin/sales-leads");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readImp() {
  try {
    return sessionStorage.getItem("nexaflow_impersonating") === "1";
  } catch {
    return false;
  }
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const hydrate = useAuth((s) => s.hydrate);
  const logout = useAuth((s) => s.logout);
  const [impersonating, setImpersonating] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setImpersonating(readImp());
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("nf-panel-lock");
    return () => {
      document.documentElement.classList.remove("nf-panel-lock");
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (impersonating) {
      router.replace("/app");
    }
  }, [hydrated, user, impersonating, router]);

  const mfa = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () =>
      api<{ enabled: boolean; requiredForAdmin?: boolean }>("/auth/mfa/status"),
    enabled: hydrated && user?.platformRole === "SUPERADMIN" && !impersonating,
    staleTime: 60_000,
    retry: false,
  });

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07080c]">
        <Spinner />
      </div>
    );
  }

  if (!user || user.platformRole !== "SUPERADMIN") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07080c] px-6 text-center">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300/80">
            Administração
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white">Acesso restrito</h1>
          <p className="mt-2 text-[13px] text-white/50">
            Somente superadministradores entram nesta área.
          </p>
          <Link href="/login" className="admin-btn-primary mt-5">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  if (impersonating) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07080c]">
        <Spinner />
      </div>
    );
  }

  if (mfa.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07080c]">
        <Spinner />
      </div>
    );
  }

  if (mfa.data?.requiredForAdmin || isSuperadminMfaRequiredError(mfa.error)) {
    return (
      <div className="min-h-dvh bg-[#07080c]">
        <SuperadminMfaGate />
      </div>
    );
  }

  return (
    <div className="admin-platform relative flex min-h-dvh bg-[#07080c] text-[#e5e7eb]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -right-32 top-0 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          }}
        />
      </div>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-white/[0.06] bg-[#090a10]/95 backdrop-blur-sm transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <Logo variant="mark" size="sm" />
            <div className="leading-tight">
              <span className="block text-[13px] font-semibold tracking-tight text-white">
                NexaFlow
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                Admin
              </span>
            </div>
          </Link>
          <button type="button" className="admin-btn-ghost lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium",
                        active
                          ? "bg-violet-500/15 text-violet-100"
                          : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.7} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-semibold text-violet-100">
              {(user.name || user.email || "A")
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("") || "A"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-white/85">{user.name}</p>
              <p className="truncate text-[11px] text-white/35">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Link
              href="/app/account/security?from=admin"
              className="admin-btn-ghost h-8 flex-1 text-[12px]"
            >
              Conta
            </Link>
            <button
              type="button"
              className="admin-btn-ghost h-8 px-2"
              onClick={() => void logout().then(() => router.replace("/login"))}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-white/[0.06] px-4 lg:hidden">
          <button type="button" className="admin-btn-ghost" onClick={() => setOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-semibold">Administração</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
