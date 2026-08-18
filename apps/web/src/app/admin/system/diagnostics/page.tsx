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
  Clock,
  Cpu,
  Database,
  Info,
  Layers,
  Mail,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Search,
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
  AdminFilterBar,
  AdminPageHeader,
  AdminSearchInput,
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
  period: string;
  windowLabel?: string;
  metrics: {
    activityEvents?: { value: number; hasData: boolean; label: string; description: string };
    webhooks?: { failed: number; pending: number; totalIssues: number; hasData: boolean };
    whatsapp?: { activeChannels: number; hasData: boolean };
    ai?: { executions: number; hasData: boolean; isConfigured: boolean };
    security?: { events: number; hasData: boolean };
    api?: { calls: number; hasData: boolean; isInstrumented: boolean };
    activityEventsCount?: number;
  };
  flatMetrics?: {
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

type WhatsAppDiag = {
  gateway: {
    provider: string;
    mode: string;
    configured: boolean;
  };
  summary: {
    totalChannels: number;
    connected: number;
    reconnecting: number;
    disconnected: number;
  };
  items: Array<Record<string, unknown>>;
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

type ApiDiag = {
  runtime?: {
    readiness: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    nodeVersion: string;
    platform: string;
  };
  telemetry?: {
    totalCalls24h: number;
    errors24h: number;
    isInstrumented: boolean;
    note: string | null;
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

function severityLabel(sev: string): string {
  const s = (sev || "INFO").toUpperCase();
  if (s === "CRITICAL" || s === "ERROR" || s === "DANGER") return "Crítico";
  if (s === "WARNING" || s === "WARN") return "Atenção";
  return "Informação";
}

function formatLatency(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms <= 1) return "<1 ms";
  return `${ms} ms`;
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
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Query da Varredura Completa de Diagnóstico
  const diagnosticsQuery = useQuery({
    queryKey: ["admin-diagnostics-run"],
    queryFn: () => api<SystemDiagnosticsDTO>("/admin/diagnostics/run"),
    enabled: user?.platformRole === "SUPERADMIN" && tab === "diagnostics",
    staleTime: 60_000,
  });

  // Mutação para re-executar varredura sob demanda
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
    queryKey: ["admin-diag-tab", tab, searchQuery],
    queryFn: () => {
      const qParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : "";
      if (tab === "activity")
        return api<{ items: Array<Record<string, unknown>> }>(`/admin/diagnostics/activity?take=40${qParam}`);
      if (tab === "webhooks")
        return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/webhooks?take=40");
      if (tab === "whatsapp")
        return api<WhatsAppDiag>("/admin/diagnostics/whatsapp");
      if (tab === "ai")
        return api<AiDiag>("/admin/diagnostics/ai/usage?take=40");
      if (tab === "api")
        return api<ApiDiag>("/admin/diagnostics/api?take=40");
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

  const flatM = overview.data?.flatMetrics;
  const listItems =
    listQuery.data && "items" in listQuery.data
      ? (listQuery.data as { items: Array<Record<string, unknown>> }).items
      : [];
  const waData = tab === "whatsapp" && listQuery.data && "gateway" in listQuery.data ? (listQuery.data as WhatsAppDiag) : null;
  const aiData = tab === "ai" && listQuery.data && "summary" in listQuery.data ? (listQuery.data as AiDiag) : null;
  const apiData = tab === "api" && listQuery.data && "runtime" in listQuery.data ? (listQuery.data as ApiDiag) : null;

  const waScanCheck = diagData?.checks.find((c) => c.id === "whatsapp_gateway");
  const isWaAuthDegraded = waScanCheck?.status === "WARNING";

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
                className="admin-btn-secondary h-9 px-3 text-[13px] inline-flex items-center gap-1.5"
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
                <span>{overview.isFetching || listQuery.isFetching ? "Atualizando…" : "Atualizar"}</span>
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
                  {formatLatency(diagData.durationMs)}
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
                          {c.latencyMs != null ? (
                            <span className="tabular-nums font-mono">
                              Latência: <strong className="text-ink-secondary dark:text-gray-300">{formatLatency(c.latencyMs)}</strong>
                            </span>
                          ) : (
                            <span>Verificação interna</span>
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
          <div className="space-y-6">
            <MetricGrid cols={3}>
              <MetricCard
                label="Atividade (24h)"
                value={flatM?.activityEvents ?? 0}
                icon={<Activity className="h-4 w-4" />}
                tone="brand"
                compact
              />
              <MetricCard
                label="Webhooks (Falhas / Pendentes)"
                value={
                  flatM
                    ? `${flatM.webhookFailures ?? 0} falhas · ${flatM.webhookPending ?? 0} pend.`
                    : "—"
                }
                icon={<Webhook className="h-4 w-4" />}
                tone={
                  (flatM?.webhookFailures ?? 0) > 0
                    ? "danger"
                    : (flatM?.webhookPending ?? 0) > 0
                    ? "warning"
                    : "success"
                }
                compact
              />
              <MetricCard
                label="WhatsApp (Canais ativos)"
                value={flatM?.whatsappChannels ?? 0}
                icon={<Radio className="h-4 w-4" />}
                tone="info"
                compact
              />
              <MetricCard
                label="IA (Execuções 24h)"
                value={flatM?.aiExecutions ?? 0}
                icon={<Bot className="h-4 w-4" />}
                tone="violet"
                compact
              />
              <MetricCard
                label="Segurança (Eventos 24h)"
                value={flatM?.securityEvents ?? 0}
                icon={<Shield className="h-4 w-4" />}
                tone={(flatM?.securityEvents ?? 0) > 0 ? "warning" : "neutral"}
                compact
              />
              <MetricCard
                label="API (Chamadas registradas)"
                value={
                  (flatM?.apiCalls ?? 0) > 0
                    ? flatM?.apiCalls
                    : "Não instrumentado"
                }
                icon={<Activity className="h-4 w-4" />}
                compact
              />
            </MetricGrid>

            <div className="rounded-2xl border border-line-subtle bg-white dark:border-white/[0.07] dark:bg-white/[0.02] p-4 text-[12.5px] text-ink-muted dark:text-gray-400 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-brand-600 dark:text-violet-400 shrink-0 mt-0.5" />
              <span>
                Janela móvel das últimas 24 horas. As métricas agregam registros reais de auditoria, entregas de webhooks, canais e eventos de segurança.
              </span>
            </div>
          </div>
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
          {/* VISUALIZAÇÃO WHATSAPP */}
          {waData ? (
            <div className="space-y-4">
              {isWaAuthDegraded ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-950 dark:text-amber-100">Gateway Global: Atenção </span>
                    <span>— Autenticação recusada pelo servidor do gateway WhatsApp (HTTP 401).</span>
                  </div>
                </div>
              ) : null}

              <MetricGrid cols={4}>
                <MetricCard
                  label="Total de canais"
                  value={waData.summary.totalChannels}
                  compact
                />
                <MetricCard
                  label="Conectados"
                  value={waData.summary.connected}
                  tone="success"
                  compact
                />
                <MetricCard
                  label="Reconectando"
                  value={waData.summary.reconnecting}
                  tone="warning"
                  compact
                />
                <MetricCard
                  label="Desconectados"
                  value={waData.summary.disconnected}
                  tone={waData.summary.disconnected > 0 ? "neutral" : "success"}
                  compact
                />
              </MetricGrid>

              <div className="rounded-2xl border border-line-subtle bg-white dark:border-white/[0.07] dark:bg-white/[0.02] p-4 text-[12.5px] text-ink-muted dark:text-gray-400">
                <span className="font-semibold text-ink dark:text-gray-200">Gateway Global: </span>
                <span>Provedor {waData.gateway.provider.toUpperCase()} ({waData.gateway.mode === "embedded" ? "Embutido" : "Externo"}) · As sessões dos canais de empresas operam de forma isolada da infraestrutura global.</span>
              </div>
            </div>
          ) : null}

          {/* VISUALIZAÇÃO IA & MODELOS */}
          {aiData ? (
            <div className="space-y-4">
              {!aiData.groqLive?.configured ? (
                <div className="flex items-start gap-3 rounded-2xl border border-line-subtle bg-white dark:border-white/[0.07] dark:bg-white/[0.02] p-5 text-[13px] text-ink-muted dark:text-gray-400">
                  <Bot className="h-5 w-5 text-brand-600 dark:text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-ink dark:text-white">Provider de IA não configurado</p>
                    <p className="mt-1 text-[12.5px]">Métricas de telemetria estarão disponíveis após a configuração de um provedor de IA no ambiente.</p>
                  </div>
                </div>
              ) : (
                <>
                  <MetricGrid cols={4}>
                    <MetricCard
                      label="Chamadas (24h)"
                      value={aiData.summary?.calls ?? 0}
                      tone="violet"
                      compact
                    />
                    <MetricCard
                      label="Tokens total (24h)"
                      value={
                        aiData.summary?.tokensTotal != null
                          ? aiData.summary.tokensTotal.toLocaleString("pt-BR")
                          : "0"
                      }
                      compact
                    />
                    <MetricCard
                      label="Créditos consumidos (24h)"
                      value={aiData.summary?.credits ?? 0}
                      compact
                    />
                    <MetricCard
                      label="Falhas (24h)"
                      value={aiData.summary?.failuresLast1h ?? 0}
                      tone={(aiData.summary?.failuresLast1h ?? 0) > 0 ? "danger" : "success"}
                      icon={<AlertTriangle className="h-4 w-4" />}
                      compact
                    />
                  </MetricGrid>

                  {aiData.groqLive ? (
                    <AdminSection
                      title="Groq ao vivo"
                      description="Probe de integridade sem expor a chave de API"
                      action={
                        <StatusBadge
                          tone={aiData.groqLive.ok ? "success" : "warning"}
                          dot
                        >
                          {aiData.groqLive.ok ? "OK" : "Aviso"}
                        </StatusBadge>
                      }
                    >
                      <p className="text-[13px] font-medium text-ink dark:text-white/90">
                        {aiData.groqLive.message}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-muted dark:text-gray-500">
                        Modelo: {aiData.groqLive.model || "—"}
                        {aiData.groqLive.latencyMs != null
                          ? ` · ${formatLatency(aiData.groqLive.latencyMs)}`
                          : ""}
                      </p>
                    </AdminSection>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* VISUALIZAÇÃO API RUNTIME */}
          {apiData?.runtime ? (
            <div className="space-y-4">
              <MetricGrid cols={4}>
                <MetricCard
                  label="Prontidão da API"
                  value="Operacional"
                  tone="success"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  compact
                />
                <MetricCard
                  label="Uptime do Processo"
                  value={apiData.runtime.uptimeFormatted}
                  icon={<Clock className="h-4 w-4" />}
                  compact
                />
                <MetricCard
                  label="Memória Heap"
                  value={`${apiData.runtime.heapUsedMb} MB / ${apiData.runtime.heapTotalMb} MB`}
                  icon={<Cpu className="h-4 w-4" />}
                  compact
                />
                <MetricCard
                  label="Memória RSS"
                  value={`${apiData.runtime.rssMb} MB`}
                  compact
                />
              </MetricGrid>
            </div>
          ) : null}

          {/* BARRA DE PESQUISA (NA ABA ATIVIDADE) */}
          {tab === "activity" ? (
            <AdminFilterBar className="mb-0">
              <AdminSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Filtrar por evento, ação ou entidade…"
                className="max-w-md"
              />
            </AdminFilterBar>
          ) : null}

          {/* TABELA DE REGISTROS / EVENTOS COM PAINEL LATERAL SANITIZADO */}
          {!listItems.length ? (
            <div className="rounded-2xl border border-line-subtle bg-white dark:border-white/[0.07] dark:bg-white/[0.02] p-6 text-center">
              <AdminEmptyState
                compact
                title="Nenhum evento registrado nas últimas 24 horas"
                description="Sem registros recentes nesta categoria."
              />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
              <AdminSection
                title={
                  tab === "activity"
                    ? "Registros de Atividade"
                    : tab === "security"
                    ? "Eventos de Segurança"
                    : tab === "webhooks"
                    ? "Entregas de Webhook"
                    : tab === "whatsapp"
                    ? "Canais Conectados"
                    : tab === "api"
                    ? "Requisições de API"
                    : "Eventos"
                }
                description={`${listItems.length} registro(s) listado(s)`}
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
                          {tab === "security" ? "Evento de Segurança" : "Ação / Evento"}
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:text-gray-500">
                          {tab === "activity" ? "Ator / Empresa" : "Escopo / Origem"}
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
                        const title = str(row.eventLabel || row.message || row.event || id);
                        const subCode = row.event && row.event !== title ? String(row.event) : null;
                        const ts = row.timestamp || row.updatedAt || row.createdAt;
                        const selected = safeDetail && str(safeDetail.id) === id;
                        const actor = str(row.actor || row.userName || "Sistema");
                        const tenantScope = str(row.tenantName || "Global / Plataforma");

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
                              <StatusBadge tone={severityTone(sev)}>
                                {severityLabel(sev)}
                              </StatusBadge>
                            </td>
                            <td className="max-w-[280px] px-3 py-2 align-middle">
                              <p className="line-clamp-1 font-medium text-ink dark:text-white/90">
                                {title}
                              </p>
                              {subCode ? (
                                <p className="font-mono text-[10.5px] text-ink-muted dark:text-gray-500 truncate">
                                  {subCode}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-middle text-ink-muted dark:text-gray-500">
                              {tab === "activity" ? (
                                <div className="text-[12px]">
                                  <span className="font-medium text-ink dark:text-gray-300">{actor}</span>
                                  <span className="block text-[11px] text-ink-muted dark:text-gray-500">{tenantScope}</span>
                                </div>
                              ) : (
                                <span>{tenantScope}</span>
                              )}
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

              {/* PAINEL LATERAL DE DETALHE SANITIZADO */}
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
                    <p className="text-[12.5px] text-ink-muted dark:text-gray-500 py-6 text-center">
                      Selecione um registro na tabela para inspecionar os detalhes técnicos sanitizados.
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
