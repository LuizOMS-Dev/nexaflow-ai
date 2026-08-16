"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CircleDollarSign,
  CreditCard,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wallet,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isSuperadminMfaRequiredError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, formatDate, pluralizePt } from "@/lib/utils";
import { useToast } from "@/components/ui-toast";
import { Modal, Skeleton } from "@/components/ui";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
} from "@/components/admin";

type SuperadminFinanceData = {
  periodDays: number;
  summary: {
    mrr: number;
    arr: number;
    avgTicket: number;
    paidSubscriptions: number;
    totalRealTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    cancelledTenants: number;
  };
  performance: {
    mrr: number;
    monthlyCosts: number;
    estimatedProfit: number;
    estimatedMargin: number;
    costsConfigured: boolean;
  };
  revenueByPlan: Array<{
    planId: string;
    planName: string;
    planSlug: string;
    isActive: boolean;
    catalogPrice: number | null;
    priceLabel: string;
    tenants: number;
    averageContractedPrice: number;
    mrr: number;
    sharePercentage: number;
  }>;
  recentSubscriptions: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    planName: string;
    planSlug: string;
    contractedPrice: number;
    catalogPrice: number | null;
    billingStatus: string;
    billingDueDay: number | null;
    currentPeriodEnd: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  trials: {
    total: number;
    expiringIn7Days: number;
    expired: number;
  };
  attention: {
    overdueCount: number;
    overdueMrrRisk: number;
    inconsistentEnterpriseCount: number;
  };
  history: {
    hasEnoughHistory: boolean;
    entries: Array<{ month: string; value: number }>;
  };
  recentFinancialActivity: Array<{
    id: string;
    action: string;
    entity: string;
    userName: string;
    tenantName: string | null;
    createdAt: string;
  }>;
  costsCount: number;
  note: string;
};

type PlatformCostItem = {
  id: string;
  name: string;
  category: string;
  amount: number;
  recurrence: string;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
};

const COST_CATEGORIES = [
  { value: "INFRASTRUCTURE", label: "Servidores & Nuvem (EasyPanel)" },
  { value: "WHATSAPP", label: "WhatsApp Gateway & WAHA" },
  { value: "AI", label: "Provedores de IA (OpenAI / Groq)" },
  { value: "EMAIL", label: "Envio de E-mails Transacionais" },
  { value: "DATABASE", label: "Banco de Dados & Redis" },
  { value: "SUPPORT", label: "Ferramentas & Suporte" },
  { value: "OTHER", label: "Outros Custos Fixos" },
];

