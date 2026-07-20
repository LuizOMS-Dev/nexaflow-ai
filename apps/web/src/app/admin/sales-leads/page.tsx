"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, MessageSquareText, Phone, RefreshCw, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { AdminPageHeader } from "../admin-page-header";

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

const statusTone: Record<SalesLeadStatus, string> = {
  NEW: "border-indigo-400/[0.2] bg-indigo-400/[0.08] text-indigo-700 dark:text-indigo-200",
  CONTACTED: "border-sky-400/[0.2] bg-sky-400/[0.08] text-sky-700 dark:text-sky-200",
  QUALIFIED: "border-amber-400/[0.22] bg-amber-400/[0.09] text-amber-800 dark:text-amber-200",
  WON: "border-emerald-400/[0.22] bg-emerald-400/[0.09] text-emerald-700 dark:text-emerald-200",
  LOST: "border-slate-400/[0.2] bg-slate-400/[0.08] text-slate-700 dark:text-slate-300",
  SPAM: "border-rose-400/[0.2] bg-rose-400/[0.08] text-rose-700 dark:text-rose-200",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function SalesLeadsPage() {
  const queryClient = useQueryClient();
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
  const newCount = items.filter((lead) => lead.status === "NEW").length;
  const qualifiedCount = items.filter((lead) => lead.status === "QUALIFIED").length;
  const wonCount = items.filter((lead) => lead.status === "WON").length;

  return (
    <div>
      <AdminPageHeader
        title="Leads comerciais"
        description="Pedidos de demonstração enviados pelo site público da NexaFlow."
        actions={
          <button type="button" className="btn-secondary inline-flex h-9 items-center gap-2 px-3 text-xs" onClick={() => leads.refetch()} disabled={leads.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${leads.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Novos", newCount, "text-indigo-600 dark:text-indigo-300"],
          ["Qualificados", qualifiedCount, "text-amber-600 dark:text-amber-300"],
          ["Convertidos", wonCount, "text-emerald-600 dark:text-emerald-300"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-[#12151c]">
            <p className="text-xs font-medium text-ink-muted">{String(label)}</p>
            <p className={`mt-1 font-display text-2xl font-semibold ${String(tone)}`}>{String(value)}</p>
          </div>
        ))}
      </div>

      {leads.isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-black/[0.06] bg-white text-sm text-ink-muted dark:border-white/[0.08] dark:bg-[#12151c]">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          Carregando leads...
        </div>
      ) : leads.isError ? (
        <div className="rounded-xl border border-red-400/[0.18] bg-red-400/[0.07] p-5 text-sm text-red-700 dark:text-red-200">
          Não foi possível carregar os pedidos comerciais.
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-black/[0.1] bg-white p-8 text-center dark:border-white/[0.12] dark:bg-[#12151c]">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-400/[0.1] text-indigo-500">
            <UserPlus className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-ink dark:text-white">Nenhum pedido recebido</h2>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-ink-muted">Os formulários enviados pela página pública aparecerão aqui.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#12151c]">
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {items.map((lead) => (
              <article key={lead.id} className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.1fr_1fr_0.9fr_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-ink dark:text-white">{lead.name}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone[lead.status]}`}>
                      {statusOptions.find((option) => option.value === lead.status)?.label}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Building2 className="h-3.5 w-3.5" />
                    {lead.companyName}
                    {lead.teamSize ? ` · ${lead.teamSize} pessoas` : ""}
                  </p>
                  <p className="mt-2 text-[11px] text-ink-faint">Recebido em {formatDate(lead.createdAt)}</p>
                </div>

                <div className="space-y-2 text-xs">
                  <a className="flex items-center gap-2 text-ink-muted transition hover:text-brand-600" href={`mailto:${lead.email}`}>
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{lead.email}</span>
                  </a>
                  {lead.phone ? (
                    <a className="flex items-center gap-2 text-ink-muted transition hover:text-brand-600" href={`tel:${lead.phone}`}>
                      <Phone className="h-3.5 w-3.5" />
                      {lead.phone}
                    </a>
                  ) : null}
                </div>

                <div className="min-w-0">
                  {lead.message ? (
                    <p className="flex items-start gap-2 text-xs leading-5 text-ink-muted">
                      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-3">{lead.message}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-ink-faint">Sem mensagem adicional.</p>
                  )}
                </div>

                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Etapa
                  <select
                    className="mt-1.5 h-9 min-w-36 rounded-lg border border-black/[0.08] bg-white px-2.5 text-xs font-medium text-ink outline-none focus:border-brand-400 dark:border-white/[0.1] dark:bg-[#0d1017] dark:text-white"
                    value={lead.status}
                    disabled={updateStatus.isPending}
                    onChange={(event) => updateStatus.mutate({ id: lead.id, status: event.target.value as SalesLeadStatus })}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
