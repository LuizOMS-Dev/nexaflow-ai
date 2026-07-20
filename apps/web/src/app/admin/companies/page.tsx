"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CreditCard,
  Plus,
  Search,
  ShieldOff,
} from "lucide-react";
import {
  api,
  ApiError,
  isStepUpRequiredError,
  isSuperadminMfaRequiredError,
} from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  defaultCompanyPlanId,
  planSelectLabel,
  selectablePlansForCompany,
} from "@/lib/plan-price";
import {
  ConsequenceBanner,
  DateInput,
  DialogFooter,
  EmptyState,
  EntitySummary,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { AdminPageHeader } from "../admin-page-header";

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

function planLimitAgents(p?: PlanRow | null): number | null {
  if (!p) return null;
  const fromFeat = Number((p.features as { maxAgents?: unknown } | null)?.maxAgents);
  if (Number.isFinite(fromFeat) && fromFeat >= 0) return fromFeat;
  return null;
}

function formatLimit(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.trunc(n).toLocaleString("pt-BR");
}

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusLabel?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  createdAt: string;
  plan?: { id: string; name: string; priceMonthly?: number | string } | null;
  _count?: { members: number; contacts: number; conversations: number };
  contractedPrice?: number | null;
  financialStatus?: string;
  financialStatusLabel?: string;
  billingDueDay?: number | null;
  billingDueDayLabel?: string | null;
  nextDueAt?: string | null;
  daysOverdue?: number | null;
  daysOverdueLabel?: string | null;
  daysUntilDue?: number | null;
  needsAttention?: boolean;
  primaryAdmin?: { id: string; name: string; email: string } | null;
  subscription?: {
    id: string;
    billingStatus: string;
    priceMonthly?: number | null;
    billingDueDay?: number | null;
    currentPeriodEnd?: string | null;
  } | null;
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

const financialFilterOptions = [
  { value: "ALL", label: "Financeiro: todos" },
  { value: "IN_GOOD_STANDING", label: "Em dia" },
  { value: "DUE_TODAY", label: "Vence hoje" },
  { value: "DUE_SOON", label: "Vence em breve" },
  { value: "OVERDUE", label: "Em atraso" },
  { value: "PAYMENT_PENDING", label: "Pagamento pendente" },
  { value: "TRIAL", label: "Trial (financeiro)" },
  { value: "NEEDS_ATTENTION", label: "Precisa atenção" },
];

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return "badge-success";
  if (status === "TRIAL") return "badge-brand";
  if (status === "BLOCKED") return "badge-danger";
  if (status === "SUSPENDED") return "badge-warning";
  if (status === "CANCELLED" || status === "PENDING_DELETION") return "badge-neutral";
  return "badge-neutral";
}

function financialBadgeClass(code?: string) {
  if (!code) return "badge-neutral";
  if (code === "IN_GOOD_STANDING") return "badge-success";
  if (code === "DUE_TODAY" || code === "DUE_SOON" || code === "TRIAL") return "badge-warning";
  if (code === "OVERDUE" || code === "PAYMENT_PENDING") return "badge-danger";
  if (code === "CANCELLED" || code === "SUSPENDED") return "badge-neutral";
  return "badge-neutral";
}

