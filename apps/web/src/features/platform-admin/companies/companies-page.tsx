"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Plus, Search, X } from "lucide-react";
import { ApiError, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatCurrency, formatCivilDate } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { Select, type SelectOption } from "@/components/ui-select";
import { useAuth } from "@/store/auth";
import { defaultCompanyPlanId, planSelectLabel, selectablePlansForCompany } from "@/lib/plan-price";
import { platformAdminApi } from "../api";
import { FINANCIAL_LABEL, STATUS_LABEL } from "../labels";
import {
  DataTable,
  EmptyHint,
  ErrorHint,
  Field,
  FilterBar,
  PageHeader,
  Pagination,
  Skeleton,
  StatCard,
  Td,
  Th,
  ToneBadge,
  inputClass,
} from "../ui";
import type { CompanyRow, PlanRow } from "../types";

export function CompaniesPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <CompaniesInner />
    </Suspense>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NF";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPlanPriceColumn(row: CompanyRow): { planName: string; priceText: string } {
  const planName = row.plan?.name || "Gratuito";
  const slug = (row.plan?.slug || "").toLowerCase();
  const isFree = slug === "free" || (!row.plan && (row.contractedPrice === 0 || row.contractedPrice == null));

  if (isFree && (row.contractedPrice == null || row.contractedPrice === 0)) {
    return { planName: "Gratuito", priceText: "Sem cobrança" };
  }

  if (row.contractedPrice != null && row.contractedPrice > 0) {
    return {
      planName,
      priceText: `${formatCurrency(row.contractedPrice)}/mês`,
    };
  }

  if (slug === "enterprise" || row.plan?.priceOnRequest) {
    return { planName, priceText: "Sob consulta" };
  }

  if (row.contractedPrice === 0) {
    return { planName, priceText: "Sem cobrança" };
  }

  return { planName, priceText: "Sob consulta" };
}

function formatDueDate(row: CompanyRow): string {
  const due = (row as { nextDueDate?: string | null }).nextDueDate || row.nextDueAt;
  if (row.status === "TRIAL") {
    return due ? `Trial até ${formatCivilDate(due)}` : "Trial ativo";
  }
  if ((row as { hasCharge?: boolean }).hasCharge === false) {
    return "Sem vencimento";
  }
  if (due) return formatCivilDate(due);
  return "Não definido";
}

