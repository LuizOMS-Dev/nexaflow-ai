"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { EmptyState, Select, Spinner } from "@/components/ui";
import {
  TenantMetric,
  TenantSection,
} from "@/components/tenant/tenant-page";
import { TenantModule } from "@/components/tenant/tenant-module";

type PeriodKey = "today" | "7" | "30" | "90" | "month" | "last_month" | "custom";

type Dashboard = {
  kpis: {
    openConversations: number;
    unreadConversations: number;
    totalContacts: number;
    openTasks: number;
    openOpportunities: number;
    wonValue: number;
    pipelineValue: number;
    messagesIn: number;
    messagesOut: number;
    aiAgents: number;
    channels: number;
    hotLeads?: number;
    priorityLeads?: number;
    channelsConnected?: number;
    channelsConfigured?: number;
    overdueTasks?: number;
    stuckOpportunities?: number;
    waitingReply?: number;
    closedConversations?: number;
  };
  period?: { key: string; label: string; start: string; end: string };
  previous?: { messagesIn: number; messagesOut: number; wonValue: number };
  whatsapp?: { connected: boolean; connectedCount: number };
};

type PipelineStage = {
  id: string;
  name: string;
  color: string;
  opportunities: Array<{ id: string; value?: string | number }>;
};

type Pipeline = { id: string; name: string; stages: PipelineStage[] };

type TeamMember = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type TabId = "overview" | "attendance" | "sales" | "team";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
];

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "attendance", label: "Atendimento" },
  { id: "sales", label: "Vendas" },
  { id: "team", label: "Equipe e IA" },
];

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "text-[11.5px] font-medium tabular-nums",
        flat && "text-ink-faint",
        up && "text-emerald-600 dark:text-emerald-400",
        !up && !flat && "text-red-600 dark:text-red-400"
      )}
    >
      {flat ? "—" : up ? "↑" : "↓"} {flat ? "0%" : `${Math.abs(value)}%`}
      <span className="ml-1 font-normal text-ink-faint">vs. anterior</span>
    </span>
  );
}

