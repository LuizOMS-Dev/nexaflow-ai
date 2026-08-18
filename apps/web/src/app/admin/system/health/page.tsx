"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Database,
  Layers,
  Mail,
  MessageSquare,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
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

type ServiceItem = {
  id: string;
  name: string;
  criticality?: "CRITICAL" | "OPTIONAL" | string;
  tier?: "CRITICAL" | "OPTIONAL" | string;
  status: "operational" | "degraded" | "down" | "not_configured" | string;
  impact?: string;
  message?: string | null;
  detail?: string | null;
  latencyMs?: number | null;
  checkedAt?: string;
};

type HealthResponse = {
  overall: "operational" | "degraded" | "down" | string;
  checkedAt?: string;
  generatedAt?: string;
  env?: string;
  summary?: {
    operational: number;
    degraded: number;
    down: number;
    notConfigured: number;
    criticalDown: number;
    total: number;
  };
  services?: ServiceItem[];
  dependencies?: ServiceItem[];
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

function getServiceIcon(id: string) {
  switch (id.toLowerCase()) {
    case "postgres":
    case "db":
    case "database":
      return <Database className="h-4 w-4" strokeWidth={1.75} />;
    case "api":
    case "server":
      return <Server className="h-4 w-4" strokeWidth={1.75} />;
    case "redis":
    case "cache":
      return <Layers className="h-4 w-4" strokeWidth={1.75} />;
    case "whatsapp":
    case "waha":
    case "evolution":
      return <MessageSquare className="h-4 w-4" strokeWidth={1.75} />;
    case "ai":
    case "groq":
    case "openai":
      return <Sparkles className="h-4 w-4" strokeWidth={1.75} />;
    case "mail":
    case "email":
    case "resend":
    case "smtp":
      return <Mail className="h-4 w-4" strokeWidth={1.75} />;
    default:
      return <Activity className="h-4 w-4" strokeWidth={1.75} />;
  }
}

function formatCheckedDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return "—";
  }
}

