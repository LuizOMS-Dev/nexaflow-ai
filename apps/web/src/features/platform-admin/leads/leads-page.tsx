"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ApiError, isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Modal, useToast } from "@/components/ui";
import { Select, type SelectOption } from "@/components/ui-select";
import { useAuth } from "@/store/auth";
import {
  defaultCompanyPlanId,
  planSelectLabel,
  selectablePlansForCompany,
} from "@/lib/plan-price";
import { platformAdminApi } from "../api";
import { LEAD_STATUS_LABEL } from "../labels";
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
import type { ConvertLeadInput, PlanRow, SalesLead, SalesLeadStatus } from "../types";

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "ALL", label: "Todos os status" },
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "LOST", label: "Perdido" },
  { value: "SPAM", label: "Spam" },
];

const MANAGE_STATUS_OPTIONS: SelectOption[] = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "LOST", label: "Perdido" },
  { value: "SPAM", label: "Spam" },
];

export function LeadsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <LeadsInner />
    </Suspense>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatOrigin(source?: string | null): string {
  if (!source || source === "website") return "Formulário do site";
  return source;
}

function LeadsInner() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filters = {
    search: sp.get("q") || "",
    status: sp.get("status") || "ALL",
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
    router.replace(`/admin/leads?${next.toString()}`);
  }

  function clearAllFilters() {
    router.replace("/admin/leads");
    setSearchVal("");
  }

  // Debounce search
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
    queryKey: ["platform-leads", filters],
    queryFn: () =>
      platformAdminApi.leads({
        search: filters.search || undefined,
        status: filters.status,
        page: filters.page,
        limit: 20,
      }),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 10_000,
  });

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await list.refetch();
      toast({
        title: "Lista atualizada",
        description: "Os dados dos leads comerciais foram sincronizados.",
        kind: "success",
      });
    } catch {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível sincronizar os dados.",
        kind: "error",
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  if (list.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Leads comerciais"
          description="Contatos comerciais e pedidos de demonstração recebidos pelo site público."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={<span className="inline-block h-7 w-12 animate-pulse rounded bg-white/[0.06]" />} />
          <StatCard label="Novos" value={<span className="inline-block h-7 w-12 animate-pulse rounded bg-white/[0.06]" />} />
          <StatCard label="Em pipeline" value={<span className="inline-block h-7 w-12 animate-pulse rounded bg-white/[0.06]" />} />
          <StatCard label="Convertidos" value={<span className="inline-block h-7 w-12 animate-pulse rounded bg-white/[0.06]" />} />
        </div>
        <Skeleton rows={6} />
      </div>
    );
  }

  if (list.error || !list.data) {
    if (isSuperadminMfaRequiredError(list.error)) return null;
    return (
      <ErrorHint
        title="Não foi possível carregar os leads comerciais"
        onRetry={() => void list.refetch()}
      />
    );
  }

  const { items, total, page, totalPages, summary } = list.data;
  const hasActiveFilters = Boolean(filters.search || (filters.status && filters.status !== "ALL"));
  const isGlobalEmpty = summary.total === 0 && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        title="Leads comerciais"
        description="Contatos comerciais e pedidos de demonstração recebidos pelo site público."
        actions={
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || list.isFetching}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12px] font-medium text-white/70 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            title="Atualizar lista e KPIs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing || list.isFetching ? "animate-spin text-white" : "text-white/50"}`}
            />
            <span>Atualizar</span>
          </button>
        }
      />

      {/* KPIs no topo */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total"
          value={summary.total}
          hint={summary.total === 1 ? "1 lead no total" : `${summary.total} leads no total`}
        />
        <StatCard
          label="Novos"
          value={summary.new}
          tone={summary.new > 0 ? "ok" : "default"}
          hint={summary.new === 1 ? "1 lead novo aguardando" : `${summary.new} leads novos`}
        />
        <StatCard
          label="Em pipeline"
          value={summary.inPipeline}
          tone={summary.inPipeline > 0 ? "warn" : "default"}
          hint="Contatados e qualificados"
        />
        <StatCard
          label="Convertidos"
          value={summary.converted}
          tone={summary.converted > 0 ? "ok" : "default"}
          hint="Convertidos em empresa"
        />
      </div>

      {/* Barra de Busca e Filtros */}
      <FilterBar>
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="text"
            className={`${inputClass} pl-8 pr-7 text-[12px]`}
            placeholder="Buscar por nome, e-mail, empresa ou telefone..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
          />
          {searchVal ? (
            <button
              type="button"
              onClick={() => {
                setSearchVal("");
                setParam("q", "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              title="Limpar busca"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="w-44">
          <Select
            size="sm"
            value={filters.status}
            onChange={(val) => setParam("status", val)}
            options={STATUS_FILTER_OPTIONS}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[12px] text-white/40 underline-offset-2 hover:text-white hover:underline"
            >
              Limpar filtros
            </button>
          )}
          <span className="px-1 text-[12px] text-white/45">
            {total} {total === 1 ? "lead encontrado" : "leads encontrados"}
          </span>
        </div>
      </FilterBar>

      {/* Empty State Global vs Empty State de Filtro */}
      {isGlobalEmpty ? (
        <EmptyHint title="Nenhum lead recebido ainda">
          Os contatos enviados pelos formulários comerciais aparecerão aqui.
        </EmptyHint>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-white">Nenhum lead encontrado com esses filtros.</p>
          <p className="mt-1 text-[12.5px] text-white/45">
            Tente remover a busca textual ou alterar o filtro de status selecionado.
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="mt-4 inline-flex h-8 items-center rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[12px] font-medium text-white hover:bg-white/[0.08]"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <>
          {/* Tabela Desktop */}
          <div className="hidden md:block">
            <DataTable>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Empresa</Th>
                  <Th>Contato</Th>
                  <Th>Status</Th>
                  <Th>Origem</Th>
                  <Th>Recebido</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {items.map((lead) => {
                  const initials = getInitials(lead.name);
                  return (
                    <tr key={lead.id} className="hover:bg-white/[0.02]">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[11px] font-bold text-white/80">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{lead.name}</p>
                            {lead.convertedTenant ? (
                              <p className="truncate text-[11px] text-emerald-400/80">
                                Empresa: {lead.convertedTenant.name}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </Td>
                      <Td className="text-white/70">
                        <p className="font-medium text-white/90">{lead.companyName || "—"}</p>
                        {lead.teamSize ? (
                          <span className="block text-[11px] text-white/40">
                            Equipe: {lead.teamSize}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <p className="truncate text-[12px] text-white/80">{lead.email}</p>
                        {lead.phone ? (
                          <p className="text-[11px] text-white/40">{lead.phone}</p>
                        ) : (
                          <p className="text-[11px] text-white/20">Sem telefone</p>
                        )}
                      </Td>
                      <Td>
                        <ToneBadge code={lead.status}>
                          {LEAD_STATUS_LABEL[lead.status] || lead.status}
                        </ToneBadge>
                      </Td>
                      <Td className="text-[12px] text-white/50">{formatOrigin(lead.source)}</Td>
                      <Td className="text-[12px] text-white/40">{formatDate(lead.createdAt)}</Td>
                      <Td className="text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLead(lead)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11.5px] font-medium text-white/80 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
                        >
                          Gerenciar
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          {/* Cards Mobile */}
          <div className="space-y-3 md:hidden">
            {items.map((lead) => {
              const initials = getInitials(lead.name);
              return (
                <div
                  key={lead.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.12]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[11px] font-bold text-white/80">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-white">{lead.name}</p>
                        <p className="truncate text-[12px] text-white/60">{lead.companyName}</p>
                      </div>
                    </div>
                    <ToneBadge code={lead.status}>
                      {LEAD_STATUS_LABEL[lead.status] || lead.status}
                    </ToneBadge>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-1 text-[12px] text-white/50">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/35" />
                      <span className="truncate text-white/80">{lead.email}</span>
                    </div>
                    {lead.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-white/35" />
                        <span>{lead.phone}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.04] pt-2.5 text-[11.5px] text-white/40">
                    <span>{formatDate(lead.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 text-[11.5px] font-medium text-white hover:bg-white/[0.08]"
                    >
                      Gerenciar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            unit="leads"
            onPage={(p: number) => setParam("page", String(p))}
          />
        </>
      )}

      {/* Drawer / Modal de Gerenciamento do Lead */}
      {selectedLead && (
        <ManageLeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onOpenConvert={() => {
            setConvertModalOpen(true);
          }}
          onStatusUpdated={(updated) => {
            setSelectedLead(updated);
            void qc.invalidateQueries({ queryKey: ["platform-leads"] });
          }}
        />
      )}

      {/* Modal de Conversão em Empresa */}
      {convertModalOpen && selectedLead && (
        <ConvertLeadModal
          lead={selectedLead}
          onClose={() => setConvertModalOpen(false)}
          onSuccess={(company, updatedLead) => {
            setConvertModalOpen(false);
            setSelectedLead(updatedLead);
            void qc.invalidateQueries({ queryKey: ["platform-leads"] });
            void qc.invalidateQueries({ queryKey: ["platform-companies"] });
          }}
        />
      )}
    </div>
  );
}

function ManageLeadModal({
  lead,
  onClose,
  onOpenConvert,
  onStatusUpdated,
}: {
  lead: SalesLead;
  onClose: () => void;
  onOpenConvert: () => void;
  onStatusUpdated: (updated: SalesLead) => void;
}) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>(
    lead.status === "CONVERTED" || lead.status === "WON" ? "QUALIFIED" : lead.status
  );

  const isConverted = lead.status === "CONVERTED" || lead.status === "WON";

  const patchStatusMut = useMutation({
    mutationFn: (newStatus: string) => platformAdminApi.patchLead(lead.id, newStatus),
    onSuccess: (updated) => {
      toast({
        title: "Status atualizado",
        description: `O lead foi marcado como ${LEAD_STATUS_LABEL[updated.status] || updated.status}.`,
        kind: "success",
      });
      onStatusUpdated(updated);
    },
    onError: (e) => {
      toast({
        title: "Não foi possível atualizar o lead",
        description: e instanceof Error ? e.message : "Erro ao processar a alteração.",
        kind: "error",
      });
    },
  });

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    patchStatusMut.mutate(val);
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={lead.name}
      description={`Lead recebido em ${formatDate(lead.createdAt)}`}
      size="lg"
      variant="detail"
      headerExtra={
        <ToneBadge code={lead.status}>
          {LEAD_STATUS_LABEL[lead.status] || lead.status}
        </ToneBadge>
      }
    >
      <div className="space-y-5">
        {/* Banner de Lead Convertido */}
        {isConverted && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-emerald-200">
                  Lead convertido em empresa
                </p>
                <p className="text-[12px] text-emerald-300/70">
                  {lead.convertedTenant
                    ? `Empresa criada: ${lead.convertedTenant.name}`
                    : "Empresa vinculada com sucesso."}
                </p>
              </div>
            </div>
            {lead.convertedTenantId && (
              <Link
                href={`/admin/companies/${lead.convertedTenantId}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/20 px-3 text-[12px] font-medium text-emerald-100 hover:bg-emerald-500/30 transition-colors"
              >
                <span>Abrir empresa</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* Informações Cadastrais */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40 mb-3">
            Dados do contato
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-[13px]">
            <div>
              <span className="block text-[11px] text-white/40">Empresa</span>
              <p className="font-medium text-white">{lead.companyName || "Não informada"}</p>
            </div>
            <div>
              <span className="block text-[11px] text-white/40">Tamanho da equipe</span>
              <p className="font-medium text-white">{lead.teamSize || "Não informado"}</p>
            </div>
            <div>
              <span className="block text-[11px] text-white/40">E-mail</span>
              <a
                href={`mailto:${lead.email}`}
                className="font-medium text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                {lead.email}
              </a>
            </div>
            <div>
              <span className="block text-[11px] text-white/40">Telefone</span>
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="font-medium text-white hover:text-brand-300 inline-flex items-center gap-1"
                >
                  {lead.phone}
                </a>
              ) : (
                <p className="text-white/40">Não informado</p>
              )}
            </div>
            <div>
              <span className="block text-[11px] text-white/40">Origem</span>
              <p className="text-white/80">{formatOrigin(lead.source)}</p>
            </div>
            <div>
              <span className="block text-[11px] text-white/40">Recebido em</span>
              <p className="text-white/80">{formatDate(lead.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Mensagem / Interesse */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40 mb-2">
            Mensagem / Interesse recebido
          </p>
          {lead.message ? (
            <p className="text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap">
              {lead.message}
            </p>
          ) : (
            <p className="text-[12.5px] italic text-white/35">Nenhuma mensagem adicional informada.</p>
          )}
        </div>

        {/* Ações Comerciais */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40 mb-3">
            Ações comerciais
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="w-full sm:w-56">
              <span className="block text-[11px] text-white/40 mb-1">Status comercial</span>
              <Select
                size="sm"
                value={isConverted ? "CONVERTED" : selectedStatus}
                disabled={patchStatusMut.isPending || isConverted}
                onChange={handleStatusChange}
                options={
                  isConverted
                    ? [{ value: "CONVERTED", label: "Convertido" }]
                    : MANAGE_STATUS_OPTIONS
                }
              />
            </div>

            {!isConverted && (
              <div className="w-full sm:w-auto flex flex-col items-start sm:items-end">
                <span className="block text-[11px] text-white/40 mb-1">Conversão oficial</span>
                <button
                  type="button"
                  onClick={onOpenConvert}
                  className="w-full sm:w-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-600/25 px-4 text-[12.5px] font-medium text-brand-200 transition-colors hover:bg-brand-600/40 hover:text-white"
                >
                  <Sparkles className="h-4 w-4 text-brand-400" />
                  <span>Converter em empresa</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConvertLeadModal({
  lead,
  onClose,
  onSuccess,
}: {
  lead: SalesLead;
  onClose: () => void;
  onSuccess: (company: { id: string; name: string; slug: string }, updatedLead: SalesLead) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(lead.companyName || "");
  const [adminName, setAdminName] = useState(lead.name || "");
  const [adminEmail, setAdminEmail] = useState(lead.email || "");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [planId, setPlanId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ["platform-plans-commercial"],
    queryFn: () => platformAdminApi.plans(true),
    staleTime: 60_000,
  });

  const selectablePlans = useMemo(() => {
    return selectablePlansForCompany((plansQuery.data || []) as PlanRow[]);
  }, [plansQuery.data]);

  useEffect(() => {
    if (selectablePlans.length > 0 && !planId) {
      setPlanId(defaultCompanyPlanId(selectablePlans));
    }
  }, [selectablePlans, planId]);

  const planOptions: SelectOption[] = useMemo(() => {
    return selectablePlans.map((p) => ({
      value: p.id,
      label: planSelectLabel(p),
      description: p.description || undefined,
    }));
  }, [selectablePlans]);

  const convertMut = useMutation({
    mutationFn: (body: ConvertLeadInput) => platformAdminApi.convertLead(lead.id, body),
    onSuccess: (data) => {
      toast({
        title: "Lead convertido em empresa",
        description: `A empresa ${data.company.name} foi criada com sucesso.`,
        kind: "success",
      });
      onSuccess(data.company, data.lead);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors(err.fieldErrors);
        } else {
          setGeneralError(err.message);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("Não foi possível converter o lead em empresa.");
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Informe o nome da empresa.";
    if (!adminName.trim()) errors.adminName = "Informe o nome do administrador.";
    if (!adminEmail.trim()) errors.adminEmail = "Informe o e-mail do administrador.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    convertMut.mutate({
      name: name.trim(),
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      planId: planId || undefined,
      adminPassword: adminPassword.trim() || undefined,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Converter Lead em Empresa"
      description="Crie a empresa transacionalmente na plataforma reutilizando os dados do lead comercial."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {generalError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[12.5px] text-red-200">
            {generalError}
          </div>
        )}

        {/* Informações da Empresa */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
            Informações da Empresa
          </p>
          <Field label="Nome da Empresa *" error={fieldErrors.name}>
            <input
              type="text"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Minha Empresa Ltda"
              disabled={convertMut.isPending}
            />
          </Field>
        </div>

        {/* Administrador Inicial */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
            Administrador Inicial
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field label="Nome do Administrador *" error={fieldErrors.adminName}>
                <input
                  type="text"
                  className={inputClass}
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex: João Silva"
                  disabled={convertMut.isPending}
                />
              </Field>
            </div>

            <div>
              <Field label="E-mail do Administrador *" error={fieldErrors.adminEmail}>
                <input
                  type="email"
                  className={inputClass}
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  disabled={convertMut.isPending}
                />
              </Field>
            </div>
          </div>

          <div>
            <Field
              label="Senha (opcional)"
              hint="Se não informada, uma senha temporária segura será gerada automaticamente ou a senha existente será mantida."
              error={fieldErrors.adminPassword}
            >
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className={`${inputClass} pr-9`}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  disabled={convertMut.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>
        </div>

        {/* Plano Inicial */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/40">
            Plano Inicial
          </p>
          <Field label="Selecione o plano da contratação" error={fieldErrors.planId}>
            {plansQuery.isLoading ? (
              <div className="h-9 w-full animate-pulse rounded-lg bg-white/[0.06]" />
            ) : (
              <Select
                value={planId}
                onChange={setPlanId}
                options={planOptions}
                placeholder="Selecione o plano"
                disabled={convertMut.isPending}
              />
            )}
          </Field>
          {fieldErrors.planId && (
            <p className="text-[11.5px] text-rose-400">{fieldErrors.planId}</p>
          )}
        </div>

        {/* Rodapé / CTAs */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={convertMut.isPending}
            className="inline-flex h-9 items-center rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 text-[12.5px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={convertMut.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-500 bg-brand-600 px-4 text-[12.5px] font-medium text-white hover:bg-brand-500 shadow-sm disabled:opacity-50"
          >
            {convertMut.isPending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Criando empresa...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Confirmar e Criar Empresa</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
