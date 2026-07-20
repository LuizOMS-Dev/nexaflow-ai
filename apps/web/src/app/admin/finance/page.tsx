"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CircleDollarSign,
  Info,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency } from "@/lib/utils";
import { EmptyState, Spinner } from "@/components/ui";
import { AdminPageHeader } from "../admin-page-header";

type Overview = {
  stats: {
    mrr?: number;
    arr?: number;
    avgTicket?: number;
    paidSubscriptions?: number;
    trialTenants?: number;
    activeTenants?: number;
  };
  finance?: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    revenueByPlan: Array<{
      planId: string;
      planName: string;
      planSlug?: string;
      priceMonthly: number | null;
      priceOnRequest?: boolean;
      priceLabel?: string;
      tenants: number;
      mrr: number;
    }>;
    costsAvailable: boolean;
    profitAvailable: boolean;
    note: string;
  };
};

function catalogPriceDisplay(r: {
  priceOnRequest?: boolean;
  priceLabel?: string;
  priceMonthly: number | null;
  planSlug?: string;
}): string {
  if (r.priceLabel) return r.priceLabel;
  if (r.priceOnRequest || r.planSlug === "enterprise") return "Sob consulta";
  if (r.priceMonthly == null || r.priceMonthly <= 0) return "Sob consulta";
  return formatCurrency(r.priceMonthly);
}

