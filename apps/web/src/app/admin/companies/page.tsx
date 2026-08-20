"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock,
  Eye,
  EyeOff,
  Plus,
  Search,
  ShieldOff,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  isSuperadminMfaRequiredError,
} from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, formatCivilDate } from "@/lib/utils";
import {
  defaultCompanyPlanId,
  planSelectLabel,
  selectablePlansForCompany,
} from "@/lib/plan-price";
import {
  Checkbox,
  ConsequenceBanner,
  Modal,
  RadioGroup,
  useToast,
} from "@/components/ui";
import { Select as PortalSelect, type SelectOption } from "@/components/ui-select";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSection,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
  type AdminTone,
} from "@/components/admin";

type PlanRow = {
  id: string;
  name: string;
  slug?: string;
  priceMonthly?: number | string;
  priceOnRequest?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  maxUsers?: number;
  maxContacts?: number;
  features?: Record<string, unknown> | null;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusLabel?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  createdAt: string;
  plan?: { id: string; name: string; slug?: string; priceMonthly?: number | string; priceOnRequest?: boolean } | null;
  _count?: { members: number; contacts: number; conversations: number };
  contractedPrice?: number | null;
  priceKind?: "FREE" | "FIXED" | "CUSTOM_ZERO" | "ON_REQUEST";
  hasCharge?: boolean;
  financialStatus?: string;
  financialStatusLabel?: string;
  billingDueDay?: number | null;
  billingDueDayLabel?: string | null;
  nextDueAt?: string | null;
  nextDueDate?: string | null;
  daysOverdue?: number | null;
  daysOverdueLabel?: string | null;
  daysUntilDue?: number | null;
  needsAttention?: boolean;
  primaryAdmin?: { id: string; name: string; email: string } | null;
};

type TenantsResponse = {
  items: TenantRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary?: {
    total: number;
    active: number;
    overdue: number;
    suspended: number;
    blocked: number;
    suspendedBlocked?: number;
    trial: number;
    dueIn7Days: number;
    cancelled: number;
    needsAttention: number;
  };
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão agendada",
};

const financialLabelMap: Record<string, string> = {
  IN_GOOD_STANDING: "Em dia",
  DUE_TODAY: "Vence hoje",
  DUE_SOON: "Vence em breve",
  OVERDUE: "Em atraso",
  PAYMENT_PENDING: "Pagamento pendente",
  TRIAL: "Trial",
  CANCELLED: "Cancelada",
  SUSPENDED: "Suspensa",
  NEEDS_ATTENTION: "Precisa atenção",
};