export default function AdminHealthPage() {
  const user = useAuth((s) => s.user);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-platform-health"],
    queryFn: () => api<HealthResponse>("/admin/platform-health"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 15_000,
    refetchInterval: 25_000,
    refetchIntervalInBackground: false,
  });

  const services = useMemo(() => {
    if (!data) return [];
    return data.services || data.dependencies || [];
  }, [data]);

  const counts = useMemo(() => {
    if (data?.summary) {
      return data.summary;
    }
    let operational = 0;
    let degraded = 0;
    let down = 0;
    let notConfigured = 0;
    let criticalDown = 0;

    for (const s of services) {
      const isCritical = s.criticality === "CRITICAL" || s.tier === "CRITICAL";
      if (s.status === "operational") operational += 1;
      else if (s.status === "degraded") degraded += 1;
      else if (s.status === "down") {
        down += 1;
        if (isCritical) criticalDown += 1;
      } else if (s.status === "not_configured") notConfigured += 1;
    }

    return {
      operational,
      degraded,
      down,
      notConfigured,
      criticalDown,
      total: services.length,
    };
  }, [data, services]);

  if (user?.platformRole !== "SUPERADMIN") return null;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando saúde">
        <div className="space-y-2">
          <AdminSkeleton className="h-8 w-52" />
          <AdminSkeleton className="h-3 w-80" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <AdminSkeleton className="h-[84px] rounded-xl" />
          <AdminSkeleton className="h-[84px] rounded-xl" />
          <AdminSkeleton className="h-[84px] rounded-xl" />
          <AdminSkeleton className="h-[84px] rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminSkeleton className="h-32 rounded-xl" />
          <AdminSkeleton className="h-32 rounded-xl" />
          <AdminSkeleton className="h-32 rounded-xl" />
          <AdminSkeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <AdminErrorState
        title="Não foi possível carregar a saúde da plataforma"
        description="Ocorreu um erro ao consultar os serviços de infraestrutura."
        onRetry={() => void refetch()}
      />
    );
  }

  const overall = data.overall;
  const tone = overallTone(overall);
  const checkedAtStr = data.checkedAt || data.generatedAt;
  const envLabel =
    data.env === "production"
      ? "Produção"
      : data.env === "development"
      ? "Desenvolvimento"
      : data.env || "Produção";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Saúde da plataforma"
        description={`${envLabel} · Última verificação: ${formatCheckedDate(checkedAtStr)}`}
        badge={{ label: overallLabel(overall), tone }}
        actions={
          <button
            type="button"
            className="admin-btn-secondary h-9 px-3.5 text-[13px] inline-flex items-center gap-2"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Verificando…" : "Atualizar"}
          </button>
        }
      />

      {/* Alerta contextual condicional para falhas e degradações */}
      {counts.criticalDown > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <p className="font-semibold text-rose-100">
              {counts.criticalDown} dependência(s) crítica(s) indisponível(is).
            </p>
            <p className="mt-0.5 text-[12px] text-rose-300/90">
              O status geral da plataforma permanecerá indisponível até que as dependências críticas sejam restauradas.
            </p>
          </div>
        </div>
      ) : overall === "degraded" ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-100">
              Plataforma em estado de operação degradada.
            </p>
            <p className="mt-0.5 text-[12px] text-amber-300/90">
              Algumas dependências estão operando com latência elevada ou limitação parcial.
            </p>
          </div>
        </div>
      ) : null}

      {/* Grid de KPIs Padronizado */}
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

      {/* Grid dos Serviços em 2 Colunas */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        {services.map((s) => {
          const serviceTone = statusToTone(s.status);
          const isCritical = s.criticality === "CRITICAL" || s.tier === "CRITICAL";
          const messageText = s.message || s.detail;

          return (
            <div
              key={s.id}
              className={cn(
                "admin-metric relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 sm:p-4.5 transition-all shadow-sm",
                "border-line-subtle bg-white text-ink",
                "dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-100"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                        serviceTone === "success"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20"
                          : serviceTone === "warning"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/20"
                          : serviceTone === "danger"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/20"
                          : "bg-black/[0.04] text-gray-600 dark:bg-white/[0.05] dark:text-gray-300 ring-black/[0.06] dark:ring-white/[0.08]"
                      )}
                    >
                      {getServiceIcon(s.id)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink dark:text-white truncate">
                        {s.name}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-muted dark:text-gray-400">
                        {isCritical ? "Crítico" : "Opcional"}
                        {s.impact ? ` · ${s.impact}` : ""}
                      </p>
                    </div>
                  </div>

                  <StatusBadge tone={serviceTone} dot>
                    {s.id === "mail" && s.message?.includes("Modo local")
                      ? "Modo local"
                      : statusLabel[s.status] || s.status}
                  </StatusBadge>
                </div>

                {/* Mensagem Contextual e Descritiva */}
                {messageText ? (
                  <p
                    className={cn(
                      "mt-3 text-[12px] leading-relaxed",
                      s.status === "degraded"
                        ? "text-amber-700 dark:text-amber-300/90"
                        : s.status === "down"
                        ? "text-rose-700 dark:text-rose-300/90"
                        : "text-ink-secondary dark:text-gray-400"
                    )}
                  >
                    {messageText}
                  </p>
                ) : null}
              </div>

              {/* Latência quando presente */}
              {s.latencyMs != null && Number.isFinite(s.latencyMs) ? (
                <div className="mt-3.5 border-t border-line-soft dark:border-white/[0.05] pt-2 flex items-center justify-between text-[11.5px] tabular-nums text-ink-muted dark:text-gray-500">
                  <span>Latência de resposta</span>
                  <span className="font-mono font-medium text-ink-secondary dark:text-gray-300">
                    {s.latencyMs <= 1 ? "< 1 ms" : `${s.latencyMs} ms`}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {services.length === 0 ? (
        <AdminSection>
          <p className="text-center text-[13px] text-ink-muted dark:text-gray-500 py-6">
            Nenhum serviço reportado pela API.
          </p>
        </AdminSection>
      ) : null}
    </div>
  );
}
