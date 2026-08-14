"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Inbox,
  Users,
  CheckSquare,
  ArrowRight,
  CheckCircle2,
  Circle,
  MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate, initials } from "@/lib/utils";
import {
  EmptyState,
  StatCardSkeleton,
  ListSkeleton,
} from "@/components/ui";
import {
  AttentionPanel,
  type AttentionItem,
  type AttentionTone,
} from "@/components/attention-panel";
import { TenantModule, TenantStatStrip } from "@/components/tenant/tenant-module";

type SetupChecklist = {
  whatsappConfigured: boolean;
  agentCreated: boolean;
  pipelineCreated: boolean;
  homeSetupCompleted: boolean;
};

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
    channelsConnected?: number;
    channelsConfigured?: number;
    hotLeads: number;
    priorityLeads?: number;
    qualifiedLeads?: number;
    overdueTasks?: number;
    waitingReply?: number;
    /** Fila Assumir (só pedido real de humano) */
    waitingHuman?: number;
  };
  waitingHumanCount?: number;
  /** Setup histórico da Home — independente do status live do WhatsApp */
  setupChecklist?: SetupChecklist;
  whatsapp?: {
    status?: string;
    connected?: boolean;
    everConfigured?: boolean;
  };
  recommendations?: Array<{
    id: string;
    title: string;
    reason: string;
    impact: string;
    actionLabel: string;
    href: string;
  }>;
  health?: Record<
    string,
    {
      label: string;
      status: string;
      human: string;
      detail?: string[];
      actionLabel?: string;
      actionHref?: string;
    }
  >;
  recentConversations: Array<{
    id: string;
    lastMessagePreview?: string;
    lastMessageAt?: string;
    status?: string;
    contact: { name: string };
    channel?: { type: string; name: string };
    assignedTo?: { name: string } | null;
  }>;
  forgottenOpportunities: Array<{
    id: string;
    lastMessageAt?: string;
    isUnread?: boolean;
    contact: { name: string };
    assignedToId?: string | null;
  }>;
};

type PipelineStage = {
  id: string;
  name: string;
  color: string;
  opportunities: Array<{ id: string }>;
};

type Pipeline = {
  id: string;
  name: string;
  stages: PipelineStage[];
};

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return formatDate(value);
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return formatDate(value);
}

/** Indicadores operacionais do cliente (nunca filas/workers/infra) */
const CLIENT_HEALTH = [
  { key: "whatsapp", label: "WhatsApp", href: "/app/integrations" },
  { key: "agents", label: "IA", href: "/app/ai" },
  { key: "automations", label: "Automações", href: "/app/automations" },
] as const;

function healthDot(status: string) {
  if (status === "ok" || status === "OPERANDO") return "bg-emerald-500";
  if (status === "error" || status === "INDISPONIVEL") return "bg-red-500";
  if (status === "SEM_DADOS" || status === "idle") return "bg-slate-400 dark:bg-slate-500";
  return "bg-amber-500"; // ATENCAO
}

/** Texto curto, linguagem de negócio — sem jargão de infraestrutura */
function clientHealthCopy(
  key: string,
  h: { status: string; human: string }
): { statusLabel: string; detail: string } {
  const st = h.status;
  if (key === "whatsapp") {
    if (st === "OPERANDO" || st === "ok")
      return { statusLabel: "Operando", detail: "Conectado" };
    if (st === "SEM_DADOS" || st === "idle")
      return { statusLabel: "Sem dados", detail: "Não conectado" };
    if (st === "INDISPONIVEL" || st === "error")
      return { statusLabel: "Indisponível", detail: "Falha na conexão" };
    return { statusLabel: "Atenção", detail: "Não conectado" };
  }
  if (key === "agents") {
    if (st === "OPERANDO" || st === "ok")
      return { statusLabel: "Operando", detail: "Operando" };
    if (st === "SEM_DADOS" || st === "idle")
      return { statusLabel: "Sem dados", detail: "Nenhum agente ativo" };
    if (st === "INDISPONIVEL" || st === "error")
      return { statusLabel: "Indisponível", detail: "Indisponível" };
    const awaitingChannel = /aguardando canal|canal/i.test(h.human || "");
    return {
      statusLabel: "Atenção",
      detail: awaitingChannel ? "Aguardando canal" : "Configuração pendente",
    };
  }
  // automations
  if (st === "OPERANDO" || st === "ok")
    return { statusLabel: "Normal", detail: "Normal" };
  if (st === "SEM_DADOS" || st === "idle")
    return { statusLabel: "Sem dados", detail: "Nenhuma ativa" };
  if (st === "ATENCAO") {
    if (/aguardando canal|canal/i.test(h.human || "")) {
      return { statusLabel: "Atenção", detail: "Aguardando canal" };
    }
    const m = h.human.match(/(\d+)\s*falha/i);
    return {
      statusLabel: "Atenção",
      detail: m
        ? `${m[1]} falha${m[1] === "1" ? "" : "s"} recente${m[1] === "1" ? "" : "s"}`
        : "Falhas recentes",
    };
  }
  if (st === "INDISPONIVEL" || st === "error")
    return { statusLabel: "Indisponível", detail: "Indisponível" };
  return { statusLabel: "Sem dados", detail: "Sem dados" };
}