function financialToTone(code?: string): AdminTone {
  if (!code) return "neutral";
  if (code === "IN_GOOD_STANDING") return "success";
  if (code === "DUE_TODAY" || code === "DUE_SOON" || code === "TRIAL") return "warning";
  if (code === "OVERDUE" || code === "PAYMENT_PENDING") return "danger";
  if (code === "CANCELLED" || code === "SUSPENDED") return "neutral";
  return statusToTone(code);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPlanPriceColumn(t: TenantRow): { planName: string; priceText: string } {
  const planName = t.plan?.name || "Gratuito";
  const slug = (t.plan?.slug || "").toLowerCase();
  const isFree = slug === "free" || (!t.plan && (t.contractedPrice === 0 || t.contractedPrice == null));

  if (isFree && (t.contractedPrice == null || t.contractedPrice === 0)) {
    return { planName: "Gratuito", priceText: "Sem cobrança" };
  }

  if (t.contractedPrice != null && t.contractedPrice > 0) {
    return {
      planName,
      priceText: `${formatCurrency(t.contractedPrice)}/mês`,
    };
  }

  if (slug === "enterprise" || t.plan?.priceOnRequest || t.priceKind === "ON_REQUEST") {
    if (t.contractedPrice === 0 || t.priceKind === "CUSTOM_ZERO") {
      return { planName, priceText: `${formatCurrency(0)}/mês` };
    }
    return { planName, priceText: "Sob consulta" };
  }

  if (t.contractedPrice === 0 || t.priceKind === "FREE") {
    return { planName, priceText: "Sem cobrança" };
  }

  return { planName, priceText: "Sob consulta" };
}

function formatDueDate(t: TenantRow): string {
  const due = t.nextDueDate || t.nextDueAt;
  if (t.status === "TRIAL") {
    return due ? `Trial até ${formatCivilDate(due)}` : "Trial ativo";
  }
  if (t.hasCharge === false || t.priceKind === "FREE" || t.priceKind === "ON_REQUEST") {
    return "Sem vencimento";
  }
  if (due) return formatCivilDate(due);
  if (t.billingDueDay) return t.billingDueDayLabel || `Todo dia ${t.billingDueDay}`;
  return "Não definido";
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const initialStatus = searchParams.get("status") || "ALL";
  const initialFinancial = searchParams.get("financial") || "ALL";
  const initialPlan = searchParams.get("planId") || "ALL";
  const initialSearch = searchParams.get("q") || searchParams.get("search") || "";
  const initialPage = Number(searchParams.get("page") || 1);

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [financialFilter, setFinancialFilter] = useState(initialFinancial);
  const [planFilter, setPlanFilter] = useState(initialPlan);
  const [page, setPage] = useState(initialPage);
  const [openCreate, setOpenCreate] = useState(false);

  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
    const f = searchParams.get("financial");
    if (f) setFinancialFilter(f);
    const p = searchParams.get("planId");
    if (p) setPlanFilter(p);
    const q = searchParams.get("q") || searchParams.get("search");
    if (q !== null) {
      setSearch(q);
      setDebouncedSearch(q);
    }
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.replace(`/admin/companies?${next.toString()}`);
  }

  function clearAllFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("ALL");
    setFinancialFilter("ALL");
    setPlanFilter("ALL");
    setPage(1);
    router.replace("/admin/companies");
  }

  const plansQuery = useQuery({
    queryKey: ["admin-plans", "company-assign"],
    queryFn: () => api<PlanRow[]>("/admin/plans?activeOnly=1&commercial=1"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 60_000,
  });

  const tenantsQuery = useQuery({
    queryKey: [
      "admin-tenants",
      debouncedSearch,
      statusFilter,
      financialFilter,
      planFilter,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (financialFilter !== "ALL") params.set("financial", financialFilter);
      if (planFilter !== "ALL") params.set("planId", planFilter);
      params.set("page", String(page));
      params.set("limit", "30");
      return api<TenantsResponse>(`/admin/tenants?${params.toString()}`);
    },
    enabled: user?.platformRole === "SUPERADMIN",
  });

  const items = tenantsQuery.data?.items || [];
  const summary = tenantsQuery.data?.summary;
  const totalPages = tenantsQuery.data?.totalPages || 1;
  const total = tenantsQuery.data?.total || 0;

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() ||
      statusFilter !== "ALL" ||
      financialFilter !== "ALL" ||
      planFilter !== "ALL"
  );

  const statusOptions: SelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Status: Todos" },
      { value: "ACTIVE", label: "Ativas" },
      { value: "TRIAL", label: "Trial" },
      { value: "BLOCKED", label: "Bloqueadas" },
      { value: "SUSPENDED", label: "Suspensas" },
      { value: "CANCELLED", label: "Canceladas" },
      { value: "PENDING_DELETION", label: "Exclusão agendada" },
    ],
    []
  );

  const financialOptions: SelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Financeiro: Todos" },
      ...Object.entries(financialLabelMap).map(([k, v]) => ({ value: k, label: v })),
    ],
    []
  );

  const planFilterOptions: SelectOption[] = useMemo(
    () => [
      { value: "ALL", label: "Plano: Todos" },
      ...(plansQuery.data || []).map((p) => ({ value: p.id, label: p.name })),
    ],
    [plansQuery.data]
  );

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (tenantsQuery.isLoading && !tenantsQuery.data) {
    return <AdminPageSkeleton metrics={4} />;
  }

  if (tenantsQuery.isError) {
    if (isSuperadminMfaRequiredError(tenantsQuery.error)) return null;
    return (
      <AdminErrorState
        title="Não foi possível carregar as empresas"
        description="Verifique sua conexão e tente novamente."
        onRetry={() => void tenantsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <AdminPageHeader
        title="Empresas"
        description={
          summary
            ? `${summary.total} ${summary.total === 1 ? "empresa cadastrada" : "empresas cadastradas"} · ${summary.active} ${summary.active === 1 ? "ativa" : "ativas"}`
            : "Gerencie empresas, contratos, planos e permissões de acesso."
        }
        actions={
          <button
            type="button"
            className="admin-btn-primary"
            onClick={() => setOpenCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nova empresa
          </button>
        }
      />

      {/* 2. KPIs */}
      {summary ? (
        <MetricGrid cols={4}>
          <MetricCard
            label="Total de empresas"
            value={summary.total}
            hint={`${summary.active} ${summary.active === 1 ? "empresa ativa" : "empresas ativas"}`}
            icon={<Building2 className="h-4 w-4" />}
            tone="brand"
            compact
          />
          <MetricCard
            label="Em atraso"
            value={summary.overdue}
            hint={
              summary.overdue === 0
                ? "Nenhuma cobrança em atraso"
                : `${summary.overdue} com pendência financeira`
            }
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={summary.overdue > 0 ? "danger" : "neutral"}
            compact
          />
          <MetricCard
            label="Em período trial"
            value={summary.trial}
            hint={
              summary.trial === 0
                ? "Nenhum trial em vigor"
                : `${summary.trial} ${summary.trial === 1 ? "trial ativo" : "trials ativos"}`
            }
            icon={<Clock className="h-4 w-4" />}
            tone={summary.trial > 0 ? "warning" : "neutral"}
            compact
          />
          <MetricCard
            label="Suspensas / bloqueadas"
            value={summary.suspendedBlocked ?? summary.suspended + summary.blocked}
            hint={`${summary.suspended} suspensas · ${summary.blocked} bloqueadas`}
            icon={<ShieldOff className="h-4 w-4" />}
            tone={summary.suspended + summary.blocked > 0 ? "warning" : "neutral"}
            compact
          />
        </MetricGrid>
      ) : null}

      {/* 3. Filtros */}
      <AdminFilterBar>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            id="admin-companies-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou slug…"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12] py-1.5 pl-8 pr-7 text-[13px] text-white placeholder-white/35 focus:border-violet-500/50 focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setParam("q", "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="w-full sm:w-44">
          <PortalSelect
            size="sm"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setParam("status", val);
            }}
            options={statusOptions}
            triggerClassName="h-9 bg-[#0c0d12] border-white/[0.08] text-[12.5px]"
          />
        </div>

        <div className="w-full sm:w-48">
          <PortalSelect
            size="sm"
            value={financialFilter}
            onChange={(val) => {
              setFinancialFilter(val);
              setParam("financial", val);
            }}
            options={financialOptions}
            triggerClassName="h-9 bg-[#0c0d12] border-white/[0.08] text-[12.5px]"
          />
        </div>

        <div className="w-full sm:w-44">
          <PortalSelect
            size="sm"
            value={planFilter}
            onChange={(val) => {
              setPlanFilter(val);
              setParam("planId", val);
            }}
            options={planFilterOptions}
            triggerClassName="h-9 bg-[#0c0d12] border-white/[0.08] text-[12.5px]"
          />
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            className="admin-btn-ghost h-9 px-2.5 text-[12px] text-white/60 hover:text-white shrink-0"
            onClick={clearAllFilters}
          >
            Limpar filtros
          </button>
        ) : null}
      </AdminFilterBar>

      {/* 4. Listagem / Tabela */}
      <AdminSection flush>
        {items.length === 0 ? (
          hasActiveFilters ? (
            <AdminEmptyState
              icon={<Building2 className="h-5 w-5" strokeWidth={1.5} />}
              title="Nenhuma empresa encontrada"
              description="Nenhuma empresa corresponde aos filtros aplicados."
              action={
                <button
                  type="button"
                  className="admin-btn-secondary text-[12px]"
                  onClick={clearAllFilters}
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <AdminEmptyState
              icon={<Building2 className="h-5 w-5" strokeWidth={1.5} />}
              title="Nenhuma empresa cadastrada"
              description="Comece cadastrando a primeira empresa na plataforma."
            />
          )
        ) : (
          <>
            {/* Tabela Desktop */}
            <div className="hidden sm:block">
              <div className="admin-table-wrap overflow-x-auto">
                <table className="admin-table w-full min-w-[880px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="w-[38%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                        Empresa
                      </th>
                      <th className="w-[20%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                        Plano / valor
                      </th>
                      <th className="w-[16%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                        Financeiro
                      </th>
                      <th className="w-[14%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                        Vencimento
                      </th>
                      <th className="w-[12%] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => {
                      const st = t.statusLabel || statusLabel[t.status] || t.status;
                      const finLabel = t.financialStatusLabel || financialLabelMap[t.financialStatus || ""] || "—";
                      const planInfo = formatPlanPriceColumn(t);
                      const dueDate = formatDueDate(t);
                      const userCount = t._count?.members ?? 1;
                      const contactCount = t._count?.contacts ?? 0;
                      const adminEmail = t.primaryAdmin?.email || "Sem administrador";

                      return (
                        <tr
                          key={t.id}
                          className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]"
                        >
                          {/* 1. Empresa */}
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-bold uppercase tracking-wider"
                                style={{
                                  backgroundColor: t.primaryColor
                                    ? `${t.primaryColor}22`
                                    : "rgba(139, 92, 246, 0.15)",
                                  color: t.primaryColor || "#c4b5fd",
                                  border: `1px solid ${t.primaryColor ? `${t.primaryColor}44` : "rgba(139, 92, 246, 0.25)"}`,
                                }}
                              >
                                {getInitials(t.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={`/admin/tenants/${t.id}`}
                                    className="truncate font-semibold text-white transition-colors hover:text-violet-300"
                                  >
                                    {t.name}
                                  </Link>
                                  <StatusBadge tone={statusToTone(t.status)} dot>
                                    {st}
                                  </StatusBadge>
                                </div>
                                <p className="mt-0.5 truncate text-[11.5px] text-gray-400">
                                  {userCount} {userCount === 1 ? "usuário" : "usuários"} · {contactCount}{" "}
                                  {contactCount === 1 ? "contato" : "contatos"} ·{" "}
                                  <span className="text-gray-300">{adminEmail}</span>
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 2. Plano / Valor */}
                          <td className="px-4 py-3 align-middle">
                            <p className="truncate text-[13px] font-medium text-gray-200">
                              {planInfo.planName}
                            </p>
                            <p className="mt-0.5 text-[11.5px] tabular-nums text-gray-400">
                              {planInfo.priceText}
                            </p>
                          </td>

                          {/* 3. Financeiro */}
                          <td className="px-4 py-3 align-middle">
                            <StatusBadge tone={financialToTone(t.financialStatus)}>
                              {finLabel}
                            </StatusBadge>
                            {t.daysOverdue != null && t.daysOverdue > 0 ? (
                              <p className="mt-1 text-[11px] font-medium text-red-300">
                                {t.daysOverdueLabel || `${t.daysOverdue} dias em atraso`}
                              </p>
                            ) : null}
                          </td>

                          {/* 4. Vencimento */}
                          <td className="px-4 py-3 align-middle text-[12.5px] text-gray-300">
                            {dueDate}
                          </td>

                          {/* 5. Ações */}
                          <td className="px-4 py-3 align-middle text-right">
                            <Link
                              href={`/admin/tenants/${t.id}`}
                              className="admin-btn-secondary inline-flex h-8 items-center gap-1 px-3 text-[12px]"
                            >
                              Gerenciar
                              <ArrowRight className="h-3 w-3 opacity-60" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visualização Mobile (Cards) */}
            <div className="grid gap-3 p-3 sm:hidden">
              {items.map((t) => {
                const planInfo = formatPlanPriceColumn(t);
                const dueDate = formatDueDate(t);
                const userCount = t._count?.members ?? 1;
                const contactCount = t._count?.contacts ?? 0;
                const adminEmail = t.primaryAdmin?.email || "Sem administrador";
                const st = t.statusLabel || statusLabel[t.status] || t.status;
                const finLabel = t.financialStatusLabel || financialLabelMap[t.financialStatus || ""] || "—";

                return (
                  <div
                    key={t.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-bold uppercase tracking-wider"
                        style={{
                          backgroundColor: t.primaryColor
                            ? `${t.primaryColor}22`
                            : "rgba(139, 92, 246, 0.15)",
                          color: t.primaryColor || "#c4b5fd",
                          border: `1px solid ${t.primaryColor ? `${t.primaryColor}44` : "rgba(139, 92, 246, 0.25)"}`,
                        }}
                      >
                        {getInitials(t.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="truncate text-[14px] font-semibold text-white"
                          >
                            {t.name}
                          </Link>
                          <StatusBadge tone={statusToTone(t.status)} dot>
                            {st}
                          </StatusBadge>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">
                          {userCount} usu. · {contactCount} cont. · {adminEmail}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/[0.02] p-2 text-[12px]">
                      <div>
                        <span className="block text-[10.5px] uppercase tracking-wider text-gray-500">
                          Plano
                        </span>
                        <span className="font-medium text-white/90">{planInfo.planName}</span>
                        <span className="block text-[11px] text-gray-400">{planInfo.priceText}</span>
                      </div>
                      <div>
                        <span className="block text-[10.5px] uppercase tracking-wider text-gray-500">
                          Financeiro
                        </span>
                        <StatusBadge tone={financialToTone(t.financialStatus)}>
                          {finLabel}
                        </StatusBadge>
                        <span className="mt-0.5 block text-[11px] text-gray-400">{dueDate}</span>
                      </div>
                    </div>

                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="admin-btn-secondary h-8 w-full justify-center text-[12px]"
                    >
                      Gerenciar empresa
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-[12px] text-gray-400">
                <span>
                  {total} {total === 1 ? "empresa" : "empresas"} no total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost h-8 px-3 text-[12px] disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage((p) => Math.max(1, p - 1));
                      setParam("page", String(Math.max(1, page - 1)));
                    }}
                  >
                    Anterior
                  </button>
                  <span className="text-gray-300">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="admin-btn-ghost h-8 px-3 text-[12px] disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setPage((p) => Math.min(totalPages, p + 1));
                      setParam("page", String(Math.min(totalPages, page + 1)));
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </AdminSection>

      {/* 5. Modal Nova Empresa */}
      <CreateCompanyModal
        open={openCreate}
        plans={plansQuery.data || []}
        onClose={() => setOpenCreate(false)}
        onCreated={(id, meta) => {
          setOpenCreate(false);
          void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
          void qc.invalidateQueries({ queryKey: ["admin-overview"] });
          toast({
            title: "Empresa criada",
            description:
              meta?.firstAccess === "temporary_password"
                ? "O administrador entra com a senha temporária e define a senha definitiva no primeiro acesso."
                : meta?.firstAccess === "invite"
                  ? "Enviamos um convite por e-mail para o administrador definir a senha."
                  : "A empresa foi cadastrada. O administrador deve entrar com a senha da conta já existente.",
            kind: "success",
          });
          router.push(`/admin/tenants/${id}`);
        }}
        onError={(msg) =>
          toast({
            title: "Não foi possível criar a empresa",
            description: msg,
            kind: "error",
          })
        }
      />
    </div>
  );
}

function CreateCompanyModal({
  open,
  plans,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  plans: PlanRow[];
  onClose: () => void;
  onCreated: (id: string, meta?: { firstAccess?: string }) => void;
  onError: (msg: string) => void;
}) {
  const [force, setForce] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accessMethod, setAccessMethod] = useState<"invite" | "temporary_password">("invite");
  const [tempConfirm, setTempConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [existingUser, setExistingUser] = useState(false);

  const eligiblePlans = useMemo(() => selectablePlansForCompany(plans), [plans]);
  const defaultPlanId = useMemo(() => defaultCompanyPlanId(eligiblePlans), [eligiblePlans]);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId);

  useEffect(() => {
    if (open) {
      setForce(false);
      setShowPassword(false);
      setAccessMethod("invite");
      setTempConfirm("");
      setFieldErrors({});
      setExistingUser(false);
      setSelectedPlanId(defaultPlanId);
    }
  }, [open, defaultPlanId]);

  const planOptions: SelectOption[] = useMemo(
    () =>
      eligiblePlans.map((p) => ({
        value: p.id,
        label: planSelectLabel(p),
      })),
    [eligiblePlans]
  );

  const mut = useMutation({
    mutationFn: (payload: {
      name: string;
      adminName: string;
      adminEmail: string;
      adminPassword?: string;
      accessMethod?: "invite" | "temporary_password";
      planId?: string;
      forceSimilarName?: boolean;
    }) =>
      api<{ id: string; firstAccess?: string }>("/admin/tenants", {
        method: "POST",
        json: payload,
      }),
    onSuccess: (res) => onCreated(res.id, { firstAccess: res.firstAccess }),
    onError: (e) => {
      if (e instanceof ApiError) {
        if (e.fieldErrors && Object.keys(e.fieldErrors).length > 0) {
          setFieldErrors(e.fieldErrors);
        }
        if (e.code === "SIMILAR_TENANT_NAME") {
          setForce(true);
          setFieldErrors((prev) => ({ ...prev, name: e.message }));
          onError(e.message);
          return;
        }
        if (e.code === "INVALID_NAME" || e.code === "SLUG_TAKEN") {
          setFieldErrors((prev) => ({ ...prev, name: e.message }));
        } else if (e.code === "INVALID_EMAIL") {
          setFieldErrors((prev) => ({ ...prev, adminEmail: e.message }));
        } else if (e.code === "INVALID_ADMIN_NAME") {
          setFieldErrors((prev) => ({ ...prev, adminName: e.message }));
        } else if (e.code === "WEAK_PASSWORD") {
          setFieldErrors((prev) => ({ ...prev, adminPassword: e.message }));
        } else if (e.code === "ADMIN_USER_EXISTS") {
          setFieldErrors((prev) => ({ ...prev, adminEmail: e.message }));
          setExistingUser(true);
        } else if (e.code === "PLAN_UNAVAILABLE") {
          setFieldErrors((prev) => ({ ...prev, planId: e.message }));
        }
      }
      onError(e instanceof Error ? e.message : "Erro ao cadastrar a empresa.");
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const adminName = String(fd.get("adminName") || "").trim();
    const adminEmail = String(fd.get("adminEmail") || "").trim();
    const adminPassword = String(fd.get("adminPassword") || "").trim();

    const errs: Record<string, string> = {};
    if (!name || name.length < 2) errs.name = "Nome da empresa deve ter pelo menos 2 caracteres.";
    if (!adminName || adminName.length < 2)
      errs.adminName = "Nome do administrador deve ter pelo menos 2 caracteres.";
    if (!adminEmail || !adminEmail.includes("@")) errs.adminEmail = "E-mail inválido.";
    if (!existingUser && accessMethod === "temporary_password") {
      if (adminPassword.length < 10) errs.adminPassword = "A senha deve ter pelo menos 10 caracteres.";
      if (adminPassword !== tempConfirm) errs.adminPassword = "As senhas não coincidem.";
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    mut.mutate({
      name,
      adminName,
      adminEmail,
      adminPassword: !existingUser && accessMethod === "temporary_password" ? adminPassword : undefined,
      accessMethod: existingUser ? "invite" : accessMethod,
      planId: selectedPlanId || undefined,
      forceSimilarName: force,
    });
  }

  const inputStyle =
    "h-9 w-full rounded-lg border border-white/[0.08] bg-[#0c0d12] px-3 py-1.5 text-[13px] text-white placeholder-white/35 focus:border-violet-500/60 focus:outline-none";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova empresa"
      description="Cadastre a empresa, o administrador inicial e o plano de acesso."
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row sm:items-center">
          <button type="button" className="admin-btn-ghost h-9" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="create-company-form"
            className="admin-btn-primary h-9"
            disabled={mut.isPending}
          >
            {mut.isPending ? "Criando empresa…" : "Criar empresa"}
          </button>
        </div>
      }
    >
      <form id="create-company-form" className="space-y-4 pt-1" onSubmit={onSubmit}>
        {/* Seção 1: INFORMAÇÕES DA EMPRESA */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Informações da empresa
          </h3>
          <div className="mt-2.5">
            <label className="block text-[12px] font-medium text-gray-300 mb-1">
              Nome da empresa
            </label>
            <input
              name="name"
              required
              minLength={2}
              placeholder="Ex.: Nexus Soluções"
              className={cn(
                inputStyle,
                fieldErrors.name && "border-rose-500/60 focus:border-rose-500"
              )}
            />
            {fieldErrors.name ? (
              <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.name}</p>
            ) : null}
            {force ? (
              <p className="mt-1 text-[11.5px] text-amber-300">
                Nome semelhante detectado. Clique em &quot;Criar empresa&quot; novamente para confirmar.
              </p>
            ) : null}
          </div>
        </div>

        {/* Divisor sutil */}
        <div className="border-t border-white/[0.06]" />

        {/* Seção 2: ADMINISTRADOR INICIAL */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Administrador inicial
          </h3>
          <div className="mt-2.5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[12px] font-medium text-gray-300 mb-1">
                  Nome do administrador
                </label>
                <input
                  name="adminName"
                  required
                  minLength={2}
                  placeholder="Ex.: Luiz Otávio"
                  className={cn(
                    inputStyle,
                    fieldErrors.adminName && "border-rose-500/60 focus:border-rose-500"
                  )}
                />
                {fieldErrors.adminName ? (
                  <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.adminName}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-gray-300 mb-1">
                  E-mail
                </label>
                <input
                  name="adminEmail"
                  type="email"
                  required
                  placeholder="admin@empresa.com"
                  className={cn(
                    inputStyle,
                    fieldErrors.adminEmail && "border-rose-500/60 focus:border-rose-500"
                  )}
                  onChange={() => {
                    if (existingUser) setExistingUser(false);
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim().toLowerCase();
                    if (!value.includes("@")) {
                      setExistingUser(false);
                      return;
                    }
                    void api<{ items: Array<{ email: string }> }>(
                      `/admin/users?search=${encodeURIComponent(value)}&limit=8`
                    )
                      .then((res) => {
                        setExistingUser((res.items || []).some((u) => u.email.toLowerCase() === value));
                      })
                      .catch(() => setExistingUser(false));
                  }}
                />
                {fieldErrors.adminEmail ? (
                  <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.adminEmail}</p>
                ) : null}
              </div>
            </div>

            {existingUser ? (
              <ConsequenceBanner tone="warning">
                Este usuário já possui uma conta no NexaFlow e será apenas vinculado à nova empresa.
              </ConsequenceBanner>
            ) : (
            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-gray-300">Primeiro acesso</span>
              <RadioGroup
                aria-label="Primeiro acesso"
                value={accessMethod}
                onChange={(v) => setAccessMethod(v as "invite" | "temporary_password")}
                options={[
                  {
                    value: "invite",
                    label: "Enviar convite por e-mail",
                    description: "O administrador receberá um link seguro para definir sua senha.",
                  },
                  {
                    value: "temporary_password",
                    label: "Definir senha temporária",
                    description: "Você cria uma senha inicial e o usuário deverá alterá-la no primeiro acesso.",
                  },
                ]}
              />
              {accessMethod === "temporary_password" ? (
                <div className="mt-3 space-y-3">
                  <div className="relative">
                    <input
                      name="adminPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Senha temporária"
                      className={cn(
                        inputStyle,
                        "pr-9",
                        fieldErrors.adminPassword && "border-rose-500/60 focus:border-rose-500"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                      aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirmar senha"
                    value={tempConfirm}
                    onChange={(e) => setTempConfirm(e.target.value)}
                    className={inputStyle}
                  />
                  <label className="flex items-start gap-2.5 text-[12.5px] text-gray-300">
                    <Checkbox checked disabled onCheckedChange={() => undefined} className="mt-0.5" />
                    <span>Exigir alteração da senha no primeiro acesso</span>
                  </label>
                  {fieldErrors.adminPassword ? (
                    <p className="text-[11.5px] text-rose-400">{fieldErrors.adminPassword}</p>
                  ) : null}
                </div>
              ) : (
                <input type="hidden" name="adminPassword" value="" />
              )}
            </div>
            )}
          </div>
        </div>

        {/* Divisor sutil */}
        <div className="border-t border-white/[0.06]" />

        {/* Seção 3: PLANO INICIAL */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Plano inicial
          </h3>
          <div className="mt-2.5">
            <label className="block text-[12px] font-medium text-gray-300 mb-0.5">
              Plano de acesso
            </label>
            <p className="text-[11px] text-gray-400 mb-1.5">
              O valor contratado é congelado na criação da empresa.
            </p>
            <PortalSelect
              value={selectedPlanId}
              onChange={setSelectedPlanId}
              options={planOptions}
              placeholder="Selecione o plano..."
              preferredPlacement="top"
              matchTriggerWidth={true}
              triggerClassName="h-9 w-full bg-[#0c0d12] border-white/[0.08] text-[13px]"
            />
            {fieldErrors.planId ? (
              <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.planId}</p>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
