"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bot,
  Radio,
  Shield,
  Webhook,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatDate } from "@/lib/utils";
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

type Tab =
  | "overview"
  | "activity"
  | "webhooks"
  | "whatsapp"
  | "ai"
  | "api"
  | "security";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "activity", label: "Atividade" },
  { id: "webhooks", label: "Webhooks" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ai", label: "IA" },
  { id: "api", label: "API" },
  { id: "security", label: "Segurança" },
];

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
      out[k] = "[omitido]";
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeRecord(v as Record<string, unknown>);
      continue;
    }
    if (typeof v === "string" && /^(sk-|pk_|Bearer\s|eyJ)/i.test(v)) {
      out[k] = "[omitido]";
      continue;
    }
    out[k] = v;
  }
  return out;
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
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const overview = useQuery({
    queryKey: ["admin-diag-overview"],
    queryFn: () => api<Overview>("/admin/diagnostics/overview"),
    enabled: user?.platformRole === "SUPERADMIN",
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["admin-diag", tab],
    queryFn: () => {
      if (tab === "activity")
        return api<{ items: Array<Record<string, unknown>> }>(
          "/admin/diagnostics/activity?take=40"
        );
      if (tab === "webhooks")
        return api<{ items: Array<Record<string, unknown>> }>(
          "/admin/diagnostics/webhooks?take=40"
        );
      if (tab === "whatsapp")
        return api<{ items: Array<Record<string, unknown>> }>(
          "/admin/diagnostics/whatsapp"
        );
      if (tab === "ai") return api<AiDiag>("/admin/diagnostics/ai/usage?take=40");
      if (tab === "api")
        return api<{ items: Array<Record<string, unknown>> }>(
          "/admin/diagnostics/api?take=40"
        );
      if (tab === "security")
        return api<{ items: Array<Record<string, unknown>> }>(
          "/admin/diagnostics/security?take=40"
        );
      return Promise.resolve({ items: [] as Array<Record<string, unknown>> });
    },
    enabled: user?.platformRole === "SUPERADMIN" && tab !== "overview",
    staleTime: 20_000,
  });

  const safeDetail = useMemo(
    () => (detail ? sanitizeRecord(detail) : null),
    [detail]
  );

  if (user?.platformRole !== "SUPERADMIN") return null;

  const m = overview.data?.metrics;
  const listItems = listQuery.data?.items || [];
  const aiData =
    tab === "ai" && listQuery.data && "summary" in listQuery.data
      ? (listQuery.data as AiDiag)
      : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Logs e diagnóstico"
        description="Monitoramento técnico — secrets omitidos no client."
        actions={
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={overview.isFetching || listQuery.isFetching}
            onClick={() => {
              void overview.refetch();
              if (tab !== "overview") void listQuery.refetch();
            }}
          >
            {overview.isFetching || listQuery.isFetching ? "Atualizando…" : "Atualizar"}
          </button>
        }
      />

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

      {tab === "overview" ? (
        overview.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <AdminSkeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
        ) : overview.error ? (
          <AdminErrorState
            title="Não foi possível carregar o overview"
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
                  <p className="text-[13px] font-medium text-white/90">
                    {aiData.groqLive.message}
                  </p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Modelo: {aiData.groqLive.model || "—"}
                    {aiData.groqLive.latencyMs != null
                      ? ` · ${aiData.groqLive.latencyMs} ms`
                      : ""}
                  </p>
                  {aiData.groqLive.limits ? (
                    <div className="admin-table-wrap mt-3 overflow-x-auto">
                      <table className="admin-table w-full min-w-[480px] border-collapse text-left text-[12.5px]">
                        <thead>
                          <tr className="border-b border-white/[0.06]">
                            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Limite
                            </th>
                            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Valor
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(aiData.groqLive.limits).map(([k, v]) => (
                            <tr
                              key={k}
                              className="border-b border-white/[0.04] last:border-0"
                            >
                              <td className="px-3 py-1.5 font-mono text-[11px] text-gray-400">
                                {k}
                              </td>
                              <td className="px-3 py-1.5 tabular-nums text-gray-300">
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
                        <tr className="border-b border-white/[0.06]">
                          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Provider / modelo
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Calls
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            In
                          </th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Out
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiData.byModel.map((row, i) => (
                          <tr
                            key={`${String(row.provider)}-${String(row.model)}-${i}`}
                            className="border-b border-white/[0.04] last:border-0"
                          >
                            <td className="px-4 py-2 font-medium text-white/90">
                              {str(row.provider)}/{str(row.model)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                              {str(row.calls)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                              {str(row.tokensIn)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-400">
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
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Sev.
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Mensagem
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Tenant
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
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
                            className={
                              "cursor-pointer border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03] " +
                              (selected ? "bg-violet-500/[0.06]" : "")
                            }
                          >
                            <td className="px-3 py-2 align-middle">
                              <StatusBadge tone={severityTone(sev)}>{sev}</StatusBadge>
                            </td>
                            <td className="max-w-[280px] px-3 py-2 align-middle">
                              <p className="line-clamp-2 font-medium text-white/90">
                                {title}
                              </p>
                            </td>
                            <td className="px-3 py-2 align-middle text-gray-500">
                              {row.tenantName ? str(row.tenantName) : "—"}
                            </td>
                            <td className="px-3 py-2 align-middle tabular-nums text-gray-500">
                              {ts ? formatDate(String(ts)) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </AdminSection>

              <aside className="admin-section h-fit overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                <div className="border-b border-white/[0.06] px-4 py-3">
                  <h2 className="text-[13px] font-semibold text-white/90">Detalhe</h2>
                </div>
                <div className="p-4">
                  {safeDetail ? (
                    <pre className="max-h-[420px] overflow-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 text-[11px] leading-relaxed text-gray-300">
                      {JSON.stringify(safeDetail, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-[12.5px] text-gray-500">
                      Selecione um evento na tabela.
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
