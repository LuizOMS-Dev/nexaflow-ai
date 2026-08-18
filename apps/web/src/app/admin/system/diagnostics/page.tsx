"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Layers,
  Mail,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Webhook,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatDate, cn } from "@/lib/utils";
import {
  AdminEmptyState,
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

type Tab =
  | "diagnostics"
  | "overview"
  | "activity"
  | "webhooks"
  | "whatsapp"
  | "ai"
  | "api"
  | "security";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "diagnostics", label: "Varredura do sistema" },
  { id: "overview", label: "Telemetria (24h)" },
  { id: "activity", label: "Atividade" },
  { id: "webhooks", label: "Webhooks" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ai", label: "IA & Modelos" },
  { id: "api", label: "API" },
  { id: "security", label: "Segurança" },
];

type DiagnosticCheckStatus = "OK" | "WARNING" | "FAILURE" | "NOT_CONFIGURED" | "NOT_APPLICABLE";
type DiagnosticCheckGroup = "core" | "database" | "cache" | "communications" | "ai" | "email" | "integrations";

type DiagnosticCheck = {
  id: string;
  group: DiagnosticCheckGroup;
  groupLabel: string;
  title: string;
  status: DiagnosticCheckStatus;
  summary: string;
  details?: Record<string, unknown> | null;
  latencyMs?: number | null;
  checkedAt: string;
  recommendation?: string | null;
};

type SystemDiagnosticsDTO = {
  overallStatus: "OK" | "WARNING" | "FAILURE";
  checkedAt: string;
  durationMs: number;
  summary: {
    total: number;
    ok: number;
    warning: number;
    failure: number;
    notConfigured: number;
  };
  checks: DiagnosticCheck[];
};

type Overview = {
  metrics: {
    activityEvents: number;
    webhookFailures: number;
    webhookPending: number;
    whatsappChannels: number;
    aiExecutions: number;
    securityEvents: number;
    apiCalls: number;
  };
  generatedAt: string;
};

type AiDiag = {
  summary?: {
    period: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    tokensTotal: number;
    credits: number;
    failuresLast1h: number;
  };
  byPurpose?: Array<Record<string, unknown>>;
  byModel?: Array<Record<string, unknown>>;
  groqLive?: {
    ok: boolean;
    configured: boolean;
    model: string | null;
    message: string;
    latencyMs: number | null;
    limits: Record<string, string | null> | null;
  };
  items: Array<Record<string, unknown>>;
};

const SECRET_KEY =
  /secret|password|token|hash|backup|totp|authorization|api[_-]?key|credential|bearer|cookie|private[_-]?key/i;

function sanitizeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_KEY.test(k)) {
      out[k] = "[omitido por segurança]";
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeRecord(v as Record<string, unknown>);
      continue;
    }
    if (typeof v === "string" && /^(sk-|pk_|Bearer\s|eyJ)/i.test(v)) {
      out[k] = "[omitido por segurança]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

function checkStatusToTone(status: DiagnosticCheckStatus): AdminTone {
  switch (status) {
    case "OK":
      return "success";
    case "WARNING":
      return "warning";
    case "FAILURE":
      return "danger";
    case "NOT_CONFIGURED":
    case "NOT_APPLICABLE":
    default:
      return "neutral";
  }
}

function checkStatusToLabel(status: DiagnosticCheckStatus): string {
  switch (status) {
    case "OK":
      return "Operacional";
    case "WARNING":
      return "Atenção";
    case "FAILURE":
      return "Falha";
    case "NOT_CONFIGURED":
      return "Não configurado";
    case "NOT_APPLICABLE":
      return "N/A";
    default:
      return status;
  }
}

function getGroupIcon(group: DiagnosticCheckGroup) {
  switch (group) {
    case "core":
      return <Server className="h-4 w-4" strokeWidth={1.75} />;
    case "database":
      return <Database className="h-4 w-4" strokeWidth={1.75} />;
    case "cache":
      return <Layers className="h-4 w-4" strokeWidth={1.75} />;
    case "communications":
      return <MessageSquare className="h-4 w-4" strokeWidth={1.75} />;
    case "ai":
      return <Sparkles className="h-4 w-4" strokeWidth={1.75} />;
    case "email":
      return <Mail className="h-4 w-4" strokeWidth={1.75} />;
    case "integrations":
    default:
      return <Terminal className="h-4 w-4" strokeWidth={1.75} />;
  }
}

function severityTone(sev: string): AdminTone {
  const s = (sev || "INFO").toUpperCase();
  if (s === "CRITICAL" || s === "ERROR" || s === "DANGER") return "danger";
  if (s === "WARNING" || s === "WARN") return "warning";
  if (s === "INFO") return "info";
  return statusToTone(s);
}

function str(v: unknown, fallback = "—"): string {
  if (v == null || v === "") return fallback;
  return String(v);
}

export default function AdminDiagnosticsPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>("diagnostics");
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  // 1. Query da Varredura Completa de Diagnóstico
  const diagnosticsQuery = useQuery({
    queryKey: ["admin-diagnostics-run"],
    queryFn: () => api<SystemDiagnosticsDTO>("/admin/diagnostics/run"),
    enabled: user?.platformRole === "SUPERADMIN" && tab === "diagnostics",
    staleTime: 60_000,
  });

  // Mutação para re-executar sob demanda
  const runMutation = useMutation({
    mutationFn: () => api<SystemDiagnosticsDTO>("/admin/diagnostics/run", { method: "POST" }),
    onSuccess: () => {
      void diagnosticsQuery.refetch();
    },
  });

  // 2. Query de Overview da Telemetria (24h)
  const overview = useQuery({
    queryKey: ["admin-diag-overview"],
    queryFn: () => api<Overview>("/admin/diagnostics/overview"),
    enabled: user?.platformRole === "SUPERADMIN" && tab === "overview",
    staleTime: 30_000,
  });

  // 3. Query de Listagem de Logs por Aba
  const listQuery = useQuery({
    queryKey: ["admin-diag-tab", tab],
    queryFn: () => {
      if (tab === "activity")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/activity?take=40");
      if (tab === "webhooks")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/webhooks?take=40");
      if (tab === "whatsapp")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/whatsapp");
      if (tab === "ai")
        return api<AiDiag>("/admin/diagnostics/ai/usage?take=40");
      if (tab === "api")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/api?take=40");
      if (tab === "security")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/security?take=40");
      return Promise.resolve({ items: [] as Array<Record<string, unknown>> });
    },
    enabled: user?.platformRole === "SUPERADMIN" && tab !== "diagnostics" && tab !== "overview",
    staleTime: 20_000,
  });

  const safeDetail = useMemo(
    () => (detail ? sanitizeRecord(detail) : null),
    [detail]
  );

  if (user?.platformRole !== "SUPERADMIN") return null;

  const diagData = diagnosticsQuery.data;
  const isRunning = diagnosticsQuery.isFetching || runMutation.isPending;

  const m = overview.data?.metrics;
  const listItems = listQuery.data?.items || [];
  const aiData =
    tab === "ai" && listQuery.data && "summary" in listQuery.data
      ? (listQuery.data as AiDiag)
      : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Diagnóstico do sistema"
        description="Varredura técnica de infraestrutura, banco de dados, comunicações e integrações."
        badge={
          tab === "diagnostics" && diagData
            ? {
                label:
                  diagData.overallStatus === "OK"
                    ? "Sistema Íntegro"
                    : diagData.overallStatus === "WARNING"
                    ? "Avisos Detectados"
                    : "Falhas Críticas",
                tone:
                  diagData.overallStatus === "OK"
                    ? "success"
                    : diagData.overallStatus === "WARNING"
                    ? "warning"
                    : "danger",
              }
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {tab === "diagnostics" ? (
              <button
                type="button"
                className="admin-btn-primary h-9 px-3.5 text-[13px] inline-flex items-center gap-2"
                disabled={isRunning}
                onClick={() => void runMutation.mutate()}
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Executando varredura…</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Executar diagnóstico</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn-secondary h-9 px-3 text-[13px]"
                disabled={overview.isFetching || listQuery.isFetching}
                onClick={() => {
                  if (tab === "overview") void overview.refetch();
                  else void listQuery.refetch();
                }}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (overview.isFetching || listQuery.isFetching) && "animate-spin"
                  )}
                />
                {overview.isFetching || listQuery.isFetching ? "Atualizando…" : "Atualizar"}
              </button>
            )}
          </div>
        }
      />

      {/* Navegação de Abas Padronizada */}
      <div className="admin-tabs" role="tablist" aria-label="Seções de diagnóstico">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-active={tab === t.id ? "true" : "false"}
            className="admin-tab"
            onClick={() => {
              setTab(t.id);
              setDetail(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ABA 1: VARREDURA PRINCIPAL DE DIAGNÓSTICO */}
      {tab === "diagnostics" ? (
        diagnosticsQuery.isLoading ? (
          <div className="space-y-6" aria-busy="true">
            <div className="grid gap-3 sm:grid-cols-4">
              <AdminSkeleton className="h-[84px] rounded-xl" />
              <AdminSkeleton className="h-[84px] rounded-xl" />
              <AdminSkeleton className="h-[84px] rounded-xl" />
              <AdminSkeleton className="h-[84px] rounded-xl" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <AdminSkeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : diagnosticsQuery.error || !diagData ? (
          <AdminErrorState
            title="Não foi possível executar o diagnóstico do sistema"
            description="Ocorreu um erro ao comunicar com a API de diagnósticos."
            onRetry={() => void diagnosticsQuery.refetch()}
          />
        ) : (
          <div className="space-y-6">
            {/* Resumo & KPIs da Varredura */}
            <MetricGrid cols={4}>
              <MetricCard
                label="Operacionais"
                value={diagData.summary.ok}
                tone="success"
                icon={<CheckCircle2 className="h-4 w-4" />}
                compact
              />
              <MetricCard
                label="Avisos"
                value={diagData.summary.warning}
                tone="warning"
                icon={<AlertTriangle className="h-4 w-4" />}
                compact
              />
              <MetricCard
                label="Falhas"
                value={diagData.summary.failure}
                tone="danger"
                icon={<XCircle className="h-4 w-4" />}
                compact
              />
              <MetricCard
                label="Não configurados"
                value={diagData.summary.notConfigured}
                tone="info"
                compact
              />
            </MetricGrid>

            {/* Informações da Execução */}
            <div className="flex items-center justify-between text-[12px] text-ink-muted dark:text-gray-400 px-1">
              <span>
                Varredura finalizada em{" "}
                <span className="font-mono font-medium text-ink-secondary dark:text-gray-300">
                  {diagData.durationMs} ms
                </span>
              </span>
              <span>
                Última checagem: {formatDate(diagData.checkedAt)}
              </span>
            </div>

            {/* Lista dos Diagnósticos Agrupados */}
            <div className="space-y-3">
              {diagData.checks.map((c) => {
                const tone = checkStatusToTone(c.status);
                const isExpanded = expandedCheckId === c.id;

                return (
                  <div
                    key={c.id}
                    className={cn(
                      "admin-metric relative overflow-hidden rounded-2xl border transition-all shadow-sm",
                      "border-line-subtle bg-white text-ink",
                      "dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-100",
                      c.status === "FAILURE" && "border-rose-500/30 dark:border-rose-500/30",
                      c.status === "WARNING" && "border-amber-500/30 dark:border-amber-500/30"
                    )}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                              tone === "success"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20"
                                : tone === "warning"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/20"
                                : tone === "danger"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/20"
                                : "bg-black/[0.04] text-gray-600 dark:bg-white/[0.05] dark:text-gray-300 ring-black/[0.06] dark:ring-white/[0.08]"
                            )}
                          >
                            {getGroupIcon(c.group)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[13.5px] font-semibold text-ink dark:text-white">
                                {c.title}
                              </p>
                              <span className="text-[11px] font-medium text-ink-muted dark:text-gray-500">
                                · {c.groupLabel}
                              </span>
                            </div>
                            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary dark:text-gray-300">
                              {c.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge tone={tone} dot>
                            {checkStatusToLabel(c.status)}
                          </StatusBadge>
                        </div>
                      </div>

                      {/* Recomendação de Ação Corretiva quando houver problema */}
                      {c.recommendation ? (
                        <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
                          <div>
                            <span className="font-semibold text-amber-900 dark:text-amber-100">
                              Recomendação:{" "}
                            </span>
                            <span>{c.recommendation}</span>
                          </div>
                        </div>
                      ) : null}

                      {/* Rodapé com Latência & Botão para Expandir Detalhes */}
                      <div className="mt-3.5 pt-3 border-t border-line-soft dark:border-white/[0.05] flex items-center justify-between text-[11.5px] text-ink-muted dark:text-gray-400">
                        <div>
                          {c.latencyMs != null && Number.isFinite(c.latencyMs) ? (
                            <span className="tabular-nums font-mono">
                              Latência: <strong className="text-ink-secondary dark:text-gray-300">{c.latencyMs} ms</strong>
                            </span>
                          ) : (
                            <span>Verificação em memória</span>
                          )}
                        </div>

                        {c.details ? (
                          <button
                            type="button"
                            onClick={() => setExpandedCheckId(isExpanded ? null : c.id)}
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
                          >
                            <span>{isExpanded ? "Ocultar detalhes" : "Ver detalhes técnicos"}</span>
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Detalhes Técnicos Expansíveis (Sanitizados) */}
                    {isExpanded && c.details ? (
                      <div className="border-t border-line-soft dark:border-white/[0.06] bg-black/[0.02] dark:bg-black/40 p-4 transition-all">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-gray-500 mb-2">
                          Dados Técnicos Sanitizados
                        </p>
                        <pre className="max-h-60 overflow-auto rounded-xl border border-line-soft dark:border-white/[0.08] bg-surface-base dark:bg-[#0c0d12] p-3 text-[11.5px] font-mono leading-relaxed text-ink dark:text-gray-300">
                          {JSON.stringify(sanitizeRecord(c.details), null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : tab === "overview" ? (
        overview.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <AdminSkeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
        ) : overview.error ? (
          <AdminErrorState
            title="Não foi possível carregar a telemetria"
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <MetricGrid cols={3}>
            <MetricCard
              label="Atividade (24h)"
              value={m?.activityEvents ?? "—"}
              icon={<Activity className="h-4 w-4" />}
              tone="brand"
              compact
            />
            <MetricCard
              label="Webhooks"
              value={
                m
                  ? `${m.webhookFailures ?? 0} falha · ${m.webhookPending ?? 0} pend.`
                  : "—"
              }
              icon={<Webhook className="h-4 w-4" />}
              tone={
                (m?.webhookFailures ?? 0) > 0
                  ? "danger"
                  : (m?.webhookPending ?? 0) > 0
                  ? "warning"
                  : "success"
              }
              compact
            />
            <MetricCard
              label="WhatsApp"
              value={m?.whatsappChannels ?? "—"}
              icon={<Radio className="h-4 w-4" />}
              tone="info"
              compact
            />
            <MetricCard
              label="IA"
              value={m?.aiExecutions ?? "—"}
              icon={<Bot className="h-4 w-4" />}
              tone="violet"
              compact
            />
            <MetricCard
              label="Segurança"
              value={m?.securityEvents ?? "—"}
              icon={<Shield className="h-4 w-4" />}
              tone={(m?.securityEvents ?? 0) > 0 ? "warning" : "neutral"}
              compact
            />
            <MetricCard
              label="API"
              value={m?.apiCalls ?? "—"}
              icon={<Activity className="h-4 w-4" />}
              compact
            />
          </MetricGrid>
        )
      ) : listQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <AdminSkeleton className="h-24 rounded-xl" />
          <AdminSkeleton className="h-64 rounded-xl" />
        </div>
      ) : listQuery.error ? (
        <AdminErrorState
          title="Não foi possível carregar este painel"
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <div className="space-y-4">
          {aiData ? (
            <div className="space-y-4">
              <MetricGrid cols={4}>
                <MetricCard
                  label="Chamadas (24h)"
                  value={aiData.summary?.calls ?? "—"}
                  tone="violet"
                  compact
                />
                <MetricCard
                  label="Tokens total (24h)"
                  value={
                    aiData.summary?.tokensTotal != null
                      ? aiData.summary.tokensTotal.toLocaleString("pt-BR")
                      : "—"
                  }
                  compact
                />
                <MetricCard
                  label="Créditos (24h)"
                  value={aiData.summary?.credits ?? "—"}
                  compact
                />
                <MetricCard
                  label="Falhas (1h)"
                  value={aiData.summary?.failuresLast1h ?? "—"}
                  tone={(aiData.summary?.failuresLast1h ?? 0) > 0 ? "danger" : "success"}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  compact
                />
              </MetricGrid>

              {aiData.groqLive ? (
                <AdminSection
                  title="Groq ao vivo"
                  description="Probe sem expor a chave de API"
                  action={
                    <StatusBadge
                      tone={aiData.groqLive.ok ? "success" : "warning"}
                      dot
                    >
                      {aiData.groqLive.ok ? "OK" : "Falha / ausente"}
                    </StatusBadge>
                  }
                >
                  <p className="text-[13px] font-medium text-ink dark:text-white/90">
                    {aiData.groqLive.message}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted dark:text-gray-500">
                    Modelo: {aiData.groqLive.model || "—"}
                    {aiData.groqLive.latencyMs != null
                      ? ` · ${aiData.groqLive.latencyMs} ms`
                      : ""}
                  </p>
                  {aiData.groqLive.limits ? (
                    <div className="admin-table-wrap mt-3 overflow-x-auto">
                      <table className="admin-table w-full min-w-[480px] border-collapse text-left text-[12.5px]">
                        <thead>
                          <tr className="border-b border-line-soft dark:border-white/[0.06]">
                            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                              Limite
                            </th>
                            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                              Valor
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(aiData.groqLive.limits).map(([k, v]) => (
                            <tr
                              key={k}
                              className="border-b border-line-soft dark:border-white/[0.04] last:border-0"
                            >
                              <td className="px-3 py-1.5 font-mono text-[11px] text-ink-muted dark:text-gray-400">
                                {k}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-ink dark:text-gray-300">
                                {v ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </AdminSection>
              ) : null}

              {aiData.byModel?.length ? (
                <AdminSection title="Por modelo (24h)" flush>
                  <div className="admin-table-wrap overflow-x-auto">
                    <table className="admin-table w-full min-w-[520px] border-collapse text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-line-soft dark:border-white/[0.06]">
                          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                            Provider / modelo
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                            Calls
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                            In
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                            Out
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiData.byModel.map((row, i) => (
                          <tr
                            key={`${String(row.provider)}-${String(row.model)}-${i}`}
                            className="border-b border-line-soft dark:border-white/[0.04] last:border-0"
                          >
                            <td className="px-4 py-2 font-medium text-ink dark:text-white/90">
                              {str(row.provider)}/{str(row.model)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-muted dark:text-gray-400">
                              {str(row.calls)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-muted dark:text-gray-400">
                              {str(row.tokensIn)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-muted dark:text-gray-400">
                              {str(row.tokensOut)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminSection>
              ) : null}
            </div>
          ) : null}

          {!listItems.length ? (
            <AdminSection>
              <AdminEmptyState
                compact
                title="Sem eventos neste período"
                description="Nada a reportar nesta aba."
              />
            </AdminSection>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[1fr_minmax(260px,340px)]">
              <AdminSection
                title="Eventos"
                description={`${listItems.length} registro(s)`}
                flush
              >
                <div className="admin-table-wrap overflow-x-auto">
                  <table className="admin-table w-full min-w-[560px] border-collapse text-left text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line-soft dark:border-white/[0.06]">
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                          Sev.
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                          Mensagem
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                          Tenant
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                          Quando
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {listItems.map((row, idx) => {
                        const id = str(row.id, `row-${idx}`);
                        const sev = str(row.severity, "INFO");
                        const title = str(row.message || row.event || id);
                        const ts = row.timestamp || row.updatedAt || row.createdAt;
                        const selected = safeDetail && str(safeDetail.id) === id;
                        return (
                          <tr
                            key={id}
                            onClick={() => setDetail(row)}
                            className={cn(
                              "cursor-pointer border-b border-line-soft dark:border-white/[0.04] transition-colors last:border-0",
                              "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                              selected && "bg-brand-500/[0.08] dark:bg-violet-500/[0.08]"
                            )}
                          >
                            <td className="px-3 py-2 align-middle">
                              <StatusBadge tone={severityTone(sev)}>{sev}</StatusBadge>
                            </td>
                            <td className="max-w-[280px] px-3 py-2 align-middle">
                              <p className="line-clamp-2 font-medium text-ink dark:text-white/90">
                                {title}
                              </p>
                            </td>
                            <td className="px-3 py-2 align-middle text-ink-muted dark:text-gray-500">
                              {row.tenantName ? str(row.tenantName) : "—"}
                            </td>
                            <td className="px-3 py-2 align-middle tabular-nums text-ink-muted dark:text-gray-500">
                              {ts ? formatDate(String(ts)) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </AdminSection>

              <aside className="admin-section h-fit overflow-hidden rounded-2xl border border-line-subtle bg-white dark:border-white/[0.07] dark:bg-white/[0.02]">
                <div className="border-b border-line-soft dark:border-white/[0.06] px-4 py-3">
                  <h2 className="text-[13px] font-semibold text-ink dark:text-white/90">
                    Detalhe Sanitizado
                  </h2>
                </div>
                <div className="p-4">
                  {safeDetail ? (
                    <pre className="max-h-[420px] overflow-auto rounded-xl border border-line-soft dark:border-white/[0.06] bg-surface-base dark:bg-black/30 p-3 text-[11px] leading-relaxed text-ink dark:text-gray-300 font-mono">
                      {JSON.stringify(safeDetail, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-[12.5px] text-ink-muted dark:text-gray-500 py-4 text-center">
                      Selecione um evento na tabela para inspecionar.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