function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function CompanyMark({
  name,
  logoUrl,
  color,
}: {
  name: string;
  logoUrl?: string | null;
  color?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (logoUrl?.startsWith("data:") || logoUrl?.startsWith("http") || logoUrl?.startsWith("/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold tracking-wide text-white shadow-sm shadow-black/10"
      style={{ backgroundColor: color || "#6366F1" }}
    >
      {initials || "E"}
    </div>
  );
}

type ActionKind =
  | "payment"
  | "due"
  | "block"
  | "unblock"
  | "suspend"
  | "reactivate"
  | "cancel_sub"
  | "delete"
  | "plan"
  | null;

export default function AdminCompaniesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const setSession = useAuth((s) => s.setSession);
  const user = useAuth((s) => s.user);

  const initialStatus = searchParams.get("status") || "ALL";
  const initialFinancial = searchParams.get("financial") || "ALL";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [financialFilter, setFinancialFilter] = useState(initialFinancial);
  const [planFilter, setPlanFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [impTarget, setImpTarget] = useState<TenantRow | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpForm, setStepUpForm] = useState({ password: "", code: "" });
  const [pendingImpersonateId, setPendingImpersonateId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<TenantRow | null>(null);
  const [actionKind, setActionKind] = useState<ActionKind>(null);
  const [actionReason, setActionReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const [planIdEdit, setPlanIdEdit] = useState("");
  const [priceEdit, setPriceEdit] = useState("");
  const [payForm, setPayForm] = useState({
    amount: "",
    paidAt: new Date().toISOString().slice(0, 10),
    referencePeriod: "",
    method: "",
    notes: "",
  });
  const [form, setForm] = useState({
    name: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    planId: "",
    forceSimilarName: false,
  });

  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
    const f = searchParams.get("financial");
    if (f) setFinancialFilter(f);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, financialFilter, planFilter]);

  const plansQuery = useQuery({
    queryKey: ["admin-plans", "company-assign"],
    queryFn: () => api<PlanRow[]>("/admin/plans?activeOnly=1&commercial=1"),
    enabled: user?.platformRole === "SUPERADMIN",
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const closeAction = () => {
    setActionKind(null);
    setActionTarget(null);
    setActionReason("");
    setDeleteConfirm("");
  };

  const openAction = (t: TenantRow, kind: ActionKind) => {
    setActionTarget(t);
    setActionKind(kind);
    setActionReason("");
    setDeleteConfirm("");
    setDueDay(String(t.billingDueDay || 10));
    setPlanIdEdit(t.plan?.id || "");
    setPriceEdit(
      t.contractedPrice != null && Number.isFinite(t.contractedPrice)
        ? String(t.contractedPrice)
        : ""
    );
    setPayForm({
      amount:
        t.contractedPrice != null && Number.isFinite(t.contractedPrice)
          ? String(t.contractedPrice)
          : "",
      paidAt: new Date().toISOString().slice(0, 10),
      referencePeriod: new Date().toISOString().slice(0, 7),
      method: "",
      notes: "",
    });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/admin/tenants", {
        method: "POST",
        json: {
          name: form.name.trim(),
          adminName: form.adminName.trim(),
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword || undefined,
          planId: form.planId || freePlanId || undefined,
          forceSimilarName: form.forceSimilarName || undefined,
        },
      }),
    onSuccess: (tenant) => {
      invalidate();
      setOpenCreate(false);
      setForm({
        name: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        planId: freePlanId || "",
        forceSimilarName: false,
      });
      toast({
        kind: "success",
        title: "Empresa criada",
        description: "Abrindo o gerenciamento…",
      });
      // Cadastro → gestão da empresa (centro de controle)
      router.push(`/admin/tenants/${tenant.id}`);
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.code === "SIMILAR_TENANT_NAME") {
        setForm((f) => ({ ...f, forceSimilarName: true }));
        toast({
          kind: "warning",
          title: "Nome semelhante",
          description: `${e.message} Clique em Criar novamente para confirmar.`,
        });
        return;
      }
      toast({ kind: "error", title: "Falha ao criar", description: e.message });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (tenantId: string) =>
      api<{
        token: string;
        accessToken?: string;
        tenant: { id: string; name: string; slug: string; role?: string };
        user: { id: string; name: string; email: string };
      }>("/admin/impersonate", {
        method: "POST",
        json: {
          tenantId,
          reason: "Suporte operacional via painel de administração",
        },
      }),
    onSuccess: (data) => {
      try {
        sessionStorage.setItem("nexaflow_impersonating", "1");
      } catch {
        /* ignore */
      }
      const tok = data.accessToken || data.token;
      setSession({
        token: tok,
        user: {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          platformRole: "SUPERADMIN",
        },
        tenant: data.tenant,
      });
      setImpTarget(null);
      setStepUpOpen(false);
      setPendingImpersonateId(null);
      setStepUpForm({ password: "", code: "" });
      window.location.href = "/app";
    },
    onError: (e: Error) => {
      if (isStepUpRequiredError(e)) {
        setPendingImpersonateId(impTarget?.id || pendingImpersonateId);
        setStepUpOpen(true);
        toast({
          kind: "warning",
          title: "Confirme sua identidade",
          description: "Por segurança, informe sua senha (e MFA se ativo) para acessar a empresa.",
        });
        return;
      }
      toast({
        kind: "error",
        title: "Não foi possível acessar a empresa",
        description: e.message,
      });
    },
  });

  const stepUpMutation = useMutation({
    mutationFn: () =>
      api("/auth/step-up", {
        method: "POST",
        json: {
          password: stepUpForm.password,
          code: stepUpForm.code.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast({ kind: "success", title: "Identidade confirmada" });
      const tid = pendingImpersonateId || impTarget?.id;
      if (tid) impersonateMutation.mutate(tid);
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Confirmação falhou", description: e.message }),
  });

  const patchMutation = useMutation({
    mutationFn: (payload: { id: string; json: Record<string, unknown> }) =>
      api(`/admin/tenants/${payload.id}`, { method: "PATCH", json: payload.json }),
    onSuccess: () => {
      invalidate();
      closeAction();
      toast({ kind: "success", title: "Alterações salvas" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: { id: string; json: Record<string, unknown> }) =>
      api(`/admin/tenants/${payload.id}/payments`, {
        method: "POST",
        json: payload.json,
      }),
    onSuccess: () => {
      invalidate();
      closeAction();
      toast({ kind: "success", title: "Pagamento registrado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha ao registrar", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string; confirmName: string; reason?: string }) =>
      api(`/admin/tenants/${payload.id}`, {
        method: "DELETE",
        json: {
          confirmName: payload.confirmName,
          reason: payload.reason,
          mode: "soft",
        },
      }),
    onSuccess: () => {
      invalidate();
      closeAction();
      toast({
        kind: "success",
        title: "Exclusão solicitada",
        description: "Dados preservados. Acesso bloqueado até processo definitivo.",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível concluir", description: e.message }),
  });

  const plans = selectablePlansForCompany(plansQuery.data || []);
  const freePlanId = defaultCompanyPlanId(plans);
  const freePlan = plans.find((p) => (p.slug || "").toLowerCase() === "free");

  // Garante Gratuito como valor selecionado assim que o catálogo carrega
  useEffect(() => {
    if (!freePlanId) return;
    setForm((f) => {
      if (f.planId && f.planId !== freePlanId) return f;
      if (f.planId === freePlanId) return f;
      return { ...f, planId: freePlanId };
    });
  }, [freePlanId]);

  const planOptions = plans.map((p) => {
    const isFree =
      (p.slug || "").toLowerCase() === "free" ||
      p.name.trim().toLowerCase() === "gratuito";
    return {
      value: p.id,
      label: planSelectLabel(p, { asDefault: isFree }),
    };
  });
  const items = tenantsQuery.data?.items || [];
  const summary = tenantsQuery.data?.summary;
  const totalPages = tenantsQuery.data?.totalPages || 1;

  /** Só mostra chips com valor > 0 (evita badge solitário "0 Ativas") */
  const compactStats = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "total", value: summary.total, warn: false },
      { label: "ativas", value: summary.active, warn: false },
      { label: "em atraso", value: summary.overdue, warn: true },
      { label: "suspensas", value: summary.suspended, warn: true },
      { label: "vencem em 7 dias", value: summary.dueIn7Days, warn: true },
    ].filter((s) => {
      if (s.label === "total") return summary.total > 0;
      if (s.label === "ativas") return s.value > 0 && summary.total > 0;
      return s.value > 0;
    });
  }, [summary]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (tenantsQuery.isLoading && !tenantsQuery.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (tenantsQuery.isError) {
    if (isSuperadminMfaRequiredError(tenantsQuery.error)) return null;
    return (
      <EmptyState title="Não foi possível carregar as empresas. Tente novamente." />
    );
  }

  const actionPending =
    patchMutation.isPending || paymentMutation.isPending || deleteMutation.isPending;

  return (
    <div className="mx-auto max-w-[1400px]">
      <AdminPageHeader
        title="Empresas"
        actions={
          <button
            type="button"
            className="btn-primary h-9 px-4"
            onClick={() => {
              setForm((f) => ({
                ...f,
                planId: f.planId || freePlanId || "",
                forceSimilarName: false,
              }));
              setOpenCreate(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nova empresa
          </button>
        }
      />

      {/* Mini indicadores */}
      {compactStats.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {compactStats.map((s) => (
            <div
              key={s.label}
              className={cn(
                "inline-flex min-w-[4.5rem] flex-col rounded-xl border px-3 py-2",
                s.warn
                  ? "border-amber-500/[0.15] bg-amber-500/[0.06] dark:border-amber-400/20 dark:bg-amber-400/[0.06]"
                  : "border-black/[0.05] bg-white dark:border-white/[0.07] dark:bg-[#14171e]/40"
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                {s.label}
              </span>
              <span
                className={cn(
                  "mt-0.5 font-display text-base font-semibold tabular-nums leading-none",
                  s.warn
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-ink dark:text-white"
                )}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Busca + filtros */}
      <div className="mb-4 rounded-2xl border border-black/[0.05] bg-white p-3 dark:border-white/[0.07] dark:bg-[#14171e]/[0.35] sm:p-3.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              className="input h-10 pl-9 text-[13px]"
              placeholder="Buscar por nome, e-mail ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar empresa"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
            <Select
              className="w-full min-w-0 lg:w-[10.5rem]"
              size="sm"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "ALL", label: "Status: todos" },
                { value: "ACTIVE", label: "Ativas" },
                { value: "TRIAL", label: "Trial" },
                { value: "BLOCKED", label: "Bloqueadas" },
                { value: "SUSPENDED", label: "Suspensas" },
                { value: "CANCELLED", label: "Canceladas" },
                { value: "PENDING_DELETION", label: "Exclusão agendada" },
              ]}
              aria-label="Status operacional"
            />
            <Select
              className="w-full min-w-0 lg:w-[11.5rem]"
              size="sm"
              value={financialFilter}
              onChange={setFinancialFilter}
              options={financialFilterOptions}
              aria-label="Status financeiro"
            />
            <Select
              className="w-full min-w-0 lg:w-[10.5rem]"
              size="sm"
              value={planFilter}
              onChange={setPlanFilter}
              options={[{ value: "ALL", label: "Plano: todos" }, ...planOptions]}
              aria-label="Plano"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white dark:border-white/[0.07] dark:bg-[#14171e]/30">
        {items.length === 0 ? (
          <div className="px-4 py-12 sm:px-6">
            <EmptyState
              compact
              icon={<Building2 className="h-5 w-5" strokeWidth={1.5} />}
              title="Nenhuma empresa encontrada"
              action={
                <button
                  type="button"
                  className="btn-primary h-9 px-4"
                  onClick={() => setOpenCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Nova empresa
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Cabeçalho leve — sem fundo pesado */}
            <div className="hidden border-b border-black/[0.04] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_auto] lg:gap-4 dark:border-white/[0.05]">
              <span>Empresa</span>
              <span>Plano / valor</span>
              <span>Financeiro</span>
              <span>Vencimento</span>
              <span className="text-right">Ações</span>
            </div>
            <div className="divide-y divide-black/[0.035] dark:divide-white/[0.045]">
              {items.map((t) => {
                const st = t.statusLabel || statusLabel[t.status] || t.status;
                const finLabel = t.financialStatusLabel || "—";
                const price =
                  t.contractedPrice != null && Number.isFinite(Number(t.contractedPrice))
                    ? formatCurrency(t.contractedPrice)
                    : null;
                return (
                  <div
                    key={t.id}
                    className="grid gap-3 px-4 py-4 transition-colors hover:bg-black/[0.012] sm:px-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_auto] lg:items-center lg:gap-4 dark:hover:bg-white/[0.018]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <CompanyMark name={t.name} logoUrl={t.logoUrl} color={t.primaryColor} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13.5px] font-semibold text-ink dark:text-white">
                            {t.name}
                          </p>
                          <span
                            className={cn(
                              "badge text-[10px]",
                              statusBadgeClass(t.status)
                            )}
                          >
                            {st}
                          </span>
                          {t.needsAttention && t.financialStatus === "OVERDUE" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                              <AlertTriangle className="h-3 w-3" />
                              {t.daysOverdueLabel || "Atrasada"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-ink-muted">
                          <span className="tabular-nums">
                            {t._count?.members ?? 0} usuário
                            {(t._count?.members ?? 0) === 1 ? "" : "s"}
                          </span>
                          <span className="text-ink-faint"> · </span>
                          <span className="tabular-nums">
                            {t._count?.contacts ?? 0} contatos
                          </span>
                          {t.primaryAdmin?.email ? (
                            <>
                              <span className="text-ink-faint"> · </span>
                              <span className="truncate">{t.primaryAdmin.email}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0 pl-12 lg:pl-0">
                      <p className="truncate text-[13px] font-medium text-ink dark:text-white">
                        {t.plan?.name || "Sem plano"}
                      </p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-ink-muted">
                        {price ? `${price}/mês` : "Valor não definido"}
                      </p>
                    </div>

                    <div className="min-w-0 pl-12 lg:pl-0">
                      <span
                        className={cn(
                          "badge text-[10px]",
                          financialBadgeClass(t.financialStatus)
                        )}
                      >
                        {finLabel}
                      </span>
                      {t.daysOverdue != null && t.daysOverdue > 0 && (
                        <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                          {t.daysOverdueLabel}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 pl-12 text-[12px] lg:pl-0">
                      {t.billingDueDayLabel ? (
                        <>
                          <p className="font-medium text-ink-secondary dark:text-gray-300">
                            {t.billingDueDayLabel}
                          </p>
                          <p className="mt-0.5 text-ink-faint">
                            Próx.{" "}
                            <span className="tabular-nums text-ink dark:text-gray-200">
                              {formatDateOnly(t.nextDueAt)}
                            </span>
                          </p>
                        </>
                      ) : t.nextDueAt ? (
                        <p className="text-ink-muted">
                          Próx.{" "}
                          <span className="tabular-nums text-ink dark:text-gray-200">
                            {formatDateOnly(t.nextDueAt)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-ink-faint">Sem vencimento</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center justify-end pl-12 lg:pl-0">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="btn-secondary btn-sm h-8 px-3.5 text-[12px] font-medium"
                      >
                        Gerenciar
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-black/[0.04] px-4 py-3 text-xs text-ink-muted dark:border-white/[0.05] sm:px-5">
                <span>
                  {tenantsQuery.data?.total || 0} empresa
                  {(tenantsQuery.data?.total || 0) === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary h-8 px-3"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="flex items-center px-1 tabular-nums">
                    {page}/{totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary h-8 px-3"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Criar */}
      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Nova empresa"
        size="lg"
        variant="contextual"
        initialFocus="panel"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              onClick={() => setOpenCreate(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-admin-create-tenant"
              className="btn-primary h-9 px-4"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Criando…" : "Criar empresa"}
            </button>
          </DialogFooter>
        }
      >
        <form
          id="nf-admin-create-tenant"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void createMutation.mutateAsync();
          }}
          className="space-y-5"
        >
          <FormSection title="Empresa" surface>
            <FormField label="Nome" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value, forceSimilarName: false })
                }
                required
                placeholder="Ex.: Fm Conteúdos"
              />
            </FormField>
          </FormSection>

          <FormSection title="Administrador inicial" surface>
            <FieldGrid>
              <FormField label="Nome" required>
                <input
                  className="input"
                  value={form.adminName}
                  onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  required
                  placeholder="Ex.: Maria Silva"
                />
              </FormField>
              <FormField label="E-mail" required>
                <input
                  className="input"
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  required
                  placeholder="admin@empresa.com"
                />
              </FormField>
            </FieldGrid>
            <FormField
              label="Senha inicial"
              hint="Opcional se o e-mail já existir."
            >
              <input
                className="input"
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                minLength={8}
                placeholder="Mínimo 8 caracteres"
              />
            </FormField>
          </FormSection>

          <FormSection title="Plano" surface>
            <FormField label="Plano inicial">
              <Select
                value={form.planId || freePlanId || ""}
                onChange={(planId) => setForm({ ...form, planId })}
                options={
                  planOptions.length > 0
                    ? planOptions
                    : freePlanId
                      ? [{ value: freePlanId, label: "Gratuito" }]
                      : [{ value: "", label: "Carregando…" }]
                }
                aria-label="Plano"
              />
            </FormField>
          </FormSection>

          {form.forceSimilarName ? (
            <ConsequenceBanner tone="warning">
              Já existe empresa com nome semelhante. Confirme criando novamente se for
              intencional.
            </ConsequenceBanner>
          ) : null}
        </form>
      </Modal>

      {/* Impersonar */}
      <Modal
        open={!!impTarget && !stepUpOpen}
        onClose={() => setImpTarget(null)}
        title="Acessar como esta empresa?"
        description="Ações serão registradas. A Administração fica bloqueada durante o acesso."
        variant="confirm"
        size="sm"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              onClick={() => setImpTarget(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={impersonateMutation.isPending || !impTarget}
              onClick={() => impTarget && impersonateMutation.mutate(impTarget.id)}
            >
              {impersonateMutation.isPending ? "Acessando…" : "Acessar empresa"}
            </button>
          </DialogFooter>
        }
      >
        <p className="text-sm text-ink-secondary dark:text-gray-300">
          Você navegará como usuário de{" "}
          <strong className="text-ink dark:text-white">{impTarget?.name}</strong>.
        </p>
      </Modal>

      {/* Step-up: reconfirmação de identidade */}
      <Modal
        open={stepUpOpen}
        onClose={() => {
          if (stepUpMutation.isPending || impersonateMutation.isPending) return;
          setStepUpOpen(false);
          setStepUpForm({ password: "", code: "" });
        }}
        title="Confirme sua identidade"
        description="Por segurança, confirme a senha da conta de superadministrador para acessar a empresa."
        variant="soft"
        size="sm"
        preventClose={stepUpMutation.isPending || impersonateMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 px-3.5"
              disabled={stepUpMutation.isPending}
              onClick={() => {
                setStepUpOpen(false);
                setStepUpForm({ password: "", code: "" });
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={
                stepUpMutation.isPending ||
                impersonateMutation.isPending ||
                !stepUpForm.password
              }
              onClick={() => stepUpMutation.mutate()}
            >
              {stepUpMutation.isPending || impersonateMutation.isPending
                ? "Confirmando…"
                : "Confirmar e acessar"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          <FormField label="Senha" required>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={stepUpForm.password}
              onChange={(e) =>
                setStepUpForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </FormField>
          <FormField
            label="Código MFA"
            hint="Obrigatório se a autenticação em duas etapas estiver ativa."
          >
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={stepUpForm.code}
              onChange={(e) =>
                setStepUpForm((f) => ({ ...f, code: e.target.value }))
              }
            />
          </FormField>
        </div>
      </Modal>

      {/* Registrar pagamento — FINANCIAL ACTION */}
      <Modal
        open={actionKind === "payment" && !!actionTarget}
        onClose={closeAction}
        title="Registrar pagamento"
        description={actionTarget?.name}
        size="lg"
        variant="contextual"
        initialFocus="panel"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={closeAction}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={actionPending || !payForm.amount}
              onClick={() => {
                if (!actionTarget) return;
                const amount = Number(String(payForm.amount).replace(",", "."));
                if (!Number.isFinite(amount) || amount <= 0) {
                  toast({ kind: "error", title: "Informe um valor válido" });
                  return;
                }
                const paidAt = payForm.paidAt
                  ? new Date(`${payForm.paidAt}T12:00:00.000Z`).toISOString()
                  : undefined;
                paymentMutation.mutate({
                  id: actionTarget.id,
                  json: {
                    amount,
                    paidAt,
                    referencePeriod: payForm.referencePeriod || null,
                    method: payForm.method || null,
                    notes: payForm.notes || null,
                    advanceDueDate: true,
                  },
                });
              }}
            >
              {paymentMutation.isPending ? "Registrando…" : "Registrar pagamento"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-5">
          {actionTarget ? (
            <EntitySummary
              title={actionTarget.name}
              subtitle={
                actionTarget.plan?.name
                  ? `Plano ${actionTarget.plan.name}`
                  : "Sem plano"
              }
              meta={[
                {
                  label: "Valor contratado",
                  value:
                    actionTarget.contractedPrice != null
                      ? `${formatCurrency(actionTarget.contractedPrice)}/mês`
                      : "—",
                },
                {
                  label: "Vencimento",
                  value: actionTarget.billingDueDayLabel
                    ? actionTarget.billingDueDayLabel
                    : actionTarget.billingDueDay
                      ? `Todo dia ${actionTarget.billingDueDay}`
                      : "—",
                },
                {
                  label: "Situação",
                  value: actionTarget.financialStatusLabel || "—",
                },
                {
                  label: "Próx. vencimento",
                  value: actionTarget.nextDueAt
                    ? formatDateOnly(actionTarget.nextDueAt)
                    : "—",
                },
              ]}
            />
          ) : null}

          <FormSection title="Pagamento" surface>
            <FieldGrid>
              <FormField label="Valor" required>
                <MoneyInput
                  value={payForm.amount}
                  onChange={(amount) => setPayForm({ ...payForm, amount })}
                  placeholder="699,00"
                />
              </FormField>
              <FormField label="Data" required>
                <DateInput
                  value={payForm.paidAt}
                  onChange={(paidAt) => setPayForm({ ...payForm, paidAt })}
                  aria-label="Data do pagamento"
                />
              </FormField>
            </FieldGrid>
            <FieldGrid>
              <FormField label="Referência">
                <Select
                  value={payForm.referencePeriod}
                  onChange={(referencePeriod) =>
                    setPayForm({ ...payForm, referencePeriod })
                  }
                  options={(() => {
                    const opts: { value: string; label: string }[] = [];
                    const now = new Date();
                    for (let i = -2; i <= 6; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const value = `${y}-${m}`;
                      const label = d.toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      });
                      opts.push({
                        value,
                        label: label.charAt(0).toUpperCase() + label.slice(1),
                      });
                    }
                    if (
                      payForm.referencePeriod &&
                      !opts.some((o) => o.value === payForm.referencePeriod)
                    ) {
                      opts.unshift({
                        value: payForm.referencePeriod,
                        label: payForm.referencePeriod,
                      });
                    }
                    return opts;
                  })()}
                  aria-label="Referência"
                />
              </FormField>
              <FormField label="Método">
                <Select
                  value={payForm.method}
                  onChange={(method) => setPayForm({ ...payForm, method })}
                  options={[
                    { value: "", label: "Não informado" },
                    { value: "PIX", label: "PIX" },
                    { value: "TRANSFER", label: "Transferência" },
                    { value: "BOLETO", label: "Boleto" },
                    { value: "CARD", label: "Cartão" },
                    { value: "CASH", label: "Dinheiro" },
                    { value: "OTHER", label: "Outro" },
                  ]}
                  aria-label="Método"
                />
              </FormField>
            </FieldGrid>
            <FormField label="Observação">
              <textarea
                className="input min-h-[64px]"
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>
        </div>
      </Modal>

      {/* Alterar vencimento — QUICK ACTION */}
      <Modal
        open={actionKind === "due" && !!actionTarget}
        onClose={closeAction}
        title="Alterar vencimento"
        description={actionTarget?.name}
        size="sm"
        variant="quick"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={closeAction}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={actionPending}
              onClick={() => {
                if (!actionTarget) return;
                const day = Number(dueDay);
                if (!Number.isInteger(day) || day < 1 || day > 31) {
                  toast({ kind: "error", title: "Dia inválido (1–31)" });
                  return;
                }
                patchMutation.mutate({
                  id: actionTarget.id,
                  json: { billingDueDay: day },
                });
              }}
            >
              Salvar vencimento
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-4">
          {actionTarget ? (
            <EntitySummary
              title={actionTarget.name}
              meta={[
                {
                  label: "Atual",
                  value: actionTarget.billingDueDayLabel
                    ? actionTarget.billingDueDayLabel
                    : actionTarget.billingDueDay
                      ? `Todo dia ${actionTarget.billingDueDay}`
                      : "—",
                },
                {
                  label: "Próximo",
                  value: actionTarget.nextDueAt
                    ? formatDateOnly(actionTarget.nextDueAt)
                    : "—",
                },
              ]}
            />
          ) : null}
          <FormField label="Novo dia">
            <Select
              value={dueDay}
              onChange={setDueDay}
              options={[5, 10, 15, 20, 25, 1, 28].map((d) => ({
                value: String(d),
                label: `Todo dia ${d}`,
              }))}
              aria-label="Dia do vencimento"
            />
          </FormField>
        </div>
      </Modal>

      {/* Alterar plano — FINANCIAL / comparativo */}
      <Modal
        open={actionKind === "plan" && !!actionTarget}
        onClose={closeAction}
        title="Alterar plano"
        description={actionTarget?.name}
        size="md"
        variant="contextual"
        initialFocus="panel"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={closeAction}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 px-4"
              disabled={actionPending || !planIdEdit}
              onClick={() => {
                if (!actionTarget) return;
                const json: Record<string, unknown> = { planId: planIdEdit };
                if (priceEdit.trim()) {
                  const n = Number(String(priceEdit).replace(",", "."));
                  if (Number.isFinite(n) && n >= 0) json.priceMonthly = n;
                }
                patchMutation.mutate({ id: actionTarget.id, json });
              }}
            >
              Confirmar plano
            </button>
          </DialogFooter>
        }
      >
        {(() => {
          const currentPlan = plans.find((p) => p.id === actionTarget?.plan?.id);
          const nextPlan = plans.find((p) => p.id === planIdEdit);
          const curUsers = currentPlan?.maxUsers ?? null;
          const nextUsers = nextPlan?.maxUsers ?? null;
          const curContacts = currentPlan?.maxContacts ?? null;
          const nextContacts = nextPlan?.maxContacts ?? null;
          const curAgents = planLimitAgents(currentPlan);
          const nextAgents = planLimitAgents(nextPlan);
          const usageUsers = actionTarget?._count?.members ?? 0;
          const usageContacts = actionTarget?._count?.contacts ?? 0;
          const overages: string[] = [];
          if (nextUsers != null && usageUsers > nextUsers) {
            overages.push(`${usageUsers} usuários (limite ${nextUsers})`);
          }
          if (nextContacts != null && usageContacts > nextContacts) {
            overages.push(
              `${usageContacts.toLocaleString("pt-BR")} contatos (limite ${nextContacts.toLocaleString("pt-BR")})`
            );
          }
          const showImpact =
            !!nextPlan &&
            (curUsers != null ||
              nextUsers != null ||
              curContacts != null ||
              nextContacts != null ||
              curAgents != null ||
              nextAgents != null);

          return (
            <div className="space-y-4">
              {actionTarget ? (
                <EntitySummary
                  title="Plano atual"
                  subtitle={actionTarget.plan?.name || "Sem plano"}
                  meta={[
                    {
                      label: "Valor",
                      value:
                        actionTarget.contractedPrice != null
                          ? `${formatCurrency(actionTarget.contractedPrice)}/mês`
                          : "—",
                    },
                    {
                      label: "Situação",
                      value: actionTarget.financialStatusLabel || "—",
                    },
                  ]}
                />
              ) : null}
              <FormSection title="Novo plano" surface>
                <FormField label="Plano">
                  <Select
                    value={planIdEdit}
                    onChange={setPlanIdEdit}
                    options={planOptions}
                    aria-label="Plano"
                  />
                </FormField>
                <FormField
                  label="Valor contratado"
                  hint="Em branco = manter valor atual ou do plano."
                >
                  <MoneyInput
                    value={priceEdit}
                    onChange={setPriceEdit}
                    placeholder="699,00"
                  />
                </FormField>
              </FormSection>

              {showImpact ? (
                <FormSection title="Impacto nos limites" surface>
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
                      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                        Usuários
                      </dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink dark:text-white">
                        {formatLimit(curUsers)} → {formatLimit(nextUsers)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
                      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                        Agentes
                      </dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink dark:text-white">
                        {formatLimit(curAgents)} → {formatLimit(nextAgents)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
                      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                        Contatos
                      </dt>
                      <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink dark:text-white">
                        {formatLimit(curContacts)} → {formatLimit(nextContacts)}
                      </dd>
                    </div>
                  </dl>
                  {overages.length > 0 ? (
                    <ConsequenceBanner tone="warning" className="mt-3">
                      Uso atual excede o novo plano: {overages.join("; ")}. A troca pode
                      ser bloqueada ou exigir redução de uso.
                    </ConsequenceBanner>
                  ) : null}
                </FormSection>
              ) : null}
            </div>
          );
        })()}
      </Modal>

      {/* Bloquear / Suspender / Cancelar / Reativar / Unblock */}
      <Modal
        open={
          !!actionTarget &&
          (actionKind === "block" ||
            actionKind === "unblock" ||
            actionKind === "suspend" ||
            actionKind === "reactivate" ||
            actionKind === "cancel_sub")
        }
        onClose={closeAction}
        icon={<ShieldOff className="h-4 w-4" strokeWidth={1.75} />}
        title={
          actionKind === "block"
            ? "Bloquear acesso"
            : actionKind === "unblock"
              ? "Desbloquear empresa"
              : actionKind === "suspend"
                ? "Suspender empresa"
                : actionKind === "reactivate"
                  ? "Reativar empresa"
                  : "Cancelar assinatura"
        }
        description={actionTarget?.name}
        variant={
          actionKind === "cancel_sub" || actionKind === "suspend" || actionKind === "block"
            ? "danger"
            : "confirm"
        }
        size="sm"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={closeAction}>
              Cancelar
            </button>
            <button
              type="button"
              className={cn(
                "h-9 px-4",
                actionKind === "cancel_sub" ||
                  actionKind === "suspend" ||
                  actionKind === "block"
                  ? "btn-danger"
                  : "btn-primary"
              )}
              disabled={
                actionPending ||
                ((actionKind === "block" ||
                  actionKind === "suspend" ||
                  actionKind === "cancel_sub") &&
                  !actionReason.trim())
              }
              onClick={() => {
                if (!actionTarget || !actionKind) return;
                const map: Record<string, string> = {
                  block: "block",
                  unblock: "unblock",
                  suspend: "suspend",
                  reactivate: "reactivate",
                  cancel_sub: "cancel_subscription",
                };
                const action = map[actionKind];
                patchMutation.mutate({
                  id: actionTarget.id,
                  json: {
                    action,
                    suspendReason:
                      actionKind === "suspend" ? actionReason.trim() : undefined,
                    blockReason: actionKind === "block" ? actionReason.trim() : undefined,
                    cancelReason:
                      actionKind === "cancel_sub" ? actionReason.trim() : undefined,
                  },
                });
              }}
            >
              {actionPending
                ? "Aplicando…"
                : actionKind === "block"
                  ? "Bloquear acesso"
                  : actionKind === "suspend"
                    ? "Suspender empresa"
                    : actionKind === "cancel_sub"
                      ? "Cancelar assinatura"
                      : actionKind === "reactivate"
                        ? "Reativar empresa"
                        : "Desbloquear"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          {actionTarget ? (
            <EntitySummary
              title={actionTarget.name}
              subtitle={
                actionTarget.plan?.name
                  ? `Plano ${actionTarget.plan.name}`
                  : undefined
              }
              meta={[
                {
                  label: "Status",
                  value:
                    actionTarget.statusLabel ||
                    statusLabel[actionTarget.status] ||
                    actionTarget.status,
                },
              ]}
            />
          ) : null}
          {(actionKind === "block" ||
            actionKind === "suspend" ||
            actionKind === "cancel_sub") && (
            <>
              <ConsequenceBanner
                tone={actionKind === "cancel_sub" ? "danger" : "warning"}
              >
                {actionKind === "block"
                  ? "A empresa fica sem login. Os dados são preservados."
                  : actionKind === "suspend"
                    ? "A empresa fica sem acesso. Os dados são preservados."
                    : "A assinatura é cancelada. A empresa e os dados permanecem."}
              </ConsequenceBanner>
              <FormField label="Motivo" required>
                <textarea
                  className="input min-h-[80px]"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Motivo"
                />
              </FormField>
            </>
          )}
          {actionKind === "reactivate" || actionKind === "unblock" ? (
            <p className="text-sm text-ink-secondary dark:text-gray-300">
              O acesso de{" "}
              <strong className="text-ink dark:text-white">{actionTarget?.name}</strong>{" "}
              será restaurado.
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Exclusão (zona de perigo) */}
      <Modal
        open={actionKind === "delete" && !!actionTarget}
        onClose={closeAction}
        title={`Excluir ${actionTarget?.name || "empresa"}?`}
        description="Digite o nome da empresa para confirmar."
        variant="danger"
        tone="danger"
        size="sm"
        footer={
          <DialogFooter>
            <button type="button" className="btn-secondary h-9 px-3.5" onClick={closeAction}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9 px-4"
              disabled={
                actionPending ||
                !actionTarget ||
                deleteConfirm.trim() !== actionTarget.name.trim()
              }
              onClick={() => {
                if (!actionTarget) return;
                deleteMutation.mutate({
                  id: actionTarget.id,
                  confirmName: deleteConfirm,
                  reason: actionReason || undefined,
                });
              }}
            >
              {deleteMutation.isPending ? "Processando…" : "Excluir empresa"}
            </button>
          </DialogFooter>
        }
      >
        <div className="space-y-3">
          {actionTarget ? (
            <EntitySummary
              title={actionTarget.name}
              subtitle={actionTarget.plan?.name || undefined}
              meta={[
                {
                  label: "Impacto",
                  value: "Acesso bloqueado · dados preservados",
                },
              ]}
            />
          ) : null}
          <ConsequenceBanner tone="danger">
            Agenda a exclusão. Os dados não são apagados nesta etapa.
          </ConsequenceBanner>
          <FormField label={`Digite "${actionTarget?.name || ""}"`} required>
            <input
              className="input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={actionTarget?.name}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Motivo">
            <textarea
              className="input min-h-[64px]"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Opcional"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