export default function AdminFinancePage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCostsModalOpen, setIsCostsModalOpen] = useState(false);

  // Form states for new platform cost
  const [costName, setCostName] = useState("");
  const [costCategory, setCostCategory] = useState("INFRASTRUCTURE");
  const [costAmount, setCostAmount] = useState("");
  const [costRecurrence, setCostRecurrence] = useState("MONTHLY");
  const [costNotes, setCostNotes] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-finance"],
    queryFn: () => api<SuperadminFinanceData>("/admin/finance"),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const { data: costsList, isLoading: isLoadingCosts } = useQuery({
    queryKey: ["admin-finance-costs"],
    queryFn: () => api<PlatformCostItem[]>("/admin/finance/costs"),
    enabled: user?.platformRole === "SUPERADMIN" && isCostsModalOpen,
  });

  // Mutations
  const createCostMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      category: string;
      amount: number;
      recurrence: string;
      notes?: string | null;
    }) => api<PlatformCostItem>("/admin/finance/costs", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Custo operacional adicionado!");
      setCostName("");
      setCostAmount("");
      setCostNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-finance"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao adicionar custo");
    },
  });

  const toggleCostMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api<PlatformCostItem>(`/admin/finance/costs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-finance"] });
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/finance/costs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Custo removido!");
      queryClient.invalidateQueries({ queryKey: ["admin-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-finance"] });
    },
  });

  const handleCreateCostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(costAmount.replace(",", "."));
    if (!costName.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Preencha o nome e um valor válido maior que zero.");
      return;
    }
    createCostMutation.mutate({
      name: costName.trim(),
      category: costCategory,
      amount: amt,
      recurrence: costRecurrence,
      notes: costNotes.trim() || null,
    });
  };

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

  const s = data.summary;
  const perf = data.performance;
  const byPlan = data.revenueByPlan || [];
  const maxPlanMrr = Math.max(1, ...byPlan.map((r) => r.mrr || 0));

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial com descrição refinada e acessos */}
      <AdminPageHeader
        title="Financeiro"
        description="Acompanhe receita recorrente, contratos, custos e desempenho financeiro da plataforma."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsCostsModalOpen(true)}
              className="admin-btn-secondary inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Custos operacionais
            </button>
            <Link href="/admin/plans" className="admin-btn-secondary inline-flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Planos
            </Link>
          </div>
        }
      />

      {/* 2. Top 4 KPIs Oficiais */}
      <MetricGrid cols={4}>
        {/* KPI 1: MRR */}
        <MetricCard
          label="MRR"
          value={formatCurrency(s.mrr)}
          hint="Receita recorrente mensal contratada"
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
          compact
        />

        {/* KPI 2: ARR */}
        <MetricCard
          label="ARR"
          value={formatCurrency(s.arr)}
          hint="Receita recorrente anual estimada"
          icon={<TrendingUp className="h-4 w-4" />}
          tone="brand"
          compact
        />

        {/* KPI 3: Ticket médio mensal */}
        <MetricCard
          label="Ticket médio mensal"
          value={formatCurrency(s.avgTicket)}
          hint="Média mensal por empresa pagante"
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="info"
          compact
        />

        {/* KPI 4: Empresas pagantes */}
        <MetricCard
          label="Empresas pagantes"
          value={s.paidSubscriptions}
          hint={`${s.paidSubscriptions} de ${s.activeTenants} ${pluralizePt(s.activeTenants, "empresa ativa", "empresas ativas")}`}
          icon={<Users className="h-4 w-4" />}
          tone="violet"
          href="/admin/companies"
          compact
        />
      </MetricGrid>

      {/* 3. Desempenho Financeiro (Custos, Lucro Estimado e Margem Estimada) */}
      {perf.costsConfigured ? (
        <div className="rounded-xl border border-white/[0.08] bg-gradient-to-r from-violet-950/20 via-white/[0.02] to-transparent p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Desempenho Financeiro da Plataforma</h3>
              </div>
              <p className="mt-0.5 text-[12px] text-gray-400">
                Resultado operacional baseado no MRR contratado menos os custos fixos mensais da operação.
              </p>
            </div>
            <button
              onClick={() => setIsCostsModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              Gerenciar custos ({data.costsCount})
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-white/[0.06] pt-3.5">
            <div>
              <span className="text-[11px] font-medium text-gray-500 uppercase">Receita (MRR)</span>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">
                {formatCurrency(perf.mrr)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-gray-500 uppercase">Custos mensais</span>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-amber-300">
                {formatCurrency(perf.monthlyCosts)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-gray-500 uppercase">Lucro estimado</span>
              <p
                className={cn(
                  "mt-0.5 text-[15px] font-semibold tabular-nums",
                  perf.estimatedProfit >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {formatCurrency(perf.estimatedProfit)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-gray-500 uppercase">Margem estimada</span>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-violet-300">
                {perf.estimatedMargin.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="text-[13px] font-medium text-amber-200">
                Custos operacionais não configurados
              </p>
              <p className="text-[11.5px] text-amber-300/80">
                Configure os custos da operação (servidor, IA, WAHA, banco) para calcular lucro e margem estimados.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCostsModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
          >
            Configurar custos →
          </button>
        </div>
      )}

      {/* 4. Bloco Central: Receita por Plano & Evolução do MRR */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Esquerda: Receita por Plano */}
        <AdminSection
          title="Receita por plano"
          action={
            s.mrr > 0 ? (
              <span className="text-[12px] tabular-nums text-gray-400">
                Total{" "}
                <span className="font-semibold text-white">
                  {formatCurrency(s.mrr)}
                </span>
              </span>
            ) : undefined
          }
          flush
        >
          {s.mrr === 0 || byPlan.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CreditCard className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-[13.5px] font-semibold text-gray-200">Ainda não há receita recorrente</p>
              <p className="mt-1 max-w-sm text-[12px] text-gray-400">
                A distribuição por plano aparecerá quando houver assinaturas pagas ativas.
              </p>
              <Link
                href="/admin/plans"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3.5 py-1.5 text-[12px] font-medium text-gray-200 hover:bg-white/[0.08] transition-colors"
              >
                Ver planos comerciais →
              </Link>
            </div>
          ) : (
            <>
              <div className="hidden border-b border-white/[0.05] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] sm:gap-3 sm:px-5">
                <span>Plano</span>
                <span>Empresas</span>
                <span>Preço médio</span>
                <span>Share</span>
                <span className="text-right">MRR</span>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {byPlan.map((r) => {
                  const share = r.sharePercentage || 0;
                  const barW = Math.max(3, ((r.mrr || 0) / maxPlanMrr) * 100);
                  return (
                    <li
                      key={r.planId}
                      className="grid gap-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3 sm:px-5"
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
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Catálogo: {r.priceLabel}
                        </p>
                      </div>
                      <p className="text-[13px] tabular-nums text-gray-300">
                        <span className="sm:hidden text-gray-500">Empresas · </span>
                        {r.tenants}
                      </p>
                      <p className="text-[13px] tabular-nums text-gray-400">
                        <span className="sm:hidden text-gray-500">Preço médio · </span>
                        {r.tenants > 0 ? formatCurrency(r.averageContractedPrice) : "—"}
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
                      <p className="text-[13.5px] font-semibold tabular-nums text-white sm:text-right">
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

        {/* Direita: Evolução do MRR */}
        <AdminSection title="Evolução do MRR" flush>
          {data.history.hasEnoughHistory ? (
            <div className="p-4 space-y-3">
              {data.history.entries.map((entry) => (
                <div key={entry.month} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-gray-300">{entry.month}</span>
                  <span className="font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Clock className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-[13.5px] font-semibold text-gray-200">
                Ainda não há histórico financeiro suficiente
              </p>
              <p className="mt-1 max-w-sm text-[12px] text-gray-400">
                A evolução do MRR aparecerá conforme novos ciclos forem registrados.
              </p>
            </div>
          )}
        </AdminSection>
      </div>

      {/* 5. Assinaturas Recentes */}
      <AdminSection
        title="Assinaturas recentes"
        action={
          <span className="text-[12px] text-gray-400">
            {data.recentSubscriptions.length} exibidas
          </span>
        }
        flush
      >
        {data.recentSubscriptions.length === 0 ? (
          <div className="p-6 text-center text-[12.5px] text-gray-500">
            Nenhuma assinatura registrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-white/[0.05] text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  <th className="py-2.5 px-4">Empresa</th>
                  <th className="py-2.5 px-4">Plano</th>
                  <th className="py-2.5 px-4">Valor contratado</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Próximo vencimento</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.recentSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-white">{sub.tenantName}</p>
                      <p className="text-[11px] text-gray-500">{sub.tenantSlug}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      <span className="inline-flex rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-gray-300">
                        {sub.planName}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold tabular-nums text-white">
                      {formatCurrency(sub.contractedPrice)}/mês
                    </td>
                    <td className="py-3 px-4">
                      {sub.billingStatus === "ACTIVE" ? (
                        <StatusBadge tone="success">Ativa</StatusBadge>
                      ) : sub.billingStatus === "TRIAL" ? (
                        <StatusBadge tone="brand">Trial</StatusBadge>
                      ) : sub.billingStatus === "PAST_DUE" ? (
                        <StatusBadge tone="danger">Atrasada</StatusBadge>
                      ) : sub.billingStatus === "SUSPENDED" ? (
                        <StatusBadge tone="warning">Suspensa</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">{sub.billingStatus}</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-300 tabular-nums">
                      {sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/companies/${sub.tenantId}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        Abrir
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      {/* 6. Trials & Atenção Financeira */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trials */}
        <AdminSection title="Trials" flush>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center border-b border-white/[0.06] pb-3">
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase">Ativos</span>
                <p className="mt-0.5 text-[18px] font-bold text-white tabular-nums">
                  {data.trials.total}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase">Vencem em 7 dias</span>
                <p className="mt-0.5 text-[18px] font-bold text-amber-300 tabular-nums">
                  {data.trials.expiringIn7Days}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium text-gray-500 uppercase">Vencidos</span>
                <p className="mt-0.5 text-[18px] font-bold text-red-400 tabular-nums">
                  {data.trials.expired}
                </p>
              </div>
            </div>
            <p className="text-[12px] text-gray-400 text-center">
              Empresas em período de teste gratuito da plataforma.
            </p>
          </div>
        </AdminSection>

        {/* Atenção Financeira / Inadimplência */}
        <AdminSection title="Atenção financeira" flush>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <span className="text-[12.5px] font-medium text-white">Contratos em atraso</span>
              </div>
              <span className="font-semibold tabular-nums text-red-400 text-[13px]">
                {data.attention.overdueCount} {pluralizePt(data.attention.overdueCount, "empresa", "empresas")}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <span className="text-[12.5px] text-gray-300">MRR em risco de churn</span>
              <span className="font-semibold tabular-nums text-amber-300 text-[13px]">
                {formatCurrency(data.attention.overdueMrrRisk)}
              </span>
            </div>

            {data.attention.inconsistentEnterpriseCount > 0 && (
              <div className="flex items-center justify-between text-[12px] text-amber-300">
                <span>Enterprise sem valor contratado acordado:</span>
                <span className="font-bold">{data.attention.inconsistentEnterpriseCount}</span>
              </div>
            )}
          </div>
        </AdminSection>
      </div>

      {/* MODAL: Custos Operacionais da Plataforma */}
      <Modal
        open={isCostsModalOpen}
        onClose={() => setIsCostsModalOpen(false)}
        title="Custos Operacionais da Plataforma"
        description="Configure os custos fixos mensais do NexaFlow (servidor, IA, banco, WAHA) para calcular o lucro estimado."
        size="lg"
      >
        <div className="space-y-5">
          {/* Formulário para novo custo */}
          <form onSubmit={handleCreateCostSubmit} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
            <p className="text-[12.5px] font-semibold text-white">Adicionar Custo da Plataforma</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <input
                type="text"
                placeholder="Nome (ex: Servidor EasyPanel)"
                value={costName}
                onChange={(e) => setCostName(e.target.value)}
                required
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white focus:border-violet-500 focus:outline-none sm:col-span-2"
              />
              <select
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white focus:border-violet-500 focus:outline-none"
              >
                {COST_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="R$ / mês"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12.5px] text-white focus:border-violet-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={createCostMutation.isPending}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50 shrink-0"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </form>

          {/* Lista de custos cadastrados */}
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Custos Operacionais ({costsList?.length || 0})
            </p>
            {isLoadingCosts ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !costsList || costsList.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-gray-500">
                Nenhum custo operacional cadastrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-white/[0.02]">
                {costsList.map((cost) => (
                  <li key={cost.id} className="flex items-center justify-between p-3 text-[12.5px]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-medium", cost.isActive ? "text-white" : "text-gray-500 line-through")}>
                          {cost.name}
                        </span>
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] text-gray-400">
                          {cost.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">Recorrência mensal</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={cn("font-bold tabular-nums", cost.isActive ? "text-amber-300" : "text-gray-600")}>
                        {formatCurrency(cost.amount)}/mês
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCostMutation.mutate({ id: cost.id, isActive: !cost.isActive })}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                          cost.isActive
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                        )}
                      >
                        {cost.isActive ? "Ativo" : "Pausado"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Excluir custo "${cost.name}"?`)) {
                            deleteCostMutation.mutate(cost.id);
                          }
                        }}
                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
