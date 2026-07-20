"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Inbox, MessageSquare, TrendingUp, Users, Bot } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import { EmptyState, PageHeader, Select, Spinner, StatCard } from "@/components/ui";

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
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
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
        "text-xs font-medium",
        flat && "text-ink-faint",
        up && "text-emerald-600 dark:text-emerald-400",
        !up && !flat && "text-red-600 dark:text-red-400"
      )}
    >
      {flat ? "—" : up ? "↑" : "↓"} {flat ? "0%" : `${Math.abs(value)}%`}
      <span className="ml-1 font-normal text-ink-faint">vs. período anterior</span>
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
    insights.push("WhatsApp desconectado");
  }

  return insights.slice(0, 4);
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const queryPeriod = period === "custom" && customFrom && customTo ? "custom" : period === "custom" ? "30" : period;

  const { data, isLoading, isFetching } = useQuery({
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
    queryFn: () => api<TeamMember[]>("/team"),
    staleTime: 60_000,
  });

  const agents = useQuery({
    queryKey: ["ai-agents"],
    queryFn: () => api<Array<{ id: string; name: string; isActive: boolean; mode: string }>>("/ai-agents"),
    staleTime: 60_000,
  });

  const periodLabel = data?.period?.label || PERIODS.find((p) => p.value === period)?.label || "Últimos 30 dias";

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

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Não foi possível carregar os relatórios"
        description="Tente novamente em instantes."
      />
    );
  }

  const k = data.kpis;
  const prev = data.previous;
  const channelsConnected = k.channelsConnected ?? k.channels ?? 0;
  const responseRate = k.messagesIn
    ? Math.round((k.messagesOut / Math.max(k.messagesIn, 1)) * 100)
    : 0;

  const hasFlowData = k.messagesIn > 0 || k.messagesOut > 0 || k.wonValue > 0 || k.openOpportunities > 0;
  const hasAnyActivity =
    hasFlowData ||
    k.openConversations > 0 ||
    k.totalContacts > 0 ||
    k.openTasks > 0;

  const stages = board.data?.stages || [];
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Visão geral" },
    { id: "attendance", label: "Atendimento" },
    { id: "sales", label: "Vendas" },
    { id: "team", label: "Equipe e IA" },
  ];

  return (
    <div className="reports-page w-full min-w-0 space-y-6">
      <PageHeader
        title="Relatórios"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-auto min-w-[10rem]"
              size="sm"
              triggerClassName="h-9 text-sm"
              value={period}
              onChange={(v) => setPeriod(v as PeriodKey)}
              options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
              aria-label="Período"
            />
            <button type="button" className="btn-secondary h-9" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
          </div>
        }
      />

      <p className="text-xs text-ink-muted">
        Período: <span className="font-medium text-ink-secondary dark:text-gray-300">{periodLabel}</span>
        {isFetching ? <span className="ml-2 text-ink-faint">Atualizando…</span> : null}
      </p>

      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Data inicial</label>
            <input
              type="date"
              className="input h-9"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Data final</label>
            <input
              type="date"
              className="input h-9"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-line pb-px dark:border-white/[0.06]"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "shrink-0 rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-400"
                : "text-ink-muted hover:text-ink dark:hover:text-gray-200"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Empty state elegante */}
      {!hasAnyActivity ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-[13.5px] font-medium text-ink-muted dark:text-gray-400">
            Sem dados neste período
          </p>
          {channelsConnected === 0 ? (
            <Link
              href="/app/integrations"
              className="btn-primary mx-auto mt-4 h-9 px-4 text-xs"
            >
              Conectar WhatsApp
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-6">
              {/* 4 KPIs prioritários */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  className="p-3.5"
                  label="Conversas abertas"
                  value={k.openConversations}
                  hint={
                    k.unreadConversations
                      ? `${k.unreadConversations} sem leitura`
                      : undefined
                  }
                  icon={<Inbox className="h-3.5 w-3.5" />}
                />
                <StatCard
                  className="p-3.5"
                  label="Taxa de resposta"
                  value={`${responseRate}%`}
                  hint={
                    k.messagesIn
                      ? `${k.messagesOut} enviadas / ${k.messagesIn} recebidas`
                      : "Sem mensagens no período"
                  }
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  trend={(() => {
                    if (!prev || prev.messagesIn <= 0) return null;
                    const d = pctChange(
                      responseRate,
                      Math.round((prev.messagesOut / Math.max(prev.messagesIn, 1)) * 100)
                    );
                    return d == null ? null : { value: d, label: "vs. anterior" };
                  })()}
                />
                <StatCard
                  className="p-3.5"
                  label="Oportunidades abertas"
                  value={k.openOpportunities}
                  hint={
                    k.pipelineValue > 0
                      ? formatCurrency(k.pipelineValue) + " em negociação"
                      : undefined
                  }
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                />
                <StatCard
                  className="p-3.5"
                  label="Vendas no período"
                  value={formatCurrency(k.wonValue)}
                  hint={periodLabel}
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  trend={(() => {
                    if (!prev) return null;
                    const d = pctChange(k.wonValue, prev.wonValue);
                    return d == null ? null : { value: d, label: "vs. anterior" };
                  })()}
                />
              </div>

              {/* Secundárias compactas */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-line/80 px-4 py-3 text-xs dark:border-white/[0.06]">
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
                    <span className="font-semibold tabular-nums text-ink dark:text-white">{m.value}</span>
                  </div>
                ))}
              </div>

              {/* Comparação período (só se houver dados) */}
              {prev && (k.messagesIn > 0 || prev.messagesIn > 0) && (
                <div className="card px-4 py-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                    Tendência no período
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-ink-muted">Mensagens recebidas</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-ink dark:text-white">
                        {k.messagesIn}
                      </p>
                      <Delta value={pctChange(k.messagesIn, prev.messagesIn)} />
                    </div>
                    <div>
                      <p className="text-xs text-ink-muted">Mensagens enviadas</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-ink dark:text-white">
                        {k.messagesOut}
                      </p>
                      <Delta value={pctChange(k.messagesOut, prev.messagesOut)} />
                    </div>
                    <div>
                      <p className="text-xs text-ink-muted">Vendas</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-ink dark:text-white">
                        {formatCurrency(k.wonValue)}
                      </p>
                      <Delta value={pctChange(k.wonValue, prev.wonValue)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Insights */}
              <div className="card px-4 py-4">
                <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                  Insights do período
                </h2>
                {insights.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    Ainda não há dados suficientes para gerar insights.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {insights.map((text) => (
                      <li
                        key={text}
                        className="flex gap-2 text-sm leading-relaxed text-ink-secondary dark:text-gray-300"
                      >
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Resumos compactos atendimento + vendas */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card px-4 py-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                      Atendimento
                    </h2>
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-600 dark:text-brand-400"
                      onClick={() => setTab("attendance")}
                    >
                      Ver mais
                    </button>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-ink-faint">Abertas</dt>
                      <dd className="font-semibold text-ink dark:text-white">{k.openConversations}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Não lidas</dt>
                      <dd className="font-semibold text-ink dark:text-white">{k.unreadConversations}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Encerradas no período</dt>
                      <dd className="font-semibold text-ink dark:text-white">
                        {k.closedConversations ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Taxa de resposta</dt>
                      <dd className="font-semibold text-ink dark:text-white">{responseRate}%</dd>
                    </div>
                  </dl>
                </div>
                <div className="card px-4 py-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                      Vendas
                    </h2>
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-600 dark:text-brand-400"
                      onClick={() => setTab("sales")}
                    >
                      Ver mais
                    </button>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-ink-faint">Em aberto</dt>
                      <dd className="font-semibold text-ink dark:text-white">{k.openOpportunities}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Valor em negociação</dt>
                      <dd className="font-semibold text-ink dark:text-white">
                        {formatCurrency(k.pipelineValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Vendido no período</dt>
                      <dd className="font-semibold text-ink dark:text-white">
                        {formatCurrency(k.wonValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Paradas no funil</dt>
                      <dd className="font-semibold text-ink dark:text-white">
                        {k.stuckOpportunities ?? 0}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {tab === "attendance" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Msgs recebidas" value={k.messagesIn} hint={periodLabel} />
                <StatCard label="Msgs enviadas" value={k.messagesOut} hint={periodLabel} />
                <StatCard label="Não lidas" value={k.unreadConversations} />
                <StatCard
                  label="Taxa de resposta"
                  value={`${responseRate}%`}
                  hint="Enviadas ÷ recebidas no período"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Conversas abertas" value={k.openConversations} />
                <StatCard label="Encerradas no período" value={k.closedConversations ?? 0} />
                <StatCard label="Aguardando resposta" value={k.waitingReply ?? 0} />
              </div>
              <p className="text-xs text-ink-faint">
                Tempo médio de primeira resposta e por canal exigem instrumentação adicional — não
                exibidos sem dados reais.
              </p>
            </div>
          )}

          {tab === "sales" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Oportunidades abertas" value={k.openOpportunities} />
                <StatCard label="Valor em negociação" value={formatCurrency(k.pipelineValue)} />
                <StatCard label="Vendas no período" value={formatCurrency(k.wonValue)} hint={periodLabel} />
                <StatCard label="Prioridade alta" value={k.priorityLeads ?? k.hotLeads ?? 0} />
              </div>

              {/* Funil resumido */}
              <div className="card overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-white/[0.06]">
                  <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                    Funil resumido
                  </h2>
                </div>
                {stages.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-ink-muted">Nenhum funil configurado.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto p-4">
                    {stages.map((stage, i) => {
                      const count = stage.opportunities?.length ?? 0;
                      const value = (stage.opportunities || []).reduce(
                        (s, o) => s + Number(o.value || 0),
                        0
                      );
                      const prevCount =
                        i > 0 ? stages[i - 1].opportunities?.length ?? 0 : null;
                      const conv =
                        prevCount && prevCount > 0
                          ? Math.round((count / prevCount) * 100)
                          : null;
                      return (
                        <div
                          key={stage.id}
                          className="min-w-[7rem] flex-1 rounded-lg border border-line px-3 py-3 dark:border-white/[0.06]"
                        >
                          <span
                            className="mb-2 block h-0.5 w-full rounded-full"
                            style={{ background: stage.color || "#6366f1" }}
                          />
                          <p className="truncate text-[11px] font-medium text-ink-faint">
                            {stage.name}
                          </p>
                          <p className="mt-1 font-display text-xl font-semibold text-ink dark:text-white">
                            {count}
                          </p>
                          {value > 0 && (
                            <p className="mt-0.5 text-[11px] tabular-nums text-ink-muted">
                              {formatCurrency(value)}
                            </p>
                          )}
                          {conv != null && (
                            <p className="mt-1 text-[10px] text-ink-faint">{conv}% da etapa anterior</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-faint">
                Taxa de conversão global e ticket médio exigem contagem formal de ganhos no período —
                exibidos somente quando o modelo de dados suportar sem inventar valores.
              </p>
            </div>
          )}

          {tab === "team" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Membros da equipe"
                  value={team.data?.length ?? "—"}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                <StatCard
                  label="Agentes de IA ativos"
                  value={k.aiAgents}
                  icon={<Bot className="h-3.5 w-3.5" />}
                  hint={`${channelsConnected} canal(is) conectado(s)`}
                />
              </div>

              <div className="card overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-white/[0.06]">
                  <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                    Equipe
                  </h2>
                </div>
                {!team.data?.length ? (
                  <p className="px-4 py-6 text-sm text-ink-muted">Nenhum membro listado.</p>
                ) : (
                  <ul className="divide-y divide-line-soft dark:divide-white/[0.04]">
                    {team.data.map((m) => (
                      <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-ink dark:text-gray-100">{m.user.name}</p>
                          <p className="text-xs text-ink-faint">{m.user.email}</p>
                        </div>
                        <span className="badge-neutral text-[11px]">{m.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-white/[0.06]">
                  <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                    Agentes de IA
                  </h2>
                </div>
                {!agents.data?.length ? (
                  <p className="px-4 py-6 text-sm text-ink-muted">Nenhum agente cadastrado.</p>
                ) : (
                  <ul className="divide-y divide-line-soft dark:divide-white/[0.04]">
                    {agents.data.map((a) => (
                      <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium text-ink dark:text-gray-100">{a.name}</p>
                          <p className="text-xs text-ink-faint">Modo {a.mode}</p>
                        </div>
                        <span
                          className={cn(
                            "text-xs font-medium",
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
              </div>
              <p className="text-xs text-ink-faint">
                Métricas por atendente (tempo de resposta, conversas encerradas) e custo de IA
                dependem de telemetria ainda não consolidada — não exibidas sem base real.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