function FinanceKpi({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="group relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-2xl border border-black/[0.05] bg-white p-4 transition-[border-color,background-color] duration-200 hover:border-violet-500/20 dark:border-white/[0.07] dark:bg-[#14171e]/[0.55] dark:hover:border-violet-400/20 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
          {label}
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/[0.04] bg-black/[0.02] text-ink-muted transition-colors group-hover:border-violet-500/[0.15] group-hover:text-violet-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:group-hover:text-violet-300">
          {icon}
        </span>
      </div>
      <div className="mt-3 min-w-0">
        <p className="font-display text-[1.55rem] font-semibold leading-none tracking-tight text-ink tabular-nums dark:text-white sm:text-[1.7rem]">
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-[11.5px] leading-snug text-ink-faint">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminFinancePage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    enabled: user?.platformRole === "SUPERADMIN",
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <EmptyState title="Não foi possível carregar o financeiro. Tente novamente." />
    );
  }

  const fin = data.finance;
  const s = data.stats;

  const paid = fin?.paidSubscriptions ?? s.paidSubscriptions ?? 0;
  const trials = s.trialTenants ?? 0;
  const mrr = fin?.mrr ?? s.mrr ?? 0;
  const arr = fin?.arr ?? s.arr ?? 0;
  const ticket = fin?.avgTicket ?? s.avgTicket ?? 0;
  const byPlan = fin?.revenueByPlan ?? [];
  const profitOk = Boolean(fin?.profitAvailable && fin?.costsAvailable);
  const totalPlanMrr = byPlan.reduce((acc, r) => acc + (r.mrr || 0), 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      <AdminPageHeader
        title="Financeiro"
      />

      {/* KPIs */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceKpi
          label="MRR estimado"
          value={formatCurrency(mrr)}
          hint="Contratos ativos"
          icon={<Wallet className="h-3.5 w-3.5" strokeWidth={1.75} />}
        />
        <FinanceKpi
          label="ARR estimado"
          value={formatCurrency(arr)}
          hint="MRR × 12"
          icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />}
        />
        <FinanceKpi
          label="Ticket médio"
          value={formatCurrency(ticket)}
          hint={paid === 0 ? "Sem assinaturas pagas" : "MRR ÷ assinaturas pagas"}
          icon={<CircleDollarSign className="h-3.5 w-3.5" strokeWidth={1.75} />}
        />
        <FinanceKpi
          label="Assinaturas pagas"
          value={paid}
          hint={
            paid === 0
              ? undefined
              : trials > 0
                ? `${trials} em trial`
                : undefined
          }
          icon={<Users className="h-3.5 w-3.5" strokeWidth={1.75} />}
        />
      </div>

      {trials > 0 ? (
        <p className="mb-4 text-[12px] text-ink-muted">
          Em trial:{" "}
          <span className="font-semibold tabular-nums text-ink dark:text-white">{trials}</span>
          <span className="text-ink-faint"> · não entram no MRR estimado</span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
        {/* Receita por plano */}
        <section className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white dark:border-white/[0.07] dark:bg-[#14171e]/40">
          <div className="flex items-start justify-between gap-3 border-b border-black/[0.04] px-5 py-4 dark:border-white/[0.06]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                  Receita por plano
                </h2>
              </div>
            </div>
            {byPlan.length > 0 ? (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  Total
                </p>
                <p className="font-display text-sm font-semibold tabular-nums text-ink dark:text-white">
                  {formatCurrency(totalPlanMrr)}
                </p>
              </div>
            ) : null}
          </div>

          {byPlan.length ? (
            <div>
              <div className="hidden border-b border-black/[0.03] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4 dark:border-white/[0.04]">
                <span>Plano</span>
                <span>Empresas</span>
                <span>Preço catálogo</span>
                <span className="text-right">MRR</span>
              </div>
              <ul>
                {byPlan.map((r, idx) => {
                  const n = r.tenants ?? 0;
                  const share =
                    totalPlanMrr > 0 ? Math.round(((r.mrr || 0) / totalPlanMrr) * 100) : 0;
                  return (
                    <li
                      key={r.planId}
                      className={cn(
                        "grid gap-1.5 px-5 py-3.5 transition-colors sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4",
                        idx !== byPlan.length - 1 &&
                          "border-b border-black/[0.035] dark:border-white/[0.045]",
                        "hover:bg-black/[0.015] dark:hover:bg-white/[0.02]"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-ink dark:text-white">
                          {r.planName}
                        </p>
                        {r.planSlug ? (
                          <p className="mt-0.5 text-[11px] text-ink-faint">{r.planSlug}</p>
                        ) : null}
                      </div>
                      <p className="text-[13px] tabular-nums text-ink-secondary dark:text-gray-300">
                        <span className="sm:hidden text-ink-faint">Empresas · </span>
                        {n}{" "}
                        <span className="text-ink-faint">
                          {n === 1 ? "empresa" : "empresas"}
                        </span>
                      </p>
                      <p className="text-[13px] tabular-nums text-ink-muted">
                        <span className="sm:hidden text-ink-faint">Preço · </span>
                        {catalogPriceDisplay(r)}
                        {!r.priceOnRequest &&
                        r.planSlug !== "enterprise" &&
                        r.priceMonthly != null &&
                        r.priceMonthly > 0 ? (
                          <span className="text-ink-faint">/mês</span>
                        ) : null}
                      </p>
                      <div className="sm:text-right">
                        <p className="text-[13.5px] font-semibold tabular-nums text-ink dark:text-white">
                          <span className="font-normal text-ink-faint sm:hidden">MRR · </span>
                          {formatCurrency(r.mrr)}
                        </p>
                        {totalPlanMrr > 0 && n > 0 ? (
                          <p className="mt-0.5 text-[10px] text-ink-faint">{share}% do MRR</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-ink-muted">
              Nenhum plano com dados de receita ainda.
            </p>
          )}

          <div className="border-t border-black/[0.04] px-5 py-3 dark:border-white/[0.06]">
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              Valores baseados em contratos ativos — não em caixa recebido.
            </p>
          </div>
        </section>

        {/* Lucro — insight administrativo */}
        <section className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-gradient-to-b from-violet-500/[0.04] to-transparent p-5 dark:border-white/[0.07] dark:from-violet-400/[0.06] dark:to-transparent sm:p-6">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-500/[0.06] blur-2xl dark:bg-violet-400/[0.08]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                  Lucro
                </p>
                <p className="mt-2 font-display text-lg font-semibold text-ink dark:text-white">
                  {profitOk ? "Disponível" : "Indisponível"}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  profitOk
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-black/[0.06] bg-black/[0.03] text-ink-muted dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                )}
              >
                <Info className="h-3 w-3" strokeWidth={2} />
                {profitOk ? "Ativo" : "Em preparação"}
              </span>
            </div>

            {profitOk ? (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary dark:text-gray-300">
                Custos da plataforma cadastrados. A margem estimada pode ser calculada sobre o
                MRR.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-secondary dark:text-gray-300">
                  Cadastre os custos da plataforma para calcular margem e lucro.
                </p>
                <p className="text-[11px] text-ink-faint">
                  Enquanto não houver custos cadastrados, a plataforma não exibe uma margem estimada.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