function CompaniesInner() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    search: sp.get("q") || "",
    status: sp.get("status") || "ALL",
    financial: sp.get("financial") || "ALL",
    planId: sp.get("planId") || "",
    page: Number(sp.get("page") || 1),
  };

  // Local state for debounced search
  const [searchVal, setSearchVal] = useState(filters.search);

  useEffect(() => {
    setSearchVal(filters.search);
  }, [filters.search]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.replace(`/admin/companies?${next.toString()}`);
  }

  function clearAllFilters() {
    router.replace("/admin/companies");
    setSearchVal("");
  }

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchVal !== filters.search) {
        setParam("q", searchVal);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchVal]);

  const list = useQuery({
    queryKey: ["platform-companies", filters],
    queryFn: () =>
      platformAdminApi.companies({
        search: filters.search || undefined,
        status: filters.status,
        financial: filters.financial,
        planId: filters.planId || undefined,
        page: filters.page,
        limit: 30,
      }),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const plans = useQuery({
    queryKey: ["platform-plans-commercial"],
    queryFn: () => platformAdminApi.plans(true),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 60_000,
  });

  if (list.isLoading) return <Skeleton />;
  if (list.error || !list.data) {
    if (isSuperadminMfaRequiredError(list.error)) return null;
    return <ErrorHint title="Não foi possível carregar as empresas" onRetry={() => void list.refetch()} />;
  }

  const data = list.data;
  const summary = data.summary;
  const hasActiveFilters = Boolean(
    filters.search || filters.status !== "ALL" || filters.financial !== "ALL" || filters.planId
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Empresas"
        description={
          summary
            ? `${summary.total} ${summary.total === 1 ? "empresa cadastrada" : "empresas cadastradas"} · ${summary.active} ${summary.active === 1 ? "ativa" : "ativas"}`
            : "Gerencie empresas, contratos, planos e permissões de acesso."
        }
        actions={
          <button type="button" className="admin-btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </button>
        }
      />

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total de empresas"
            value={summary.total}
            hint={`${summary.active} ${summary.active === 1 ? "empresa ativa" : "empresas ativas"}`}
            href="/admin/companies"
            tone="default"
          />
          <StatCard
            label="Em atraso"
            value={summary.overdue}
            hint={summary.overdue === 0 ? "Nenhuma cobrança em atraso" : `${summary.overdue} com pendência financeira`}
            href="/admin/companies?financial=OVERDUE"
            tone={summary.overdue > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Em período trial"
            value={summary.trial}
            hint={summary.trial === 0 ? "Nenhum trial em vigor" : `${summary.trial} ${summary.trial === 1 ? "trial ativo" : "trials ativos"}`}
            href="/admin/companies?status=TRIAL"
            tone={summary.trial > 0 ? "ok" : "default"}
          />
          <StatCard
            label="Suspensas / bloqueadas"
            value={summary.suspendedBlocked ?? summary.suspended + summary.blocked}
            hint={`${summary.suspended} suspensas · ${summary.blocked} bloqueadas`}
            href="/admin/companies?status=SUSPENDED"
            tone={summary.suspended + summary.blocked > 0 ? "warn" : "default"}
          />
        </div>
      ) : null}

      {/* Barra de Filtros */}
      <FilterBar>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            className={`${inputClass} pl-8 pr-7 border-white/[0.08] bg-transparent text-[13px]`}
            placeholder="Buscar por nome, slug ou e-mail..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
            }}
          />
          {searchVal ? (
            <button
              type="button"
              onClick={() => {
                setSearchVal("");
                setParam("q", "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <select
          className={`${inputClass} w-auto min-w-[8.5rem] border-white/[0.08] bg-transparent text-[12.5px]`}
          value={filters.status}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="ALL">Status: Todos</option>
          {(["ACTIVE", "TRIAL", "SUSPENDED", "BLOCKED", "CANCELLED", "PENDING_DELETION"] as const).map(
            (k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k] || k}
              </option>
            )
          )}
        </select>

        <select
          className={`${inputClass} w-auto min-w-[9.5rem] border-white/[0.08] bg-transparent text-[12.5px]`}
          value={filters.financial}
          onChange={(e) => setParam("financial", e.target.value)}
        >
          <option value="ALL">Financeiro: Todos</option>
          {Object.entries(FINANCIAL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          className={`${inputClass} w-auto min-w-[8.5rem] border-white/[0.08] bg-transparent text-[12.5px]`}
          value={filters.planId}
          onChange={(e) => setParam("planId", e.target.value)}
        >
          <option value="">Plano: Todos</option>
          {(plans.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {hasActiveFilters ? (
          <button
            type="button"
            className="admin-btn-ghost h-9 px-2.5 text-[12px] text-white/60 hover:text-white"
            onClick={clearAllFilters}
          >
            Limpar filtros
          </button>
        ) : null}
      </FilterBar>

      {/* Listagem Vazia / Resultados */}
      {data.items.length === 0 ? (
        hasActiveFilters ? (
          <EmptyHint title="Nenhuma empresa encontrada">
            Nenhuma empresa corresponde aos filtros aplicados.
            <div className="mt-3">
              <button type="button" className="admin-btn-secondary text-[12px]" onClick={clearAllFilters}>
                Limpar filtros
              </button>
            </div>
          </EmptyHint>
        ) : (
          <EmptyHint title="Nenhuma empresa cadastrada">
            Comece cadastrando a primeira empresa na plataforma.
            <div className="mt-3">
              <button
                type="button"
                className="admin-btn-primary text-[12px]"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova empresa
              </button>
            </div>
          </EmptyHint>
        )
      ) : (
        <>
          {/* Visualização Desktop / Tablet */}
          <div className="hidden sm:block">
            <DataTable minWidth="860px">
              <thead>
                <tr>
                  <Th className="w-[38%]">Empresa</Th>
                  <Th className="w-[20%]">Plano / Valor</Th>
                  <Th className="w-[16%]">Financeiro</Th>
                  <Th className="w-[14%]">Vencimento</Th>
                  <Th className="w-[12%] text-right pr-4">Ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.items.map((row) => {
                  const planInfo = formatPlanPriceColumn(row);
                  const dueDate = formatDueDate(row);
                  const userCount = row._count?.members ?? 1;
                  const contactCount = row._count?.contacts ?? 0;
                  const adminEmail = row.primaryAdmin?.email || "Sem administrador";

                  return (
                    <tr
                      key={row.id}
                      className="group transition-colors hover:bg-white/[0.025]"
                    >
                      {/* 1. EMPRESA */}
                      <Td>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: row.primaryColor ? `${row.primaryColor}22` : "rgba(139, 92, 246, 0.15)",
                              color: row.primaryColor || "#c4b5fd",
                              border: `1px solid ${row.primaryColor ? `${row.primaryColor}44` : "rgba(139, 92, 246, 0.25)"}`,
                            }}
                          >
                            {getInitials(row.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/companies/${row.id}`}
                                className="truncate font-medium text-white transition-colors hover:text-violet-300"
                              >
                                {row.name}
                              </Link>
                              <ToneBadge code={row.status}>
                                {row.statusLabel || STATUS_LABEL[row.status]}
                              </ToneBadge>
                            </div>
                            <p className="mt-0.5 truncate text-[11.5px] text-white/40">
                              {userCount} {userCount === 1 ? "usuário" : "usuários"} · {contactCount}{" "}
                              {contactCount === 1 ? "contato" : "contatos"} ·{" "}
                              <span className="text-white/50">{adminEmail}</span>
                            </p>
                          </div>
                        </div>
                      </Td>

                      {/* 2. PLANO / VALOR */}
                      <Td>
                        <p className="font-medium text-white/90 text-[13px]">{planInfo.planName}</p>
                        <p className="text-[11.5px] text-white/40">{planInfo.priceText}</p>
                      </Td>

                      {/* 3. STATUS FINANCEIRO */}
                      <Td>
                        <ToneBadge code={row.financialStatus}>
                          {row.financialStatusLabel || FINANCIAL_LABEL[row.financialStatus || ""] || "—"}
                        </ToneBadge>
                      </Td>

                      {/* 4. VENCIMENTO */}
                      <Td>
                        <span className="text-[12.5px] text-white/70">{dueDate}</span>
                      </Td>

                      {/* 5. AÇÕES */}
                      <Td className="text-right pr-4">
                        <Link
                          href={`/admin/companies/${row.id}`}
                          className="admin-btn-secondary h-8 px-3 text-[12px] inline-flex items-center gap-1 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 group-hover:text-violet-200"
                        >
                          Gerenciar
                          <ArrowRight className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          {/* Visualização Mobile (Cards compactos) */}
          <div className="grid gap-3 sm:hidden">
            {data.items.map((row) => {
              const planInfo = formatPlanPriceColumn(row);
              const dueDate = formatDueDate(row);
              const userCount = row._count?.members ?? 1;
              const contactCount = row._count?.contacts ?? 0;
              const adminEmail = row.primaryAdmin?.email || "Sem administrador";

              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: row.primaryColor ? `${row.primaryColor}22` : "rgba(139, 92, 246, 0.15)",
                        color: row.primaryColor || "#c4b5fd",
                        border: `1px solid ${row.primaryColor ? `${row.primaryColor}44` : "rgba(139, 92, 246, 0.25)"}`,
                      }}
                    >
                      {getInitials(row.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/admin/companies/${row.id}`}
                          className="truncate text-[14px] font-semibold text-white"
                        >
                          {row.name}
                        </Link>
                        <ToneBadge code={row.status}>
                          {row.statusLabel || STATUS_LABEL[row.status]}
                        </ToneBadge>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-white/40">
                        {userCount} usu. · {contactCount} cont. · {adminEmail}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/[0.02] p-2 text-[12px]">
                    <div>
                      <span className="block text-[10.5px] uppercase tracking-wider text-white/40">Plano</span>
                      <span className="font-medium text-white/85">{planInfo.planName}</span>
                      <span className="block text-[11px] text-white/40">{planInfo.priceText}</span>
                    </div>
                    <div>
                      <span className="block text-[10.5px] uppercase tracking-wider text-white/40">Financeiro</span>
                      <ToneBadge code={row.financialStatus}>
                        {row.financialStatusLabel || FINANCIAL_LABEL[row.financialStatus || ""] || "—"}
                      </ToneBadge>
                      <span className="mt-0.5 block text-[11px] text-white/40">{dueDate}</span>
                    </div>
                  </div>

                  <Link
                    href={`/admin/companies/${row.id}`}
                    className="admin-btn-secondary h-8 w-full justify-center text-[12px]"
                  >
                    Gerenciar empresa
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="empresas"
            onPage={(p) => setParam("page", String(p))}
          />
        </>
      )}

      <CreateCompanyModal
        open={createOpen}
        plans={plans.data || []}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          void qc.invalidateQueries({ queryKey: ["platform-companies"] });
          toast({
            title: "Empresa criada",
            description: "A empresa foi cadastrada e já está disponível para gerenciamento.",
            kind: "success",
          });
          router.push(`/admin/companies/${id}`);
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
  onCreated: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [force, setForce] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Filtrar e ordenar planos elegíveis para novas contratações
  const eligiblePlans = useMemo(() => selectablePlansForCompany(plans), [plans]);
  const defaultPlanId = useMemo(() => defaultCompanyPlanId(eligiblePlans), [eligiblePlans]);
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId);

  useEffect(() => {
    if (open) {
      setForce(false);
      setShowPassword(false);
      setFieldErrors({});
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
    mutationFn: platformAdminApi.createCompany,
    onSuccess: (row) => onCreated(row.id),
    onError: (e) => {
      if (e instanceof ApiError) {
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
    if (!adminName || adminName.length < 2) errs.adminName = "Nome do administrador deve ter pelo menos 2 caracteres.";
    if (!adminEmail || !adminEmail.includes("@")) errs.adminEmail = "E-mail inválido.";
    if (adminPassword && adminPassword.length < 10) errs.adminPassword = "A senha deve ter pelo menos 10 caracteres.";

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    mut.mutate({
      name,
      adminName,
      adminEmail,
      adminPassword: adminPassword || undefined,
      accessMethod: adminPassword ? "temporary_password" : "invite",
      planId: selectedPlanId || undefined,
      forceSimilarName: force,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova empresa"
      description="Cadastre a empresa, o administrador inicial e o plano de acesso."
      size="md"
      footer={
        <div className="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row sm:items-center">
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="create-company-form" className="admin-btn-primary" disabled={mut.isPending}>
            {mut.isPending ? "Criando empresa…" : "Criar empresa"}
          </button>
        </div>
      }
    >
      <form id="create-company-form" className="space-y-4 pt-1" onSubmit={onSubmit}>
        {/* Seção 1: INFORMAÇÕES DA EMPRESA */}
        <div>
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Informações da empresa
          </h3>
          <div className="mt-2.5">
            <Field label="Nome da empresa">
              <input
                name="name"
                required
                minLength={2}
                placeholder="Ex.: Nexus Soluções"
                className={`${inputClass} ${fieldErrors.name ? "border-rose-500/60 focus:border-rose-500" : ""}`}
              />
            </Field>
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
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Administrador inicial
          </h3>
          <div className="mt-2.5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Field label="Nome do administrador">
                  <input
                    name="adminName"
                    required
                    minLength={2}
                    placeholder="Ex.: Luiz Otávio"
                    className={`${inputClass} ${fieldErrors.adminName ? "border-rose-500/60 focus:border-rose-500" : ""}`}
                  />
                </Field>
                {fieldErrors.adminName ? (
                  <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.adminName}</p>
                ) : null}
              </div>

              <div>
                <Field label="E-mail">
                  <input
                    name="adminEmail"
                    type="email"
                    required
                    placeholder="admin@empresa.com"
                    className={`${inputClass} ${fieldErrors.adminEmail ? "border-rose-500/60 focus:border-rose-500" : ""}`}
                  />
                </Field>
                {fieldErrors.adminEmail ? (
                  <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.adminEmail}</p>
                ) : null}
              </div>
            </div>

            <div>
              <Field
                label="Senha inicial"
                hint="Opcional se o e-mail já possuir conta no NexaFlow (o usuário será vinculado como administrador sem alterar sua senha)."
              >
                <div className="relative">
                  <input
                    id="company-admin-password"
                    name="adminPassword"
                    type={showPassword ? "text" : "password"}
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="Mínimo de 10 caracteres (ou deixe em branco se já cadastrado)"
                    className={`${inputClass} pr-9 ${fieldErrors.adminPassword ? "border-rose-500/60 focus:border-rose-500" : ""}`}
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
              </Field>
              {fieldErrors.adminPassword ? (
                <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.adminPassword}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Divisor sutil */}
        <div className="border-t border-white/[0.06]" />

        {/* Seção 3: PLANO INICIAL */}
        <div>
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-violet-400">
            Plano inicial
          </h3>
          <div className="mt-2.5">
            <Field label="Plano de acesso" hint="O valor contratado é congelado na criação da empresa.">
              <Select
                value={selectedPlanId}
                onChange={setSelectedPlanId}
                options={planOptions}
                placeholder="Selecione o plano..."
                triggerClassName="bg-[#0c0d12] border-white/[0.1] text-[13px]"
              />
            </Field>
            {fieldErrors.planId ? (
              <p className="mt-1 text-[11.5px] text-rose-400">{fieldErrors.planId}</p>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
