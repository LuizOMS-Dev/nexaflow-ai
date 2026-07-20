"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, LogOut, ShieldOff, CreditCard, LifeBuoy } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import type { AccessState } from "@/lib/access-gate";
import { Logo } from "@/components/brand/logo";
import { Spinner } from "@/components/ui";

/**
 * Envolve o shell do tenant: consulta Access Gate e mostra
 * tela de bloqueio / aviso de pagamento conforme o backend.
 */
export function AccessGateShell({ children }: { children: React.ReactNode }) {
  const { tenant, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const enabled = Boolean(tenant?.id) && !pathname?.startsWith("/admin");

  const access = useQuery({
    queryKey: ["access-state", tenant?.id, user?.id],
    queryFn: () => api<AccessState>("/auth/access-state"),
    enabled,
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 403) return false;
      return count < 1;
    },
  });

  // Superadmin global / sem tenant: não aplica (render shell normal)
  if (!enabled) return <>{children}</>;

  if (access.isLoading && !access.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] dark:bg-[#0B0C10]">
        <Spinner />
      </div>
    );
  }

  const state = access.data;

  // Fallback se 403 com código de gate
  if (access.isError && access.error instanceof ApiError) {
    const code = access.error.code || "USER_DISABLED";
    if (
      code.startsWith("USER_") ||
      code.startsWith("COMPANY_") ||
      code.startsWith("PAYMENT_") ||
      code.startsWith("TENANT_") ||
      code === "MEMBERSHIP_INACTIVE"
    ) {
      return (
        <BlockedScreen
          title="Acesso indisponível"
          message={access.error.message}
          code={code}
          onLogout={() => void logout().finally(() => router.push("/login"))}
        />
      );
    }
  }

  if (!state) return <>{children}</>;

  // Bloqueio total — sem sidebar/painel
  if (state.level === "BLOCKED") {
    return (
      <BlockedScreen
        title={state.title}
        message={state.message}
        code={state.code}
        publicReason={state.publicReason}
        showBilling={false}
        onLogout={() => void logout().finally(() => router.push("/login"))}
      />
    );
  }

  // Restrito: tela dedicada (exceto settings/account se admin pode cobrança)
  if (state.level === "RESTRICTED") {
    const allowPath =
      pathname?.startsWith("/app/settings") || pathname?.startsWith("/app/account");
    if (!allowPath) {
      return (
        <BlockedScreen
          title={state.title}
          message={state.message}
          code={state.code}
          publicReason={state.publicReason}
          showBilling={state.capabilities.canAccessBilling}
          impersonating={state.impersonating}
          onLogout={() => void logout().finally(() => router.push("/login"))}
        />
      );
    }
  }

  // FULL / WARNING / RESTRICTED em rota permitida → shell + banners
  return (
    <>
      {state.warningBanner ? (
        <div className="fixed inset-x-0 top-0 z-[60]">
          <PaymentWarningBanner banner={state.warningBanner} daysOverdue={state.daysOverdue} />
        </div>
      ) : null}
      {state.impersonating && state.operationalPaused ? (
        <div
          className="fixed inset-x-0 top-0 z-[60] border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 text-center text-[12px] text-amber-900 dark:text-amber-100"
          role="status"
        >
          Modo administrativo · empresa com operações pausadas ({state.code})
        </div>
      ) : null}
      <div
        className={cn(
          (state.warningBanner || (state.impersonating && state.operationalPaused)) &&
            "pt-12"
        )}
      >
        {children}
      </div>
    </>
  );
}

function PaymentWarningBanner({
  banner,
  daysOverdue,
}: {
  banner: NonNullable<AccessState["warningBanner"]>;
  daysOverdue: number | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        "border-amber-500/20 bg-amber-500/[0.07] dark:border-amber-400/20 dark:bg-amber-500/[0.1]"
      )}
      role="status"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
          strokeWidth={1.75}
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-amber-950 dark:text-amber-50">
            {banner.title}
            {daysOverdue != null && daysOverdue > 0 ? (
              <span className="ml-1.5 font-normal opacity-80">
                · {daysOverdue} dia{daysOverdue === 1 ? "" : "s"} em atraso
              </span>
            ) : null}
          </p>
          <p className="text-[12px] text-amber-900/[0.85] dark:text-amber-100/80">{banner.body}</p>
        </div>
      </div>
      {banner.ctaHref && banner.ctaLabel ? (
        <Link
          href={banner.ctaHref}
          className="btn-secondary h-8 shrink-0 border-amber-600/20 px-3 text-[12px] dark:border-amber-400/25"
        >
          {banner.ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

function BlockedScreen({
  title,
  message,
  code,
  publicReason,
  showBilling,
  impersonating,
  onLogout,
}: {
  title: string;
  message: string;
  code: string;
  publicReason?: string | null;
  showBilling?: boolean;
  impersonating?: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-0px)] flex-col items-center justify-center bg-[#F4F5F7] px-4 dark:bg-[#0B0C10]">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 shadow-xl dark:border-white/[0.08] dark:bg-[#12151c]">
        <div className="mb-6 flex justify-center">
          <Logo size="md" />
        </div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
          <ShieldOff className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h1 className="text-center font-display text-lg font-semibold text-ink dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-center text-[13.5px] leading-relaxed text-ink-secondary dark:text-gray-300">
          {message}
        </p>
        {publicReason ? (
          <p className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2 text-center text-[12px] text-ink-muted dark:bg-white/[0.04]">
            {publicReason}
          </p>
        ) : null}
        {impersonating ? (
          <p className="mt-3 text-center text-[11.5px] text-amber-700 dark:text-amber-300">
            Modo administrativo — operações da empresa permanecem pausadas.
          </p>
        ) : null}
        <p className="mt-4 text-center text-[10.5px] uppercase tracking-wide text-ink-faint">
          {code}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {showBilling ? (
            <Link href="/app/settings" className="btn-primary h-10 w-full justify-center gap-2">
              <CreditCard className="h-4 w-4" strokeWidth={1.75} />
              Ver cobrança / plano
            </Link>
          ) : null}
          <Link
            href="/#demonstracao"
            className="btn-secondary h-10 w-full justify-center gap-2"
          >
            <LifeBuoy className="h-4 w-4" strokeWidth={1.75} />
            Falar com atendimento
          </Link>
          <button
            type="button"
            className="btn-ghost h-10 w-full justify-center gap-2 text-ink-muted"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
