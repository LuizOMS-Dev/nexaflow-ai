"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  TrendingUp,
  CircleDollarSign,
  Users,
  Plus,
  Receipt,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  Trash2,
  Check,
  Search,
  ArrowRight,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate, pluralizePt } from "@/lib/utils";
import { useToast } from "@/components/ui-toast";
import { Modal, Skeleton } from "@/components/ui";

type FinanceOverview = {
  periodDays: number;
  stats: {
    mrr: number;
    arr: number;
    periodRevenue: number;
    avgTicket: number;
    payingClientsCount: number;
    activeChargesCount: number;
    pendingChargesCount: number;
    paidChargesCount: number;
  };
  performance: {
    mrr: number;
    monthlyCosts: number;
    estimatedProfit: number;
    estimatedMargin: number;
    costsConfigured: boolean;
  };
  revenueByCategory: Array<{
    category: string;
    label: string;
    amount: number;
    count: number;
    sharePercentage: number;
  }>;
  upcomingCharges: Array<{
    id: string;
    title: string;
    amount: number;
    dueAt: string;
    status: string;
    category: string;
    categoryLabel: string;
    contactName: string;
  }>;
  overdueSummary: {
    count: number;
    totalAmount: number;
    clientsCount: number;
    items: Array<{
      id: string;
      title: string;
      amount: number;
      dueAt: string;
      status: string;
      contactName: string;
    }>;
  };
  history: {
    hasEnoughHistory: boolean;
    entries: Array<{ month: string; value: number }>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    userName: string;
    createdAt: string;
  }>;
  costsCount: number;
};

type ChargeItem = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  amount: number;
  recurrence: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  dueAt: string;
  paidAt?: string | null;
  notes?: string | null;
  contact?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
  } | null;
  createdAt: string;
};

type CostItem = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  amount: number;
  recurrence: string;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
};

type ContactOption = {
  id: string;
  name: string;
  company?: string | null;
};

const CATEGORIES = [
  { value: "SUBSCRIPTION", label: "Assinatura / Mensalidade" },
  { value: "SERVICE", label: "Prestação de Serviço" },
  { value: "PRODUCT", label: "Produto / Licença" },
  { value: "ONE_TIME", label: "Cobrança Única" },
  { value: "OTHER", label: "Outros" },
];

const RECURRENCES = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "ANNUAL", label: "Anual" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "ONE_TIME", label: "Cobrança Única" },
];

const COST_CATEGORIES = [
  { value: "TEAM", label: "Equipe & Colaboradores" },
  { value: "TOOLS", label: "Ferramentas & Softwares" },
  { value: "ADS", label: "Anúncios & Tráfego" },
  { value: "INFRASTRUCTURE", label: "Servidores & Nuvem" },
  { value: "SUPPORT", label: "Atendimento & Suporte" },
  { value: "OTHER", label: "Outros Custos" },
];

