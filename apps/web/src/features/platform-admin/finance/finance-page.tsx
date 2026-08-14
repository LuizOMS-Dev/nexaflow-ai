"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import {
  EmptyHint,
  ErrorHint,
  PageHeader,
  Panel,
  ProgressBar,
  Skeleton,
  StatCard,
} from "../ui";

export function FinancePage() {
  const user = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => platformAdminApi.overview(),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
    staleTime: 20_000,
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return (
      <ErrorHint title="Não foi possível carregar o financeiro" onRetry={() => void q.refetch()} />
    );
  }

  const fin = q.data.finance;
  const s = q.data.stats;
  const rows = fin?.revenueByPlan || [];
  const maxMrr = Math.max(1, ...rows.map((r) => r.mrr || 0));

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Receita estimada a partir dos contratos ativos. Não é caixa recebido nem lucro."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/companies?financial=OVERDUE" className="admin-btn-secondary h-9">
              Atrasos
            </Link>
            <Link href="/admin/companies?financial=DUE_SOON" className="admin-btn-secondary h-9">
              Vence em breve
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR estimado" value={formatCurrency(fin?.mrr ?? s.mrr ?? 0)} />
        <StatCard label="ARR estimado" value={formatCurrency(fin?.arr ?? s.arr ?? 0)} />
        <StatCard
          label="Ticket médio"
          value={formatCurrency(fin?.avgTicket ?? s.avgTicket ?? 0)}
        />
        <StatCard
          label="Assinaturas pagas"
          value={fin?.paidSubscriptions ?? s.paidSubscriptions ?? 0}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Por plano">
          {rows.length === 0 ? (
            <EmptyHint title="Sem dados de receita">
              Empresas com plano pago e status ativo passam a entrar no MRR.
            </EmptyHint>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.planId}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-white/80">
                      {r.planName}
                      <span className="ml-1.5 text-white/40">· {r.tenants} empresas</span>
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-white">
                      {r.priceOnRequest && r.mrr === 0
                        ? r.priceLabel || "Sob consulta"
                        : formatCurrency(r.mrr)}
                    </span>
                  </div>
                  <ProgressBar value={r.mrr || 0} max={maxMrr} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Como ler estes números">
          <p className="text-[13px] leading-relaxed text-white/55">
            {fin?.note ||
              "MRR soma o valor contratado das empresas ativas. Lucro não aparece porque custos da plataforma ainda não estão cadastrados."}
          </p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-white/45">
            <li>· Preço de catálogo ≠ valor contratado na empresa</li>
            <li>· Trial e plano free não entram no MRR</li>
            <li>· Inadimplência e atraso ficam em Empresas</li>
          </ul>
          {!fin?.costsAvailable ? (
            <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-100/80">
              Lucro indisponível — cadastre custos da plataforma antes de exibir margem.
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