function buildInsights(data: Dashboard): string[] {
  const k = data.kpis;
  const insights: string[] = [];

  if ((k.waitingReply ?? 0) > 0) {
    insights.push(
      `${k.waitingReply} conversa${(k.waitingReply || 0) > 1 ? "s" : ""} aguardando resposta`
    );
  }
  if ((k.overdueTasks ?? 0) > 0) {
    insights.push(
      `${k.overdueTasks} tarefa${(k.overdueTasks || 0) > 1 ? "s" : ""} atrasada${(k.overdueTasks || 0) > 1 ? "s" : ""}`
    );
  }
  if ((k.stuckOpportunities ?? 0) > 0) {
    insights.push(
      `${k.stuckOpportunities} oportunidade${(k.stuckOpportunities || 0) > 1 ? "s" : ""} sem atividade`
    );
  }
  if ((k.channelsConnected ?? k.channels ?? 0) === 0) {
    insights.push("WhatsApp desconectado — reconecte em Canais para gerar dados de atendimento");
  }

  return insights.slice(0, 4);
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "Administrador",
    SUPERVISOR: "Supervisor",
    AGENT: "Atendente",
    SALES: "Comercial",
    READONLY: "Somente leitura",
    OWNER: "Proprietário",
  };
  return map[role] || role;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const queryPeriod =
    period === "custom" && customFrom && customTo
      ? "custom"
      : period === "custom"
        ? "30"
        : period;

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["reports-dashboard", queryPeriod, customFrom, customTo],
    queryFn: () => {
      const params = new URLSearchParams({ period: queryPeriod });
      if (queryPeriod === "custom" && customFrom) params.set("from", customFrom);
      if (queryPeriod === "custom" && customTo) params.set("to", customTo);
      return api<Dashboard>(`/dashboard?${params.toString()}`);
    },
  });

  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/pipelines"),
    staleTime: 60_000,
  });
  const primaryId = pipelines.data?.[0]?.id;
  const board = useQuery({
    queryKey: ["board", primaryId],
    queryFn: () => api<Pipeline>(`/pipelines/${primaryId}/board`),
    enabled: Boolean(primaryId),
    staleTime: 60_000,
  });

  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamMember[] | { members?: TeamMember[] }>("/team"),
    staleTime: 60_000,
  });

  const agents = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () =>
      api<Array<{ id: string; name: string; isActive: boolean; mode: string }>>("/ai-agents"),
    staleTime: 60_000,
  });

  const teamMembers: TeamMember[] = useMemo(() => {
    const raw = team.data;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return raw.members ?? [];
  }, [team.data]);

  const periodLabel =
    data?.period?.label || PERIODS.find((p) => p.value === period)?.label || "Últimos 30 dias";

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ["period", periodLabel],
      ["period_start", data.period?.start || ""],
      ["period_end", data.period?.end || ""],
      ...Object.entries(data.kpis).map(([key, v]) => [key, String(v)]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexaflow-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const periodControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="w-auto min-w-[9.5rem]"
        size="sm"
        triggerClassName="h-9 text-sm"
        value={period}
        onChange={(v) => setPeriod(v as PeriodKey)}
        options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        aria-label="Período do relatório"
      />
      <button
        type="button"
        className="btn-secondary h-9"
        onClick={exportCsv}
        disabled={!data}
      >
        <Download className="h-3.5 w-3.5" /> Exportar CSV
      </button>
    </div>
  );

  if (isLoading && !data) {
    return (
      <TenantModule
        kind="analytics"
        title="Relatórios"
        kicker="Análise"
        className="reports-page"
        actions={periodControls}
      >
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <Spinner />
        </div>
      </TenantModule>
    );
  }

  if (isError || !data) {
    return (
      <TenantModule
        kind="analytics"
        title="Relatórios"
        kicker="Análise"
        className="reports-page"
        actions={periodControls}
      >
        <EmptyState
          title="Não foi possível carregar os relatórios"
          description="Verifique a conexão e tente novamente."
          action={
            <button type="button" className="btn-primary h-9" onClick={() => void refetch()}>
              Tentar de novo
            </button>
          }
        />
      </TenantModule>
    );
  }

  const k = data.kpis;
  const prev = data.previous;
  const channelsConnected = k.channelsConnected ?? k.channels ?? 0;
  const responseRate = k.messagesIn
    ? Math.round((k.messagesOut / Math.max(k.messagesIn, 1)) * 100)
    : 0;

  const hasFlowData =
    k.messagesIn > 0 || k.messagesOut > 0 || k.wonValue > 0 || k.openOpportunities > 0;
  const hasAnyActivity =
    hasFlowData || k.openConversations > 0 || k.totalContacts > 0 || k.openTasks > 0;

  const stages = board.data?.stages || [];
  const maxStageCount = Math.max(1, ...stages.map((s) => s.opportunities?.length ?? 0));

  const prevResponseRate =
    prev && prev.messagesIn > 0
      ? Math.round((prev.messagesOut / Math.max(prev.messagesIn, 1)) * 100)
      : null;

  return (
    <TenantModule
      kind="analytics"
      title="Relatórios"
      kicker="Análise"
      className="reports-page"
      actions={periodControls}
    >
      {/* Period context bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-ink-muted dark:text-zinc-400">
          Período:{" "}
          <span className="font-medium text-ink-secondary dark:text-zinc-300">{periodLabel}</span>
          {data.period?.start && data.period?.end ? (
            <span className="ml-1.5 text-ink-faint">
              ({new Date(data.period.start).toLocaleDateString("pt-BR")} –{" "}
              {new Date(data.period.end).toLocaleDateString("pt-BR")})
            </span>
          ) : null}
          {isFetching ? (
            <span className="ml-2 text-ink-faint" aria-live="polite">
              Atualizando…
            </span>
          ) : null}
        </p>
      </div>

      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] px-4 py-3 dark:border-white/[0.07]">
          <div>
            <label className="label" htmlFor="report-from">
              Data inicial
            </label>
            <input
              id="report-from"
              type="date"
              className="input h-9"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="report-to">
              Data final
            </label>
            <input
              id="report-to"
              type="date"
              className="input h-9"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          {(!customFrom || !customTo) && (
            <p className="pb-2 text-[12px] text-ink-faint">
              Selecione as duas datas para filtrar o período personalizado.
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-line pb-px dark:border-white/[0.06]"
        role="tablist"
        aria-label="Seções do relatório"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`report-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`report-panel-${t.id}`}
            className={cn(
              "shrink-0 rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-violet-500 text-violet-700 dark:text-violet-300"
                : "text-ink-muted hover:text-ink dark:hover:text-gray-200"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!hasAnyActivity ? (
        <div className="nf-analytics-panel">
          <div className="px-2 py-8 text-center">
            <p className="text-[14px] font-medium text-ink dark:text-white">
              Sem dados neste período
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-muted dark:text-zinc-400">
              Quando houver conversas, mensagens ou vendas, os indicadores aparecem aqui.
            </p>
            {channelsConnected === 0 ? (
              <Link
                href="/app/integrations"
                className="btn-primary mx-auto mt-5 h-9 px-4 text-xs"
              >
                Conectar WhatsApp
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div
              id="report-panel-overview"
              role="tabpanel"
              aria-labelledby="report-tab-overview"
              className="nf-analytics-panel space-y-5"
            >
              {/* Primary metrics — max 4 */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TenantMetric
                  label="Conversas abertas"
                  value={k.openConversations}
                  hint={
                    k.unreadConversations
                      ? `${k.unreadConversations} sem leitura`
                      : "Todas lidas"
                  }
                  href="/app/inbox"
                />
                <TenantMetric
                  label="Taxa de resposta"
                  value={`${responseRate}%`}
                  hint={
                    k.messagesIn
                      ? `${k.messagesOut} enviadas · ${k.messagesIn} recebidas`
                      : "Sem mensagens no período"
                  }
                />
                <TenantMetric
                  label="Oportunidades abertas"
                  value={k.openOpportunities}
                  hint={
                    k.pipelineValue > 0
                      ? `${formatCurrency(k.pipelineValue)} em negociação`
                      : undefined
                  }
                  href="/app/crm"
                />
                <TenantMetric
                  label="Vendas no período"
                  value={formatCurrency(k.wonValue)}
                  hint={periodLabel}
                />
              </div>

              {/* Secondary strip — compact, not card explosion */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] px-4 py-3 text-[12.5px] dark:border-white/[0.07]">
                {[
                  { label: "Msgs recebidas", value: k.messagesIn },
                  { label: "Msgs enviadas", value: k.messagesOut },
                  { label: "Contatos", value: k.totalContacts },
                  { label: "Não lidas", value: k.unreadConversations },
                  { label: "Prioridade alta", value: k.priorityLeads ?? k.hotLeads ?? 0 },
                  { label: "Tarefas abertas", value: k.openTasks },
                ].map((m) => (
                  <div key={m.label} className="flex items-baseline gap-1.5">
                    <span className="text-ink-faint">{m.label}</span>
                    <span className="font-semibold tabular-nums text-ink dark:text-white">
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Trend comparison */}
              {prev && (k.messagesIn > 0 || prev.messagesIn > 0 || k.wonValue > 0 || prev.wonValue > 0) && (
                <TenantSection title="Tendência no período">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium text-ink-faint">Mensagens recebidas</p>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink dark:text-white">
                        {k.messagesIn}
                      </p>
                      <div className="mt-1">
                        <Delta value={pctChange(k.messagesIn, prev.messagesIn)} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-ink-faint">Mensagens enviadas</p>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink dark:text-white">
                        {k.messagesOut}
                      </p>
                      <div className="mt-1">
                        <Delta value={pctChange(k.messagesOut, prev.messagesOut)} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-ink-faint">Vendas</p>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink dark:text-white">
                        {formatCurrency(k.wonValue)}
                      </p>
                      <div className="mt-1">
                        <Delta value={pctChange(k.wonValue, prev.wonValue)} />
                      </div>
                    </div>
                  </div>
                  {prevResponseRate != null && (
                    <p className="mt-3 border-t border-black/[0.04] pt-3 text-[12px] text-ink-muted dark:border-white/[0.05]">
                      Taxa de resposta: {responseRate}%{" "}
                      <Delta value={pctChange(responseRate, prevResponseRate)} />
                    </p>
                  )}
                </TenantSection>
              )}

              {/* Insights */}
              <TenantSection title="Insights do período">
                {insights.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">
                    Ainda não há sinais suficientes para insights automáticos neste período.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {insights.map((text) => (
                      <li
                        key={text}
                        className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-secondary dark:text-gray-300"
                      >
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                          aria-hidden
                        />
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
              </TenantSection>

              {/* Domain summaries */}
              <div className="grid gap-4 lg:grid-cols-2">
                <TenantSection
                  title="Atendimento"
                  action={
                    <button
                      type="button"
                      className="text-[12px] font-medium text-violet-600 dark:text-violet-400"
                      onClick={() => setTab("attendance")}
                    >
                      Ver detalhes
                    </button>
                  }
                >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-[11px] text-ink-faint">Abertas</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {k.openConversations}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Não lidas</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {k.unreadConversations}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Encerradas</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {k.closedConversations ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Taxa de resposta</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {responseRate}%
                      </dd>
                    </div>
                  </dl>
                </TenantSection>

                <TenantSection
                  title="Vendas"
                  action={
                    <button
                      type="button"
                      className="text-[12px] font-medium text-violet-600 dark:text-violet-400"
                      onClick={() => setTab("sales")}
                    >
                      Ver detalhes
                    </button>
                  }
                >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-[11px] text-ink-faint">Em aberto</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {k.openOpportunities}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Em negociação</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {formatCurrency(k.pipelineValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Vendido</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {formatCurrency(k.wonValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Paradas no funil</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink dark:text-white">
                        {k.stuckOpportunities ?? 0}
                      </dd>
                    </div>
                  </dl>
                </TenantSection>
              </div>
            </div>
          )}

          {tab === "attendance" && (
            <div
              id="report-panel-attendance"
              role="tabpanel"
              aria-labelledby="report-tab-attendance"
              className="nf-analytics-panel space-y-5"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TenantMetric label="Msgs recebidas" value={k.messagesIn} hint={periodLabel} />
                <TenantMetric label="Msgs enviadas" value={k.messagesOut} hint={periodLabel} />
                <TenantMetric label="Não lidas" value={k.unreadConversations} href="/app/inbox" />
                <TenantMetric
                  label="Taxa de resposta"
                  value={`${responseRate}%`}
                  hint="Enviadas ÷ recebidas no período"
                />
              </div>

              <TenantSection title="Fila e status">
                <div className="overflow-x-auto">
                  <table className="table w-full min-w-[420px]">
                    <thead>
                      <tr>
                        <th>Indicador</th>
                        <th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Conversas abertas</td>
                        <td className="text-right font-semibold tabular-nums">
                          {k.openConversations}
                        </td>
                      </tr>
                      <tr>
                        <td>Encerradas no período</td>
                        <td className="text-right font-semibold tabular-nums">
                          {k.closedConversations ?? 0}
                        </td>
                      </tr>
                      <tr>
                        <td>Aguardando resposta</td>
                        <td className="text-right font-semibold tabular-nums">
                          {k.waitingReply ?? 0}
                        </td>
                      </tr>
                      <tr>
                        <td>Contatos</td>
                        <td className="text-right font-semibold tabular-nums">{k.totalContacts}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </TenantSection>
            </div>
          )}

          {tab === "sales" && (
            <div
              id="report-panel-sales"
              role="tabpanel"
              aria-labelledby="report-tab-sales"
              className="nf-analytics-panel space-y-5"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TenantMetric
                  label="Oportunidades abertas"
                  value={k.openOpportunities}
                  href="/app/crm"
                />
                <TenantMetric
                  label="Valor em negociação"
                  value={formatCurrency(k.pipelineValue)}
                />
                <TenantMetric
                  label="Vendas no período"
                  value={formatCurrency(k.wonValue)}
                  hint={periodLabel}
                />
                <TenantMetric
                  label="Prioridade alta"
                  value={k.priorityLeads ?? k.hotLeads ?? 0}
                />
              </div>

              <TenantSection
                title={board.data?.name ? `Funil · ${board.data.name}` : "Funil resumido"}
                action={
                  stages.length > 0 ? (
                    <span className="text-[12px] tabular-nums text-ink-faint">
                      {stages.reduce((s, st) => s + (st.opportunities?.length ?? 0), 0)} oportunidades
                    </span>
                  ) : null
                }
              >
                {stages.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-ink-muted">
                    Nenhum funil configurado.{" "}
                    <Link
                      href="/app/crm"
                      className="font-medium text-violet-600 dark:text-violet-400"
                    >
                      Abrir funil
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stages.map((stage, i) => {
                      const count = stage.opportunities?.length ?? 0;
                      const value = (stage.opportunities || []).reduce(
                        (s, o) => s + Number(o.value || 0),
                        0
                      );
                      const prevCount =
                        i > 0 ? (stages[i - 1].opportunities?.length ?? 0) : null;
                      const conv =
                        prevCount && prevCount > 0
                          ? Math.round((count / prevCount) * 100)
                          : null;
                      const barPct = Math.round((count / maxStageCount) * 100);
                      return (
                        <div key={stage.id} className="min-w-0">
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: stage.color || "#8b5cf6" }}
                                aria-hidden
                              />
                              <p className="truncate text-[12.5px] font-medium text-ink dark:text-zinc-200">
                                {stage.name}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-baseline gap-2 text-[12px]">
                              <span className="font-semibold tabular-nums text-ink dark:text-white">
                                {count}
                              </span>
                              {value > 0 && (
                                <span className="tabular-nums text-ink-faint">
                                  {formatCurrency(value)}
                                </span>
                              )}
                              {conv != null && (
                                <span className="text-ink-faint">{conv}% ant.</span>
                              )}
                            </div>
                          </div>
                          <div
                            className="h-1.5 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]"
                            role="presentation"
                          >
                            <div
                              className="h-full rounded-full transition-[width] duration-300"
                              style={{
                                width: `${barPct}%`,
                                background: stage.color || "#8b5cf6",
                                opacity: 0.85,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TenantSection>

              {(k.stuckOpportunities ?? 0) > 0 && (
                <p className="text-[12.5px] text-amber-700 dark:text-amber-300">
                  {k.stuckOpportunities} oportunidade
                  {(k.stuckOpportunities || 0) > 1 ? "s" : ""} sem atividade recente — revise no
                  funil.
                </p>
              )}
            </div>
          )}

          {tab === "team" && (
            <div
              id="report-panel-team"
              role="tabpanel"
              aria-labelledby="report-tab-team"
              className="nf-analytics-panel space-y-5"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TenantMetric
                  label="Membros da equipe"
                  value={team.isLoading ? "—" : teamMembers.length}
                  href="/app/team"
                />
                <TenantMetric
                  label="Agentes de IA ativos"
                  value={k.aiAgents}
                  hint={
                    channelsConnected > 0
                      ? `${channelsConnected} canal(is) conectado(s)`
                      : "Nenhum canal conectado"
                  }
                  href="/app/ai"
                />
              </div>

              <TenantSection
                title="Equipe"
                flush
                action={
                  teamMembers.length > 0 ? (
                    <span className="text-[12px] tabular-nums text-ink-faint">
                      {teamMembers.length}
                    </span>
                  ) : null
                }
              >
                {!teamMembers.length ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
                    Nenhum membro listado.
                  </p>
                ) : (
                  <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                    {teamMembers.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink dark:text-gray-100">
                            {m.user.name}
                          </p>
                          <p className="truncate text-[12px] text-ink-faint">{m.user.email}</p>
                        </div>
                        <span className="badge-neutral shrink-0 text-[11px]">
                          {roleLabel(m.role)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TenantSection>

              <TenantSection
                title="Agentes de IA"
                flush
                action={
                  agents.data?.length ? (
                    <span className="text-[12px] tabular-nums text-ink-faint">
                      {agents.data.length}
                    </span>
                  ) : null
                }
              >
                {!agents.data?.length ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
                    Nenhum agente cadastrado.{" "}
                    <Link
                      href="/app/ai"
                      className="font-medium text-violet-600 dark:text-violet-400"
                    >
                      Criar agente
                    </Link>
                  </p>
                ) : (
                  <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                    {agents.data.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink dark:text-gray-100">
                            {a.name}
                          </p>
                          <p className="text-[12px] text-ink-faint">Modo {a.mode}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[12px] font-medium",
                            a.isActive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-ink-faint"
                          )}
                        >
                          {a.isActive ? "Ativo" : "Pausado"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TenantSection>
            </div>
          )}
        </>
      )}
    </TenantModule>
  );
}
