"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSuperadminMfaRequiredError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { platformAdminApi } from "../api";
import { LEAD_STATUS_LABEL } from "../labels";
import {
  DataTable,
  EmptyHint,
  ErrorHint,
  FilterBar,
  PageHeader,
  Skeleton,
  Td,
  Th,
  ToneBadge,
  inputClass,
} from "../ui";

const LEAD_STATUS = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "SPAM"] as const;

export function LeadsPage() {
  const user = useAuth((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-leads"],
    queryFn: () => platformAdminApi.leads(),
    enabled: user?.platformRole === "SUPERADMIN",
    retry: false,
  });

  const mut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => platformAdminApi.patchLead(id, status),
    onSuccess: () => {
      toast({
        title: "Lead atualizado",
        description: "O status do lead foi modificado com sucesso.",
        kind: "success",
      });
      void qc.invalidateQueries({ queryKey: ["platform-leads"] });
    },
    onError: (e) =>
      toast({
        title: "Não foi possível atualizar o lead",
        description: e instanceof Error ? e.message : "Erro ao processar a alteração.",
        kind: "error",
      }),
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    if (isSuperadminMfaRequiredError(q.error)) return null;
    return <ErrorHint title="Não foi possível carregar os leads" onRetry={() => void q.refetch()} />;
  }

  const counts = LEAD_STATUS.reduce(
    (acc, st) => {
      acc[st] = q.data.filter((l) => l.status === st).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <PageHeader
        title="Leads comerciais"
        description="Pedidos de demonstração do site público. Atualize o status conforme o funil comercial."
      />
      <FilterBar>
        <span className="px-2 text-[12px] text-white/45">
          {q.data.length} lead{q.data.length === 1 ? "" : "s"}
          {counts.NEW ? ` · ${counts.NEW} novos` : ""}
        </span>
      </FilterBar>
      {q.data.length === 0 ? (
        <EmptyHint title="Nenhum lead ainda">
          Quando alguém pedir demo no site, o registro aparece aqui.
        </EmptyHint>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Contato</Th>
              <Th>Empresa</Th>
              <Th>Mensagem</Th>
              <Th>Status</Th>
              <Th>Quando</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {q.data.map((lead) => (
              <tr key={lead.id} className="hover:bg-white/[0.02]">
                <Td>
                  <p className="font-medium text-white">{lead.name}</p>
                  <p className="text-[11px] text-white/40">{lead.email}</p>
                  {lead.phone ? <p className="text-[11px] text-white/35">{lead.phone}</p> : null}
                </Td>
                <Td className="text-white/70">
                  {lead.companyName || "—"}
                  {lead.teamSize ? (
                    <span className="block text-[11px] text-white/35">{lead.teamSize}</span>
                  ) : null}
                </Td>
                <Td className="max-w-xs text-white/55">
                  <span className="line-clamp-2">{lead.message || "—"}</span>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1.5">
                    <ToneBadge code={lead.status === "WON" ? "ACTIVE" : lead.status === "LOST" || lead.status === "SPAM" ? "BLOCKED" : "TRIAL"}>
                      {LEAD_STATUS_LABEL[lead.status] || lead.status}
                    </ToneBadge>
                    <select
                      className={`${inputClass} h-8 max-w-[10rem] text-[12px]`}
                      value={lead.status}
                      disabled={mut.isPending}
                      onChange={(e) => mut.mutate({ id: lead.id, status: e.target.value })}
                    >
                      {!LEAD_STATUS.includes(lead.status as (typeof LEAD_STATUS)[number]) ? (
                        <option value={lead.status}>{lead.status}</option>
                      ) : null}
                      {LEAD_STATUS.map((st) => (
                        <option key={st} value={st}>
                          {LEAD_STATUS_LABEL[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                </Td>
                <Td className="text-white/40">{formatDate(lead.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