function DashboardSkeleton() {
  return (
    <TenantModule kind="ops" title="Início" kicker="Operação">
      <div className="nf-stat-strip opacity-60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="nf-stat-strip__item">
            <StatCardSkeleton />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] p-5 dark:border-white/[0.07]">
        <ListSkeleton rows={3} />
      </div>
    </TenantModule>
  );
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });

  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/pipelines"),
    staleTime: 30_000,
  });

  const primaryPipelineId = pipelines.data?.[0]?.id;

  const pipelineDetail = useQuery({
    queryKey: ["board", primaryPipelineId],
    queryFn: () => api<Pipeline>(`/pipelines/${primaryPipelineId}/board`),
    enabled: Boolean(primaryPipelineId),
    staleTime: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <EmptyState
        title="Não foi possível carregar o painel"
        description="Tente novamente em instantes."
      />
    );
  }

  const k = data.kpis;
  const channelsConnected = k.channelsConnected ?? k.channels;
  const priorityHigh = k.priorityLeads ?? k.hotLeads ?? 0;
  const overdue = k.overdueTasks ?? 0;

  // ── Onboarding: só progresso histórico de setup (não status live do WA) ──
  const checklist = data.setupChecklist;
  const setupSteps = [
    {
      id: "channel",
      label: "Conectar WhatsApp",
      done: checklist
        ? checklist.whatsappConfigured
        : (k.channelsConfigured ?? 0) > 0 || channelsConnected > 0,
      href: "/app/integrations",
    },
    {
      id: "agent",
      label: "Criar agente",
      done: checklist ? checklist.agentCreated : k.aiAgents > 0,
      href: "/app/ai",
    },
    {
      id: "pipeline",
      label: "Criar funil",
      done: checklist
        ? checklist.pipelineCreated
        : Boolean(pipelines.data?.length) || k.openOpportunities > 0,
      href: "/app/crm",
    },
  ];
  const completedCore = setupSteps.filter((s) => s.done).length;
  const totalCore = setupSteps.length;
  /** Só se setup incompleto — WhatsApp offline depois do setup = saúde/foco, não onboarding */
  const displaySetup =
    !(checklist?.homeSetupCompleted === true) && completedCore < totalCore;
  const pendingSteps = setupSteps.filter((s) => !s.done);
  const nextSetup = pendingSteps[0];
  const onlyWhatsAppPending =
    pendingSteps.length === 1 && pendingSteps[0].id === "channel";
  const showContinueSetup = pendingSteps.length > 1 && Boolean(nextSetup);

  // ── Foco do dia: sem CTAs redundantes para a mesma fila ──
  const focusItems: AttentionItem[] = [];
  const seen = new Set<string>();

  const pushFocus = (item: AttentionItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    focusItems.push(item);
  };

  const decide = (id: string, status: "RESOLVED" | "IGNORED") => {
    void api(`/recommendations/${id}/decision`, {
      method: "POST",
      json: { status },
    }).then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }));
  };

  // 1º — Fila humana real (cliente pediu ou IA solicitou handoff)
  const waitingHuman = Number(data.waitingHumanCount ?? data.kpis?.waitingHuman ?? 0);
  if (waitingHuman > 0) {
    pushFocus({
      id: "assume-human",
      title:
        waitingHuman === 1
          ? "1 chat aguarda você assumir"
          : `${waitingHuman} chats aguardam um atendente`,
      detail: "Pedido de humano (cliente ou IA).",
      href: "/app/inbox?status=PENDING",
      actionLabel: waitingHuman === 1 ? "Assumir" : "Ver fila",
      tone: "danger",
      icon: <MessageCircle className="h-4 w-4" strokeWidth={1.75} />,
    });
  }

  for (const rec of data.recommendations?.slice(0, 4) || []) {
    // Setup incompleto: conectar WA só no banner de onboarding
    if (rec.id === "wa-connect" && displaySetup && !setupSteps[0].done) continue;
    // Não duplicar fila humana
    if (rec.id === "waiting-human" || rec.id === "human-queue") continue;
    // Não empilhar mais um CTA genérico de inbox se já há fila humana
    if (
      waitingHuman > 0 &&
      (rec.href?.startsWith("/app/inbox") || /conversa|inbox|atendimento/i.test(rec.title))
    ) {
      continue;
    }
    const tone: AttentionTone =
      rec.id.includes("wa") || rec.id.includes("down") ? "danger" : "info";
    pushFocus({
      id: `rec-${rec.id}`,
      title: rec.title,
      detail: rec.reason?.trim() || undefined,
      href: rec.href,
      actionLabel: rec.actionLabel,
      tone,
      secondaryActions: [
        { label: "Feito", onClick: () => decide(rec.id, "RESOLVED") },
        { label: "Dispensar", onClick: () => decide(rec.id, "IGNORED"), muted: true },
      ],
    });
  }

  // Sem leitura / aguardando resposta: um único item de inbox (não se waitingHuman)
  if (waitingHuman === 0) {
    if (k.unreadConversations > 0) {
      pushFocus({
        id: "unread",
        title: `${k.unreadConversations} sem leitura`,
        href: "/app/inbox",
        actionLabel: "Ver",
        tone: "warning",
        icon: <Inbox className="h-4 w-4" strokeWidth={1.75} />,
      });
    } else if ((k.waitingReply ?? 0) > 0) {
      pushFocus({
        id: "waiting",
        title: `${k.waitingReply} aguardando resposta`,
        href: "/app/inbox",
        actionLabel: "Ver",
        tone: "warning",
        icon: <MessageCircle className="h-4 w-4" strokeWidth={1.75} />,
      });
    }
  }

  if (overdue > 0) {
    pushFocus({
      id: "overdue",
      title: `${overdue} tarefa${overdue > 1 ? "s" : ""} vencida${overdue > 1 ? "s" : ""}`,
      href: "/app/tasks",
      actionLabel: "Ver tarefas",
      tone: "warning",
      icon: <CheckSquare className="h-4 w-4" strokeWidth={1.75} />,
    });
  } else if (k.openTasks > 5) {
    pushFocus({
      id: "tasks-many",
      title: `${k.openTasks} tarefas em aberto`,
      href: "/app/tasks",
      actionLabel: "Ver tarefas",
      tone: "info",
      icon: <CheckSquare className="h-4 w-4" strokeWidth={1.75} />,
    });
  }

  data.forgottenOpportunities.slice(0, 2).forEach((c) => {
    pushFocus({
      id: `forget-${c.id}`,
      title: c.contact.name,
      detail: !c.assignedToId
        ? "Lead sem responsável"
        : c.isUnread
          ? "Mensagem sem resposta"
          : "Sem interação recente",
      href: `/app/inbox?id=${c.id}`,
      actionLabel: "Abrir",
      tone: !c.assignedToId ? "danger" : "warning",
      icon: <Users className="h-4 w-4" strokeWidth={1.75} />,
    });
  });

  const focusSlice = focusItems.slice(0, 6);

  const stages = pipelineDetail.data?.stages?.slice(0, 6) || [];
  const recent = data.recentConversations.slice(0, 5);

  const healthEntries = CLIENT_HEALTH.map((meta) => {
    const raw = data.health?.[meta.key];
    if (!raw) return null;
    const copy = clientHealthCopy(meta.key, raw);
    return {
      key: meta.key,
      label: meta.label,
      href: raw.actionHref || meta.href,
      status: raw.status,
      ...copy,
    };
  }).filter(Boolean) as Array<{
    key: string;
    label: string;
    href: string;
    status: string;
    statusLabel: string;
    detail: string;
  }>;

  return (
    <TenantModule kind="ops" title="Início" kicker="Operação">
      {/* Setup: só enquanto incompleto (histórico), não status live */}
      {displaySetup && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-violet-400/20 dark:bg-violet-500/[0.06]">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink dark:text-white">
                Configuração inicial
              </p>
              <span className="text-[11px] font-medium text-ink-faint">
                {completedCore} de {totalCore}
              </span>
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
              {setupSteps.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors",
                      step.done
                        ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                        : "font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink dark:text-gray-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
                    )}
                    title={
                      step.done
                        ? `Abrir: ${step.label}`
                        : onlyWhatsAppPending && step.id === "channel"
                          ? "Conectar WhatsApp"
                          : `Continuar: ${step.label}`
                    }
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    )}
                    {step.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 h-1 max-w-[12rem] overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-violet-500/80 transition-[width] duration-500"
                style={{ width: `${Math.max(6, (completedCore / totalCore) * 100)}%` }}
              />
            </div>
          </div>
          {showContinueSetup && nextSetup && (
            <Link
              href={nextSetup.href}
              className="btn-secondary h-8 shrink-0 px-3 text-xs"
            >
              Continuar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* Visão rápida — faixa, não grid de cards */}
      <TenantStatStrip
        items={[
          {
            label: k.unreadConversations
              ? `${k.unreadConversations} sem leitura`
              : "Conversas abertas",
            value: k.openConversations,
            tone: k.unreadConversations ? "warn" : "default",
          },
          {
            label: priorityHigh
              ? `${priorityHigh} prioridade alta`
              : "Base (contatos)",
            value: k.totalContacts,
          },
          {
            label: k.pipelineValue
              ? formatCurrency(k.pipelineValue)
              : "Oportunidades",
            value: k.openOpportunities,
          },
          {
            label:
              k.openTasks > 0
                ? `${k.openTasks} tarefa${k.openTasks === 1 ? "" : "s"} abertas`
                : "Vendas (30d)",
            value: formatCurrency(k.wonValue),
            tone: "ok",
          },
        ]}
      />

      {/* Layout assimétrico: foco + atividade (8) | funil + saúde (4) */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-12 lg:items-start [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-8">
          <AttentionPanel
            title="Foco do dia"
            items={focusSlice}
            emptyTitle="Nada urgente agora"
            emptyDescription="Sem filas humanas, tarefas vencidas ou conversas sem leitura."
            variant="default"
          />

          <section
            aria-label="Atividade recente"
            className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-2.5 dark:border-white/[0.06]">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
                Atividade
              </h2>
              <Link
                href="/app/inbox"
                className="text-xs font-medium text-ink-muted transition-colors hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-400"
              >
                Conversas
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="flex flex-col gap-2 px-4 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-ink-faint dark:bg-white/[0.05]">
                    <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-ink dark:text-white">
                      Nenhuma conversa recente
                    </p>
                    {channelsConnected === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        Conecte o WhatsApp em Canais.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-muted">
                        As últimas mensagens aparecem aqui.
                      </p>
                    )}
                  </div>
                </div>
                {channelsConnected === 0 ? (
                  <Link
                    href="/app/integrations"
                    className="btn-primary btn-sm h-8 w-fit"
                  >
                    Conectar canal
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                {recent.map((c) => (
                  <Link
                    key={c.id}
                    href={`/app/inbox?id=${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/90 to-violet-600/80 text-[10px] font-semibold text-white">
                      {initials(c.contact.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink dark:text-gray-100">
                        {c.contact.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {c.lastMessagePreview || "Sem mensagens"}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] text-ink-faint">
                      {relativeTime(c.lastMessageAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-4">
          <section
            aria-label="Funil"
            className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-2.5 dark:border-white/[0.06]">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
                Funil
              </h2>
              <Link
                href="/app/crm"
                className="text-xs font-medium text-ink-muted transition-colors hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-400"
              >
                Abrir
              </Link>
            </div>
            {stages.length > 0 ? (
              <div className="flex flex-col gap-1.5 p-3">
                {stages.map((stage) => {
                  const count = stage.opportunities?.length ?? 0;
                  return (
                    <Link
                      key={stage.id}
                      href="/app/crm"
                      className="flex items-center gap-2.5 rounded-xl border border-black/[0.04] px-2.5 py-2 transition-colors hover:border-violet-500/25 dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full opacity-90"
                        style={{ backgroundColor: stage.color || "#8B5CF6" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-muted">
                        {stage.name}
                      </span>
                      <span className="font-display text-base font-semibold tabular-nums text-ink dark:text-white">
                        {count}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-5">
                <p className="text-xs text-ink-muted">
                  Crie etapas e oportunidades no CRM.
                </p>
                <Link href="/app/crm" className="btn-secondary btn-sm h-8 shrink-0">
                  Abrir funil
                </Link>
              </div>
            )}
          </section>

          <section
            aria-label="Saúde da operação"
            className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]"
          >
            <div className="border-b border-black/[0.05] px-4 py-2.5 dark:border-white/[0.06]">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
                Saúde
              </h2>
            </div>
            {healthEntries.length === 0 ? (
              <p className="px-4 py-5 text-xs text-ink-muted">Sem dados</p>
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
                {healthEntries.map((h) => (
                  <li key={h.key}>
                    <Link
                      href={h.href}
                      className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          healthDot(h.status)
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-medium text-ink dark:text-gray-100">
                          {h.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                          {h.detail}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </TenantModule>
  );
}
