"use client";

import Link from "next/link";
import {
  CircleDollarSign,
  CreditCard,
  Info,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency } from "@/lib/utils";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
} from "@/components/admin";

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
      isActive?: boolean;
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

function moneyOrDash(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatCurrency(n);
}

export default function AdminFinancePage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) return <AdminPageSkeleton metrics={4} />;

  if (error || !data) {
    if (isSuperadminMfaRequiredError(error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar o financeiro"
        description="Verifique a conexão e tente novamente."
        onRetry={() => void refetch()}
      />
    );
  }

  const fin = data.finance;
  const s = data.stats;

  const paid = fin?.paidSubscriptions ?? s.paidSubscriptions ?? 0;
  const trials = s.trialTenants ?? 0;
  const mrr = fin?.mrr ?? s.mrr;
  const arr = fin?.arr ?? s.arr;
  const ticket = fin?.avgTicket ?? s.avgTicket;
  const byPlan = fin?.revenueByPlan ?? [];
  const costsOk = Boolean(fin?.costsAvailable);
  const totalPlanMrr = byPlan.reduce((acc, r) => acc + (r.mrr || 0), 0);
  const maxPlanMrr = Math.max(1, ...byPlan.map((r) => r.mrr || 0));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Financeiro"
        description="MRR e ARR estimados a partir de contratos ativos (não caixa recebido)."
        actions={
          <Link href="/admin/plans" className="admin-btn-secondary">
            <CreditCard className="h-3.5 w-3.5" />
            Planos
          </Link>
        }
      />

      <MetricGrid cols={4}>
        <MetricCard
          label="MRR"
          value={moneyOrDash(mrr)}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          compact
        />
        <MetricCard
          label="ARR"
          value={moneyOrDash(arr)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="brand"
          compact
        />
        <MetricCard
          label="Ticket"
          value={moneyOrDash(ticket)}
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="info"
          compact
        />
        <MetricCard
          label="Pagas"
          value={paid}
          hint={trials > 0 ? `${trials} trial` : undefined}
          icon={<Users className="h-4 w-4" />}
          tone="violet"
          href="/admin/companies"
          compact
        />
      </MetricGrid>

      {!costsOk ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-300/90" strokeWidth={1.75} />
            <p className="text-[12.5px] text-amber-100/90">
              Custos não configurados — lucro estimado indisponível.
            </p>
          </div>
          <StatusBadge tone="warning" className="shrink-0">
            Lucro off
          </StatusBadge>
        </div>
      ) : null}

      <AdminSection
        title="Receita por plano"
        action={
          byPlan.length > 0 ? (
            <span className="text-[12px] tabular-nums text-gray-400">
              Total{" "}
              <span className="font-semibold text-white">
                {formatCurrency(totalPlanMrr)}
              </span>
            </span>
          ) : undefined
        }
        flush
      >
        {byPlan.length === 0 ? (
          <AdminEmptyState
            title="Nenhum plano com receita ainda"
            description="Quando houver assinaturas pagas, o MRR por plano aparece aqui."
            compact
          />
        ) : (
          <>
            <div className="hidden border-b border-white/[0.05] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] sm:gap-3 sm:px-5">
              <span>Plano</span>
              <span>Empresas</span>
              <span>Preço catálogo</span>
              <span>Share</span>
              <span className="text-right">MRR</span>
            </div>
            <ul className="divide-y divide-white/[0.05]">
              {byPlan.map((r) => {
                const n = r.tenants ?? 0;
                const share =
                  totalPlanMrr > 0
                    ? Math.round(((r.mrr || 0) / totalPlanMrr) * 100)
                    : 0;
                const barW = Math.max(3, ((r.mrr || 0) / maxPlanMrr) * 100);
                return (
                  <li
                    key={r.planId}
                    className="grid gap-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-white">
                          {r.planName}
                        </p>
                        {r.isActive === false ? (
                          <StatusBadge tone="neutral">Inativo</StatusBadge>
                        ) : null}
                      </div>
                      {r.planSlug ? (
                        <p className="mt-0.5 text-[11px] text-gray-500">{r.planSlug}</p>
                      ) : null}
                    </div>
                    <p className="text-[13px] tabular-nums text-gray-300">
                      <span className="sm:hidden text-gray-500">Empresas · </span>
                      {n}
                    </p>
                    <p className="text-[13px] tabular-nums text-gray-400">
                      <span className="sm:hidden text-gray-500">Preço · </span>
                      {catalogPriceDisplay(r)}
                      {!r.priceOnRequest &&
                      r.planSlug !== "enterprise" &&
                      r.priceMonthly != null &&
                      r.priceMonthly > 0 ? (
                        <span className="text-gray-600">/mês</span>
                      ) : null}
                    </p>
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2 sm:justify-start sm:gap-2">
                        <span className="text-[11px] tabular-nums text-gray-500 sm:hidden">
                          Share
                        </span>
                        <span className="text-[11.5px] font-medium tabular-nums text-gray-400">
                          {share}%
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                    <p
                      className={cn(
                        "text-[13.5px] font-semibold tabular-nums text-white sm:text-right"
                      )}
                    >
                      <span className="font-normal text-gray-500 sm:hidden">MRR · </span>
                      {formatCurrency(r.mrr)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </AdminSection>
    </div>
  );
}
