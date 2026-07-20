"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";
import { AdminPageHeader } from "../../admin-page-header";

type Dep = {
  id: string;
  name: string;
  tier: string;
  status: string;
  impact: string;
  detail?: string;
};

type Health = {
  overall: string;
  generatedAt: string;
  env: string;
  dependencies: Dep[];
};

const statusLabel: Record<string, string> = {
  operational: "Operacional",
  degraded: "Degradado",
  down: "Indisponível",
  not_configured: "Não configurado",
};

const statusClass: Record<string, string> = {
  operational: "badge-success",
  degraded: "badge-warning",
  down: "badge-danger",
  not_configured: "badge-neutral",
};

export default function AdminHealthPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: () => api<Health>("/admin/platform-health"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 15_000,
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Saúde da plataforma"
        description="Estado real das dependências críticas e opcionais. Não marca operacional sem verificação."
        actions={
          <button
            type="button"
            className="btn-secondary h-9"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Atualizando…" : "Atualizar"}
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Status geral
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-ink dark:text-white">
                {statusLabel[data?.overall || ""] || data?.overall || "—"}
              </p>
            </div>
            <span className={cn(statusClass[data?.overall || ""] || "badge-neutral")}>
              {statusLabel[data?.overall || ""] || "—"}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {(data?.dependencies || []).map((d) => (
              <div key={d.id} className="card px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink dark:text-white">
                      {d.name}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      {d.tier === "CRITICAL" ? "Crítico" : "Opcional"} · {d.impact}
                    </p>
                  </div>
                  <span className={cn(statusClass[d.status] || "badge-neutral")}>
                    {statusLabel[d.status] || d.status}
                  </span>
                </div>
                {d.detail ? (
                  <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-200">
                    {d.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
