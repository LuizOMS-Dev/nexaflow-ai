"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Target,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AdminErrorState,
  AdminFilterBar,
  AdminPageHeader,
  AdminPageSkeleton,
  AdminSearchInput,
  AdminSection,
  AdminSelectFilter,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
  type AdminTone,
} from "@/components/admin";

type SalesLeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST" | "SPAM";

type SalesLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string;
  teamSize: string | null;
  message: string | null;
  source: string;
  status: SalesLeadStatus;
  createdAt: string;
  updatedAt: string;
};

const statusOptions: Array<{ value: SalesLeadStatus; label: string }> = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "WON", label: "Convertido" },
  { value: "LOST", label: "Perdido" },
  { value: "SPAM", label: "Spam" },
];

const leadStatusTone: Record<SalesLeadStatus, AdminTone> = {
  NEW: "info",
  CONTACTED: "brand",
  QUALIFIED: "warning",
  WON: "success",
  LOST: "neutral",
  SPAM: "danger",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: SalesLeadStatus) {
  return statusOptions.find((o) => o.value === status)?.label ?? status;
}

export default function SalesLeadsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const leads = useQuery({
    queryKey: ["admin-sales-leads"],
    queryFn: () => api<SalesLead[]>("/admin/sales-leads"),
    staleTime: 30_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SalesLeadStatus }) =>
      api(`/admin/sales-leads/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sales-leads"] }),
  });

  const items = leads.data || [];

  const metrics = useMemo(() => {
    const newCount = items.filter((l) => l.status === "NEW").length;
    const pipeline = items.filter((l) =>
      l.status === "CONTACTED" || l.status === "QUALIFIED"
    ).length;
    const wonCount = items.filter((l) => l.status === "WON").length;
    return {
      total: items.length,
      newCount,
      pipeline,
      wonCount,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((lead) => {
      if (statusFilter !== "ALL" && lead.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [lead.name, lead.email, lead.companyName, lead.phone || "", lead.message || ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, statusFilter]);

  if (leads.isLoading) return <AdminPageSkeleton metrics={4} />;

  if (leads.isError) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Leads comerciais" />
        <AdminErrorState
          title="Não foi possível carregar os pedidos comerciais"
          description="Verifique a conexão e tente novamente."
          onRetry={() => void leads.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Leads comerciais"
        actions={
          <button
            type="button"
            className="admin-btn-secondary h-8 px-2.5 text-[12px]"
            onClick={() => void leads.refetch()}
            disabled={leads.isFetching}
            aria-label="Atualizar lista"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${leads.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      <MetricGrid cols={4}>
        <MetricCard
          label="Total"
          value={metrics.total}
          icon={<Users className="h-4 w-4" />}
          tone="neutral"
          compact
        />
        <MetricCard
          label="Novos"
          value={metrics.newCount}
          icon={<UserPlus className="h-4 w-4" />}
          tone="info"
          compact
        />
        <MetricCard
          label="Em pipeline"
          value={metrics.pipeline}
          icon={<Target className="h-4 w-4" />}
          tone="warning"
          compact
        />
        <MetricCard
          label="Convertidos"
          value={metrics.wonCount}
          icon={<Trophy className="h-4 w-4" />}
          tone="success"
          compact
        />
      </MetricGrid>

      <AdminFilterBar>
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar nome, e-mail ou empresa…"
          id="sales-leads-search"
        />
        <AdminSelectFilter
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: "Todos os status" },
            ...statusOptions.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
        <span className="text-[12px] text-gray-500 sm:ml-auto">
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
      </AdminFilterBar>

      <AdminSection flush>
        {filtered.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
              <UserPlus className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[13.5px] font-semibold text-white/85">
              {items.length === 0 ? "Nenhum pedido recebido" : "Nenhum lead com estes filtros"}
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-gray-500">
              {items.length === 0
                ? "Formulários da página pública aparecerão aqui."
                : "Ajuste a busca ou o filtro de status."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {filtered.map((lead) => (
              <article
                key={lead.id}
                className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[1.15fr_1fr_1fr_auto] xl:items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[13.5px] font-semibold text-white">{lead.name}</h2>
                    <StatusBadge tone={leadStatusTone[lead.status] || statusToTone(lead.status)} dot>
                      {statusLabel(lead.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-gray-400">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate">
                      {lead.companyName}
                      {lead.teamSize ? ` · ${lead.teamSize} pessoas` : ""}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[11px] text-gray-600">
                    Recebido em {formatDate(lead.createdAt)}
                    {lead.source ? ` · ${lead.source}` : ""}
                  </p>
                </div>

                <div className="space-y-2 text-[12.5px]">
                  <a
                    className="flex items-center gap-2 text-gray-400 transition-colors hover:text-violet-300"
                    href={`mailto:${lead.email}`}
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate">{lead.email}</span>
                  </a>
                  {lead.phone ? (
                    <a
                      className="flex items-center gap-2 text-gray-400 transition-colors hover:text-violet-300"
                      href={`tel:${lead.phone}`}
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      {lead.phone}
                    </a>
                  ) : (
                    <p className="text-[12px] text-gray-600">Sem telefone</p>
                  )}
                </div>

                <div className="min-w-0">
                  {lead.message ? (
                    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-gray-400">
                      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                      <span className="line-clamp-3">{lead.message}</span>
                    </p>
                  ) : (
                    <p className="text-[12px] text-gray-600">Sem mensagem adicional.</p>
                  )}
                </div>

                <AdminSelectFilter
                  label="Etapa"
                  className="min-w-[150px]"
                  value={lead.status}
                  disabled={updateStatus.isPending}
                  options={statusOptions}
                  onChange={(status) =>
                    updateStatus.mutate({
                      id: lead.id,
                      status: status as SalesLeadStatus,
                    })
                  }
                />
              </article>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  );
}