export default function TenantFinancePage() {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [chargeStatusFilter, setChargeStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewChargeOpen, setIsNewChargeOpen] = useState(false);
  const [isCostsOpen, setIsCostsOpen] = useState(false);

  // Form states for New Charge
  const [newChargeTitle, setNewChargeTitle] = useState("");
  const [newChargeContactId, setNewChargeContactId] = useState("");
  const [newChargeCategory, setNewChargeCategory] = useState("SUBSCRIPTION");
  const [newChargeAmount, setNewChargeAmount] = useState("");
  const [newChargeRecurrence, setNewChargeRecurrence] = useState("MONTHLY");
  const [newChargeDueAt, setNewChargeDueAt] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [newChargeNotes, setNewChargeNotes] = useState("");

  // Form states for New Cost
  const [newCostName, setNewCostName] = useState("");
  const [newCostCategory, setNewCostCategory] = useState("TOOLS");
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostRecurrence, setNewCostRecurrence] = useState("MONTHLY");
  const [newCostNotes, setNewCostNotes] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const {
    data: overview,
    isLoading: isLoadingOverview,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ["tenant-finance-overview", periodDays],
    queryFn: () => api<FinanceOverview>(`/finance/overview?days=${periodDays}`),
  });

  const { data: chargesData, isLoading: isLoadingCharges } = useQuery({
    queryKey: ["tenant-finance-charges", chargeStatusFilter, searchQuery],
    queryFn: () =>
      api<{ items: ChargeItem[]; total: number }>(
        `/finance/charges?status=${chargeStatusFilter}&search=${encodeURIComponent(searchQuery)}`
      ),
  });

  const { data: costsList, isLoading: isLoadingCosts } = useQuery({
    queryKey: ["tenant-finance-costs"],
    queryFn: () => api<CostItem[]>("/finance/costs"),
    enabled: isCostsOpen,
  });

  const { data: contactsList } = useQuery({
    queryKey: ["tenant-contacts-picker"],
    queryFn: () => api<{ items: ContactOption[] }>("/contacts?limit=100"),
    enabled: isNewChargeOpen,
  });

  // Mutations
  const createChargeMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      contactId?: string | null;
      category: string;
      amount: number;
      recurrence: string;
      dueAt: string;
      notes?: string | null;
    }) => api<ChargeItem>("/finance/charges", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Cobrança criada com sucesso!");
      setIsNewChargeOpen(false);
      setNewChargeTitle("");
      setNewChargeContactId("");
      setNewChargeAmount("");
      setNewChargeNotes("");
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-charges"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar cobrança");
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (chargeId: string) =>
      api<ChargeItem>(`/finance/charges/${chargeId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "PAID" }),
      }),
    onSuccess: () => {
      toast.success("Cobrança marcada como paga!");
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-charges"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar cobrança");
    },
  });

  const deleteChargeMutation = useMutation({
    mutationFn: (chargeId: string) =>
      api(`/finance/charges/${chargeId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Cobrança removida!");
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-charges"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover cobrança");
    },
  });

  const createCostMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      category: string;
      amount: number;
      recurrence: string;
      notes?: string | null;
    }) => api<CostItem>("/finance/costs", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("Custo operacional adicionado!");
      setNewCostName("");
      setNewCostAmount("");
      setNewCostNotes("");
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao cadastrar custo");
    },
  });

  const toggleCostMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api<CostItem>(`/finance/costs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
    },
  });

  const deleteCostMutation = useMutation({
    mutationFn: (id: string) => api(`/finance/costs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Custo removido!");
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-costs"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-finance-overview"] });
    },
  });

  const handleCreateChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newChargeAmount.replace(",", "."));
    if (!newChargeTitle.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Preencha o título e um valor válido maior que zero.");
      return;
    }
    createChargeMutation.mutate({
      title: newChargeTitle.trim(),
      contactId: newChargeContactId || null,
      category: newChargeCategory,
      amount: amt,
      recurrence: newChargeRecurrence,
      dueAt: new Date(newChargeDueAt).toISOString(),
      notes: newChargeNotes.trim() || null,
    });
  };

  const handleCreateCostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newCostAmount.replace(",", "."));
    if (!newCostName.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Preencha o nome e um valor mensal válido.");
      return;
    }
    createCostMutation.mutate({
      name: newCostName.trim(),
      category: newCostCategory,
      amount: amt,
      recurrence: newCostRecurrence,
      notes: newCostNotes.trim() || null,
    });
  };

  if (overviewError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <h2 className="mt-3 text-base font-semibold text-white">Não foi possível carregar o financeiro</h2>
          <p className="mt-1 text-sm text-gray-400">Verifique a conexão e tente novamente.</p>
          <button
            onClick={() => void refetchOverview()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const s = overview?.stats;
  const perf = overview?.performance;
  const revenueByCategory = overview?.revenueByCategory || [];
  const maxCategoryAmount = Math.max(1, ...revenueByCategory.map((c) => c.amount));
  const charges = chargesData?.items || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* 1. Header com seletor de períodos e CTAs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            Financeiro
          </h1>
          <p className="mt-0.5 text-[13px] text-gray-400">
            Acompanhe receitas, cobranças, custos e desempenho financeiro da sua empresa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de período */}
          <div
            role="tablist"
            aria-label="Selecionar período de análise"
            className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5"
          >
            {[
              { days: 7, label: "7 dias" },
              { days: 30, label: "30 dias" },
              { days: 90, label: "90 dias" },
            ].map((p) => {
              const active = periodDays === p.days;
              return (
                <button
                  key={p.days}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriodDays(p.days)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500",
                    active
                      ? "bg-violet-600 font-semibold text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-200"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsCostsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-medium text-gray-200 hover:border-white/[0.15] hover:bg-white/[0.06] transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
            Custos
          </button>

          <button
            onClick={() => setIsNewChargeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-violet-500 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova cobrança
          </button>
        </div>
      </div>

      {/* 2. Top 4 KPIs da Empresa */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: MRR */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
              Receita recorrente
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="font-display text-[22px] font-bold tabular-nums text-white">
                {formatCurrency(s?.mrr || 0)}
              </p>
            )}
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              MRR mensal contratado
            </p>
          </div>
        </div>

        {/* KPI 2: Receita do período */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
              Receita do período
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="font-display text-[22px] font-bold tabular-nums text-white">
                {formatCurrency(s?.periodRevenue || 0)}
              </p>
            )}
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              Faturado nos últimos {periodDays} dias
            </p>
          </div>
        </div>

        {/* KPI 3: Ticket médio */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
              Ticket médio mensal
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="font-display text-[22px] font-bold tabular-nums text-white">
                {formatCurrency(s?.avgTicket || 0)}
              </p>
            )}
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              Média por cliente pagante
            </p>
          </div>
        </div>

        {/* KPI 4: Cobranças ativas */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
              Cobranças ativas
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="font-display text-[22px] font-bold tabular-nums text-white">
                {s?.activeChargesCount || 0}
              </p>
            )}
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              {s?.payingClientsCount || 0} {pluralizePt(s?.payingClientsCount || 0, "cliente pagante", "clientes pagantes")}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Desempenho Financeiro (Custos, Lucro e Margem Estimados) */}
      {perf?.costsConfigured ? (
        <div className="rounded-xl border border-white/[0.08] bg-gradient-to-r from-violet-950/20 via-white/[0.02] to-transparent p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Desempenho Financeiro Estimado</h3>
              </div>
              <p className="mt-0.5 text-[12px] text-gray-400">
                Resultado operacional baseado no MRR contratado menos os custos fixos mensais cadastrados.
              </p>
            </div>
            <button
              onClick={() => setIsCostsOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              Gerenciar custos ({overview?.costsCount || 0})
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
              <span className="text-[11px] font-medium text-gray-500 uppercase">Resultado estimado</span>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="text-[13px] font-medium text-amber-200">
                Custos operacionais não configurados
              </p>
              <p className="text-[11.5px] text-amber-300/80">
                Configure os custos da sua empresa (equipe, softwares, infraestrutura) para calcular resultado e margem estimados.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCostsOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
          >
            Configurar custos →
          </button>
        </div>
      )}

      {/* 4. Bloco Central: Receita por Categoria & Evolução de Receita */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Esquerda: Receita por Categoria */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Receita por Categoria</h3>
              <p className="mt-0.5 text-[11.5px] text-gray-400">
                Distribuição de receita recorrente mensal por tipo de produto/serviço.
              </p>
            </div>
            {s?.mrr && s.mrr > 0 ? (
              <span className="text-[12px] font-semibold tabular-nums text-violet-300">
                {formatCurrency(s.mrr)} total
              </span>
            ) : null}
          </div>

          {revenueByCategory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Receipt className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-[13px] font-medium text-gray-300">Ainda não há receita recorrente</p>
              <p className="mt-1 max-w-xs text-[11.5px] text-gray-500">
                Cadastre sua primeira cobrança ativa para visualizar a distribuição financeira.
              </p>
              <button
                onClick={() => setIsNewChargeOpen(true)}
                className="mt-3.5 inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-3 py-1.5 text-[12px] font-medium text-gray-200 hover:bg-white/[0.08] transition-colors"
              >
                <Plus className="h-3 w-3" />
                Nova cobrança
              </button>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {revenueByCategory.map((cat) => {
                const barWidth = Math.max(4, (cat.amount / maxCategoryAmount) * 100);
                return (
                  <li key={cat.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-medium text-gray-200">{cat.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-[11.5px]">{cat.count} {pluralizePt(cat.count, "cobrança", "cobranças")}</span>
                        <span className="font-semibold tabular-nums text-white">
                          {formatCurrency(cat.amount)}
                        </span>
                        <span className="text-violet-400 font-medium w-8 text-right tabular-nums text-[11.5px]">
                          {cat.sharePercentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Direita: Evolução Financeira */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="border-b border-white/[0.06] pb-3">
            <h3 className="text-sm font-semibold text-white">Evolução da Receita</h3>
            <p className="mt-0.5 text-[11.5px] text-gray-400">
              Histórico mensal de pagamentos efetivamente confirmados.
            </p>
          </div>

          {overview?.history.hasEnoughHistory ? (
            <div className="mt-4 space-y-3">
              {overview.history.entries.map((item) => (
                <div key={item.month} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-gray-300">{item.month}</span>
                  <span className="font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-[13px] font-medium text-gray-300">
                Ainda não há histórico financeiro suficiente
              </p>
              <p className="mt-1 max-w-xs text-[11.5px] text-gray-500">
                A evolução financeira aparecerá conforme novos ciclos de pagamento forem registrados.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 5. Tabela / Gestão de Cobranças da Empresa */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.06] pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Cobranças & Contratos</h3>
            <p className="mt-0.5 text-[11.5px] text-gray-400">
              Listagem de cobranças ativas, pendentes e pagamentos realizados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Campo de Busca */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar cliente ou título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-2.5 text-[12px] text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
              />
            </div>

            {/* Filtro de Status */}
            <select
              value={chargeStatusFilter}
              onChange={(e) => setChargeStatusFilter(e.target.value)}
              aria-label="Filtrar por status"
              className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[12px] text-gray-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="ALL">Todos os status</option>
              <option value="PENDING">Pendentes</option>
              <option value="PAID">Pagas</option>
              <option value="OVERDUE">Vencidas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>
        </div>

        {isLoadingCharges ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : charges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="h-9 w-9 text-gray-600 mb-2" />
            <p className="text-[13.5px] font-semibold text-gray-200">Nenhuma cobrança encontrada</p>
            <p className="mt-1 text-[12px] text-gray-400">
              {searchQuery || chargeStatusFilter !== "ALL"
                ? "Tente ajustar os filtros de busca."
                : "Cadastre cobranças para acompanhar seus recebimentos."}
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-white/[0.05] text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                  <th className="py-2.5 pr-4">Título & Cliente</th>
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4">Recorrência</th>
                  <th className="py-2.5 px-4">Vencimento</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Valor</th>
                  <th className="py-2.5 pl-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {charges.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-white">{c.title}</p>
                      <p className="text-[11.5px] text-gray-400">
                        {c.contact?.name || "Sem cliente vinculado"}
                        {c.contact?.company ? ` · ${c.contact.company}` : ""}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      <span className="inline-flex rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-gray-300">
                        {c.categoryLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-[11.5px]">
                      {c.recurrence === "MONTHLY"
                        ? "Mensal"
                        : c.recurrence === "ANNUAL"
                        ? "Anual"
                        : c.recurrence === "QUARTERLY"
                        ? "Trimestral"
                        : "Cobrança única"}
                    </td>
                    <td className="py-3 px-4 text-gray-300 tabular-nums">
                      {formatDate(c.dueAt)}
                    </td>
                    <td className="py-3 px-4">
                      {c.status === "PAID" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Pago
                        </span>
                      ) : c.status === "PENDING" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </span>
                      ) : c.status === "OVERDUE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          Vencido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 px-2 py-0.5 text-[11px] font-medium text-gray-400">
                          <XCircle className="h-3 w-3" />
                          Cancelado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-white">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status !== "PAID" && (
                          <button
                            onClick={() => markPaidMutation.mutate(c.id)}
                            title="Marcar como pago"
                            className="inline-flex items-center rounded-md bg-emerald-500/10 p-1 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Deseja remover a cobrança "${c.title}"?`)) {
                              deleteChargeMutation.mutate(c.id);
                            }
                          }}
                          title="Excluir cobrança"
                          className="inline-flex items-center rounded-md bg-white/[0.04] p-1 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Vencimentos Próximos & Atividade Recente */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Próximos Vencimentos */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-white">Próximos Vencimentos</h3>
          <p className="mt-0.5 text-[11.5px] text-gray-400">
            Cobranças pendentes com vencimento nos próximos dias.
          </p>

          {overview?.upcomingCharges.length === 0 ? (
            <p className="mt-4 text-[12px] text-gray-500">Nenhum vencimento pendente para os próximos dias.</p>
          ) : (
            <ul className="mt-4 space-y-2.5 divide-y divide-white/[0.04]">
              {overview?.upcomingCharges.map((c) => (
                <li key={c.id} className="pt-2.5 first:pt-0 flex items-center justify-between">
                  <div>
                    <p className="text-[12.5px] font-medium text-white">{c.title}</p>
                    <p className="text-[11px] text-gray-400">{c.contactName} · Vence em {formatDate(c.dueAt)}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-white text-[13px]">
                    {formatCurrency(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Atividade Recente */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-white">Atividade Recente</h3>
          <p className="mt-0.5 text-[11.5px] text-gray-400">
            Últimas movimentações financeiras da empresa.
          </p>

          {overview?.recentActivity.length === 0 ? (
            <p className="mt-4 text-[12px] text-gray-500">Nenhuma atividade recente registrada.</p>
          ) : (
            <ul className="mt-4 space-y-2.5 divide-y divide-white/[0.04]">
              {overview?.recentActivity.map((act) => (
                <li key={act.id} className="pt-2.5 first:pt-0 flex items-center justify-between text-[12px]">
                  <div>
                    <p className="font-medium text-gray-200">{act.description}</p>
                    <p className="text-[11px] text-gray-500">{act.userName}</p>
                  </div>
                  <span className="text-[11px] text-gray-500 tabular-nums">
                    {formatDate(act.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* MODAL: Nova Cobrança */}
      <Modal
        open={isNewChargeOpen}
        onClose={() => setIsNewChargeOpen(false)}
        title="Nova Cobrança"
        description="Registre uma nova cobrança ou contrato para seus clientes."
        size="md"
      >
        <form onSubmit={handleCreateChargeSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-gray-300">Título / Descrição *</label>
            <input
              type="text"
              placeholder="Ex: Mensalidade Plano Pro"
              value={newChargeTitle}
              onChange={(e) => setNewChargeTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[12px] font-medium text-gray-300">Cliente / Contato</label>
              <select
                value={newChargeContactId}
                onChange={(e) => setNewChargeContactId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="">Sem cliente vinculado</option>
                {contactsList?.items.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name} {ct.company ? `(${ct.company})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-300">Categoria</label>
              <select
                value={newChargeCategory}
                onChange={(e) => setNewChargeCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-300">Valor (R$) *</label>
              <input
                type="text"
                placeholder="299,00"
                value={newChargeAmount}
                onChange={(e) => setNewChargeAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-300">Recorrência</label>
              <select
                value={newChargeRecurrence}
                onChange={(e) => setNewChargeRecurrence(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
              >
                {RECURRENCES.map((rec) => (
                  <option key={rec.value} value={rec.value}>
                    {rec.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-300">Vencimento *</label>
              <input
                type="date"
                value={newChargeDueAt}
                onChange={(e) => setNewChargeDueAt(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-gray-300">Observações (opcional)</label>
            <textarea
              rows={2}
              placeholder="Detalhes adicionais sobre o contrato..."
              value={newChargeNotes}
              onChange={(e) => setNewChargeNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={() => setIsNewChargeOpen(false)}
              className="rounded-lg px-4 py-2 text-[12.5px] font-medium text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createChargeMutation.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {createChargeMutation.isPending ? "Salvando..." : "Criar cobrança"}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Custos Operacionais */}
      <Modal
        open={isCostsOpen}
        onClose={() => setIsCostsOpen(false)}
        title="Custos Operacionais da Empresa"
        description="Cadastre custos fixos para estimar o resultado e a margem operacional."
        size="lg"
      >
        <div className="space-y-5">
          {/* Formulário para novo custo */}
          <form onSubmit={handleCreateCostSubmit} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
            <p className="text-[12.5px] font-semibold text-white">Adicionar Novo Custo</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <input
                type="text"
                placeholder="Nome (ex: Servidor)"
                value={newCostName}
                onChange={(e) => setNewCostName(e.target.value)}
                required
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white focus:border-violet-500 focus:outline-none sm:col-span-2"
              />
              <select
                value={newCostCategory}
                onChange={(e) => setNewCostCategory(e.target.value)}
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
                  value={newCostAmount}
                  onChange={(e) => setNewCostAmount(e.target.value)}
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
              Custos Cadastrados ({costsList?.length || 0})
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
                          {cost.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {cost.recurrence === "MONTHLY" ? "Recorrência mensal" : "Recorrência anual"}
                      </p>
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
