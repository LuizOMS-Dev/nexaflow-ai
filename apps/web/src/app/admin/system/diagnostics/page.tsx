"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState, Spinner } from "@/components/ui";
import { AdminPageHeader } from "../../admin-page-header";

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

const severityClass: Record<string, string> = {
  INFO: "badge-neutral",
  WARNING: "badge-warning",
  ERROR: "badge-danger",
  CRITICAL: "badge-danger",
};

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

  const listQuery = useQuery({
    queryKey: ["admin-diag", tab],
    queryFn: () => {
      if (tab === "activity") return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/activity?take=40");
      if (tab === "webhooks") return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/webhooks?take=40");
      if (tab === "whatsapp") return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/whatsapp");
      if (tab === "ai") return api<AiDiag>("/admin/diagnostics/ai/usage?take=40");
      if (tab === "api") return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/api?take=40");
      if (tab === "security") return api<{ items: Array<Record<string, unknown>> }>("/admin/diagnostics/security?take=40");
      return Promise.resolve({ items: [] as Array<Record<string, unknown>> });
    },
    enabled: user?.platformRole === "SUPERADMIN" && tab !== "overview",
    staleTime: 20_000,
  });

  if (user?.platformRole !== "SUPERADMIN") return null;

  const m = overview.data?.metrics;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Logs e diagnóstico"
        description="Monitoramento técnico da plataforma. Não expõe secrets. Separado do changelog e da auditoria operacional."
      />

      <div className="flex flex-wrap gap-1.5 border-b border-line-soft pb-2 dark:border-white/[0.06]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition",
              tab === t.id
                ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
                : "text-ink-muted hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            )}
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
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Atividade (24h)", value: m?.activityEvents },
              { label: "Webhooks com falha", value: m?.webhookFailures },
              { label: "Webhooks pendentes", value: m?.webhookPending },
              { label: "Canais WhatsApp", value: m?.whatsappChannels },
              { label: "Execuções de IA", value: m?.aiExecutions },
              { label: "Eventos de segurança", value: m?.securityEvents },
              { label: "Chamadas API", value: m?.apiCalls },
            ].map((c) => (
              <div key={c.label} className="card px-4 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  {c.label}
                </p>
                <p className="mt-1 text-[1.25rem] font-semibold tabular-nums text-ink dark:text-white">
                  {c.value ?? "—"}
                </p>
              </div>
            ))}
          </div>
        )
      ) : listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !(listQuery.data?.items?.length) && tab !== "ai" ? (
        <EmptyState title="Sem eventos neste período" compact />
      ) : (
        <div className="space-y-3">
          {tab === "ai" && listQuery.data && "summary" in listQuery.data ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Chamadas (24h)", value: (listQuery.data as AiDiag).summary?.calls },
                  {
                    label: "Tokens total (24h)",
                    value: (listQuery.data as AiDiag).summary?.tokensTotal,
                  },
                  { label: "Créditos (24h)", value: (listQuery.data as AiDiag).summary?.credits },
                  {
                    label: "Falhas (1h)",
                    value: (listQuery.data as AiDiag).summary?.failuresLast1h,
                  },
                ].map((c) => (
                  <div key={c.label} className="card px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                      {c.label}
                    </p>
                    <p className="mt-1 text-[1.15rem] font-semibold tabular-nums text-ink dark:text-white">
                      {c.value ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
              {(listQuery.data as AiDiag).groqLive ? (
                <div
                  className={cn(
                    "card px-4 py-3.5 text-[13px]",
                    (listQuery.data as AiDiag).groqLive?.ok
                      ? "border-emerald-500/25"
                      : "border-amber-500/25"
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Groq ao vivo
                  </p>
                  <p className="mt-1 font-medium text-ink dark:text-white">
                    {(listQuery.data as AiDiag).groqLive?.message}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Modelo: {(listQuery.data as AiDiag).groqLive?.model || "—"}
                    {(listQuery.data as AiDiag).groqLive?.latencyMs != null
                      ? ` · ${String((listQuery.data as AiDiag).groqLive?.latencyMs)} ms`
                      : ""}
                  </p>
                  {(listQuery.data as AiDiag).groqLive?.limits ? (
                    <pre className="mt-2 overflow-auto rounded-lg bg-black/[0.03] p-2.5 text-[11px] dark:bg-white/[0.04]">
                      {JSON.stringify((listQuery.data as AiDiag).groqLive?.limits, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
              {(listQuery.data as AiDiag).byModel?.length ? (
                <div className="card overflow-hidden">
                  <p className="border-b border-line-soft px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:border-white/[0.06]">
                    Por modelo (24h)
                  </p>
                  <ul className="divide-y divide-line-soft dark:divide-white/[0.05]">
                    {(listQuery.data as AiDiag).byModel!.map((m, i) => (
                      <li
                        key={`${String(m.provider)}-${String(m.model)}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12.5px]"
                      >
                        <span className="font-medium text-ink dark:text-white">
                          {String(m.provider)}/{String(m.model)}
                        </span>
                        <span className="tabular-nums text-ink-muted">
                          {String(m.calls)} calls · in {String(m.tokensIn)} · out{" "}
                          {String(m.tokensOut)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(260px,340px)]">
          <div className="card overflow-hidden">
            <ul className="divide-y divide-line-soft dark:divide-white/[0.05]">
              {(listQuery.data?.items || []).map((row) => {
                const id = String(row.id);
                const sev = String(row.severity || "INFO");
                const title = String(row.message || row.event || id);
                const ts = row.timestamp || row.updatedAt;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                        detail?.id === id && "bg-brand-500/[0.04]"
                      )}
                      onClick={() => setDetail(row)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={severityClass[sev] || "badge-neutral"}>{sev}</span>
                        <span className="text-[11.5px] text-ink-faint">
                          {ts ? formatDate(String(ts)) : "—"}
                        </span>
                      </div>
                      <p className="text-[13px] font-medium text-ink dark:text-white line-clamp-2">
                        {title}
                      </p>
                      {row.tenantName ? (
                        <p className="text-[11.5px] text-ink-faint">{String(row.tenantName)}</p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="card h-fit p-4">
            {detail ? (
              <div className="space-y-2 text-[12.5px]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Detalhe (sanitizado)
                </p>
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-black/[0.03] p-3 text-[11px] leading-relaxed dark:bg-white/[0.04]">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">
                Selecione um evento para ver detalhes sanitizados.
              </p>
            )}
          </aside>
        </div>
        </div>
      )}
    </div>
  );
}
