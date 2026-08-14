"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Database,
  Server,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatDate } from "@/lib/utils";
import {
  AdminErrorState,
  AdminPageHeader,
  AdminSection,
  AdminSkeleton,
  MetricCard,
  MetricGrid,
  StatusBadge,
  statusToTone,
  type AdminTone,
} from "@/components/admin";

type Dep = {
  id: string;
  name: string;
  tier: string;
  status: string;
  impact: string;
  detail?: string;
  /** Present when API probes latency (optional) */
  latencyMs?: number | null;
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

function overallLabel(overall?: string): string {
  return statusLabel[overall || ""] || overall || "—";
}

function overallTone(overall?: string): AdminTone {
  if (!overall) return "neutral";
  return statusToTone(overall);
}

function depIcon(id: string) {
  if (id === "postgres" || id === "db") return <Database className="h-4 w-4" />;
  if (id === "api") return <Server className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

export default function AdminHealthPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: () => api<Health>("/admin/platform-health"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 15_000,
  });

  const deps = data?.dependencies || [];

  const counts = useMemo(() => {
    let operational = 0;
    let degraded = 0;
    let down = 0;
    let notConfigured = 0;
    let criticalDown = 0;
    for (const d of deps) {
      if (d.status === "operational") operational += 1;
      else if (d.status === "degraded") degraded += 1;
      else if (d.status === "down") {
        down += 1;
        if (d.tier === "CRITICAL") criticalDown += 1;
      } else if (d.status === "not_configured") notConfigured += 1;
    }
    return { operational, degraded, down, notConfigured, criticalDown, total: deps.length };
  }, [deps]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando saúde">
        <div className="space-y-2">
          <AdminSkeleton className="h-8 w-52" />
          <AdminSkeleton className="h-3 w-80" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <AdminSkeleton className="h-[92px] rounded-xl" />
          <AdminSkeleton className="h-[92px] rounded-xl" />
          <AdminSkeleton className="h-[92px] rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminSkeleton className="h-28 rounded-xl" />
          <AdminSkeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <AdminErrorState
        title="Não foi possível carregar a saúde da plataforma"
        onRetry={() => void refetch()}
      />
    );
  }

  const overall = data.overall;
  const tone = overallTone(overall);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Saúde da plataforma"
        description={
          data.generatedAt
            ? `${data.env || "—"} · ${formatDate(data.generatedAt)}`
            : "Dependências críticas e opcionais (API)."
        }
        badge={{ label: overallLabel(overall), tone }}
        actions={
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Atualizando…" : "Atualizar"}
          </button>
        }
      />

      {/* Alert only when not fully operational — avoid triple overall status */}
      {counts.criticalDown > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[13px] text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
          <p>
            <span className="font-semibold">
              {counts.criticalDown} dependência(s) crítica(s) indisponível(is).
            </span>{" "}
            O status geral não pode ser operacional enquanto isso persistir.
          </p>
        </div>
      ) : overall === "degraded" ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            Plataforma em estado <strong>degradado</strong>. Veja os serviços abaixo.
          </p>
        </div>
      ) : null}

      <MetricGrid cols={4}>
        <MetricCard
          label="Operacionais"
          value={counts.operational}
          tone="success"
          compact
        />
        <MetricCard
          label="Degradados"
          value={counts.degraded}
          tone="warning"
          compact
        />
        <MetricCard
          label="Indisponíveis"
          value={counts.down}
          tone="danger"
          compact
        />
        <MetricCard
          label="Não configurados"
          value={counts.notConfigured}
          tone="info"
          compact
        />
      </MetricGrid>

      <div className="grid gap-3 sm:grid-cols-2">
        {deps.map((d) => {
          const depTone = statusToTone(d.status);
          return (
            <div
              key={d.id}
              className="admin-metric relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 " +
                      (depTone === "success"
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20"
                        : depTone === "warning"
                          ? "bg-amber-500/15 text-amber-200 ring-amber-400/20"
                          : depTone === "danger"
                            ? "bg-red-500/15 text-red-300 ring-red-400/20"
                            : "bg-white/[0.05] text-gray-300 ring-white/[0.06]")
                    }
                  >
                    {depIcon(d.id)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-white">{d.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-gray-500">
                      {d.tier === "CRITICAL" ? "Crítico" : "Opcional"} · {d.impact}
                    </p>
                  </div>
                </div>
                <StatusBadge tone={depTone} dot>
                  {statusLabel[d.status] || d.status}
                </StatusBadge>
              </div>
              {d.latencyMs != null && Number.isFinite(d.latencyMs) ? (
                <p className="mt-3 text-[12px] tabular-nums text-gray-400">
                  Latência:{" "}
                  <span className="font-medium text-gray-300">{d.latencyMs} ms</span>
                </p>
              ) : null}
              {d.detail ? (
                <p className="mt-2 text-[12px] leading-relaxed text-amber-200/90">
                  {d.detail}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {deps.length === 0 ? (
        <AdminSection>
          <p className="text-center text-[13px] text-gray-500">
            Nenhuma dependência reportada pela API.
          </p>
        </AdminSection>
      ) : null}
    </div>
  );
}
