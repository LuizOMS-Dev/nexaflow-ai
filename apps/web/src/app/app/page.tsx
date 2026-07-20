"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Inbox,
  Users,
  Kanban,
  CheckSquare,
  ArrowRight,
  Bot,
  Radio,
  Sparkles,
  Columns3,
  CheckCircle2,
  Circle,
  MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatDate, initials } from "@/lib/utils";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatCardSkeleton,
  ListSkeleton,
} from "@/components/ui";
import {
  AttentionPanel,
  type AttentionItem,
  type AttentionTone,
} from "@/components/attention-panel";

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
    // ATENCAO: sem chave, ou agente pronto mas sem WhatsApp conectado
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
    <div className="home-page space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-7 w-24" />
        <div className="skeleton h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="card p-5">
        <ListSkeleton rows={3} />
      </div>
    </div>
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

  // ── Onboarding compacto (histórico / setup — NÃO status operacional) ──
  // Fallback só para respostas antigas da API; preferir setupChecklist persistido.
  const checklist = data.setupChecklist;
  const setupSteps = [
    {
      id: "channel",
      label: "Conectar WhatsApp",
      done: checklist
        ? checklist.whatsappConfigured
        : (k.channelsConfigured ?? 0) > 0 || channelsConnected > 0,
      href: "/app/integrations",
      icon: Radio,
    },
    {
      id: "agent",
      label: "Criar agente",
      done: checklist ? checklist.agentCreated : k.aiAgents > 0,
      href: "/app/ai",
      icon: Sparkles,
    },
    {
      id: "pipeline",
      label: "Criar funil",
      done: checklist
        ? checklist.pipelineCreated
        : Boolean(pipelines.data?.length) || k.openOpportunities > 0,
      href: "/app/crm",
      icon: Columns3,
    },
  ];
  const completedCore = setupSteps.filter((s) => s.done).length;
  const totalCore = setupSteps.length;
  /** Esconde o bloco quando 3/3 ou flag homeSetupCompleted no backend */
  const displaySetup =
    !(checklist?.homeSetupCompleted === true) && completedCore < totalCore;
  const pendingSteps = setupSteps.filter((s) => !s.done);
  const nextSetup = pendingSteps[0];
  /** Só WhatsApp pendente → CTA principal fica no banner; sem segundo botão. */
  const onlyWhatsAppPending =
    pendingSteps.length === 1 && pendingSteps[0].id === "channel";
  /**
   * Continuar configuração: só se houver 2+ etapas pendentes,
   * e sempre como secundário (não compete com "Conectar WhatsApp").
   */
  const showContinueSetup = pendingSteps.length > 1 && Boolean(nextSetup);

  // ── Prioridades: Assumir (só handoff real) + operação ──
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
      detail: "Pedido de humano (cliente ou IA). Abra e toque em Assumir.",
      href: "/app/inbox?status=PENDING",
      actionLabel: waitingHuman === 1 ? "Abrir conversa" : "Ver atendimentos",
      tone: "danger",
      icon: <MessageCircle className="h-4 w-4" strokeWidth={1.75} />,
    });
  }

  for (const rec of data.recommendations?.slice(0, 4) || []) {
    if (rec.id === "wa-connect" && displaySetup && !setupSteps[0].done) continue;
    // Não duplicar fila humana genérica
    if (rec.id === "waiting-human" || rec.id === "human-queue") continue;
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

  if (k.unreadConversations > 0) {
    pushFocus({
      id: "unread",
      title: `${k.unreadConversations} conversa${k.unreadConversations > 1 ? "s" : ""} sem leitura`,
      href: "/app/inbox",
      actionLabel: "Abrir conversas",
      tone: "warning",
      icon: <Inbox className="h-4 w-4" strokeWidth={1.75} />,
    });
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

  if ((k.waitingReply ?? 0) > 0 && !seen.has("unread")) {
    pushFocus({
      id: "waiting",
      title: `${k.waitingReply} cliente${(k.waitingReply || 0) > 1 ? "s" : ""} aguardando resposta`,
      href: "/app/inbox",
      actionLabel: "Abrir",
      tone: "warning",
      icon: <MessageCircle className="h-4 w-4" strokeWidth={1.75} />,
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

  // Saúde do cliente: só WhatsApp / IA / Automações (sem Filas/infra)
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

  /**
   * Header contextual — sem duplicar o CTA do banner global de WhatsApp.
   * Desconectado / LOGGED_OUT / etc.: CTA só no banner.
   * Conectado: "Abrir conversas".
   */
  const waConnected = channelsConnected > 0;
  const headerActions = waConnected ? (
    <Link href="/app/inbox" className="btn-primary h-9 shrink-0 text-xs">
      Abrir conversas
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  ) : undefined;

  return (
    <div className="home-page w-full min-w-0 max-w-full space-y-8">
      <PageHeader
        title="Início"
        actions={headerActions}
      />

      {/* ═══ Onboarding compacto (progresso — sem CTA primário duplicado) ═══ */}
      {displaySetup && (
        <section className="card flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink dark:text-white">
                Configuração inicial
              </p>
              <span className="text-[11px] font-medium text-ink-faint">
                {completedCore} de {totalCore} etapas
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-1 gap-y-1">
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
            <div className="mt-2.5 h-1 max-w-xs overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                style={{ width: `${Math.max(6, (completedCore / totalCore) * 100)}%` }}
              />
            </div>
          </div>
          {showContinueSetup && nextSetup && (
            <Link
              href={nextSetup.href}
              className="btn-secondary h-8 shrink-0 px-3 text-xs"
            >
              Continuar configuração
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </section>
      )}

      {/* ═══ 2. Resumo executivo — 4 KPIs ═══ */}
      <section className="home-section" aria-label="Resumo executivo">
        <p className="home-section-label">Resumo</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="home-kpi p-3.5"
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
            className="home-kpi p-3.5"
            label="Contatos"
            value={k.totalContacts}
            hint={
              priorityHigh
                ? `${priorityHigh} com prioridade alta`
                : undefined
            }
            icon={<Users className="h-3.5 w-3.5" />}
          />
          <StatCard
            className="home-kpi p-3.5"
            label="Oportunidades abertas"
            value={k.openOpportunities}
            hint={
              k.pipelineValue
                ? formatCurrency(k.pipelineValue)
                : undefined
            }
            icon={<Kanban className="h-3.5 w-3.5" />}
          />
          <StatCard
            className="home-kpi p-3.5"
            label="Vendas (30 dias)"
            value={formatCurrency(k.wonValue)}
            hint={
              k.openTasks > 0
                ? `${k.openTasks} tarefa${k.openTasks === 1 ? "" : "s"} em aberto`
                : undefined
            }
            icon={<CheckSquare className="h-3.5 w-3.5" />}
          />
        </div>
      </section>

      {/* Pendências */}
      <section className="home-section" aria-label="Pendências">
        <AttentionPanel
          title="Pendências"
          items={focusSlice}
          emptyTitle="Nenhuma pendência"
          variant="default"
        />
      </section>

      {/* ═══ 4. Operação ═══ */}
      <section className="home-section min-w-0" aria-label="Operação">
        <p className="home-section-label">Operação</p>
        <div className="grid min-w-0 gap-4 lg:grid-cols-5 [&>*]:min-w-0">
          <div className="min-w-0 lg:col-span-3">
            <SectionCard
              title="Conversas recentes"
              action={
                <Link
                  href="/app/inbox"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  Ver todas
                </Link>
              }
            >
              {recent.length === 0 ? (
                <div className="flex flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-faint dark:bg-white/[0.05]">
                      <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-medium text-ink dark:text-white">
                        Nenhuma conversa
                      </p>
                      {channelsConnected === 0 ? (
                        <p className="mt-1 text-xs text-ink-muted">
                          Conecte o WhatsApp em Integrações.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {channelsConnected === 0 ? (
                    <Link
                      href="/app/integrations"
                      className="btn-primary btn-sm h-8 shrink-0 self-start sm:self-center"
                    >
                      Conectar canal
                    </Link>
                  ) : (
                    <Link
                      href="/app/inbox"
                      className="btn-secondary btn-sm h-8 shrink-0 self-start sm:self-center"
                    >
                      Ir para conversas
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-line-soft dark:divide-white/[0.04]">
                  {recent.map((c) => (
                    <Link
                      key={c.id}
                      href={`/app/inbox?id=${c.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted/60 dark:hover:bg-white/[0.02]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/90 to-violet-500/90 text-[10px] font-semibold text-white">
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
            </SectionCard>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <div className="card flex h-full min-h-0 flex-col px-3.5 py-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink dark:text-white">Status</p>
                <Link
                  href="/app/integrations"
                  className="text-[11px] font-medium text-ink-faint transition-colors hover:text-brand-600 dark:hover:text-brand-400"
                >
                  Canais
                </Link>
              </div>
              {healthEntries.length === 0 ? (
                <p className="py-2 text-xs text-ink-muted">Sem dados</p>
              ) : (
                <ul className="flex flex-1 flex-col justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-0 sm:divide-x sm:divide-line dark:sm:divide-white/[0.06]">
                  {healthEntries.map((h) => (
                    <li key={h.key} className="min-w-0 flex-1 sm:px-3 first:sm:pl-0 last:sm:pr-0">
                      <Link
                        href={h.href}
                        className="flex items-start gap-2 rounded-md py-0.5 transition-colors hover:opacity-90"
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
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 5. Vendas ═══ */}
      <section className="home-section" aria-label="Vendas">
        <div className="mb-3 flex items-end justify-between gap-2">
          <p className="home-section-label mb-0">Vendas</p>
          <Link
            href="/app/crm"
            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Abrir funil
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Mini métricas comerciais */}
          <div className="card grid grid-cols-2 gap-px overflow-hidden bg-line dark:bg-white/[0.06] lg:col-span-2">
            {[
              {
                label: "Oportunidades",
                value: k.openOpportunities,
                href: "/app/crm",
              },
              {
                label: "Prioridade alta",
                value: priorityHigh,
                href: "/app/contacts",
              },
              {
                label: "Tarefas abertas",
                value: k.openTasks,
                href: "/app/tasks",
              },
              {
                label: "Agentes de IA",
                value: k.aiAgents,
                href: "/app/ai",
                icon: Bot,
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="bg-white px-4 py-3.5 transition-colors hover:bg-surface-muted/50 dark:bg-[#12141A] dark:hover:bg-white/[0.03]"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  {item.label}
                </p>
                <p className="mt-1 font-display text-xl font-semibold tracking-tight text-ink dark:text-white">
                  {item.value}
                </p>
              </Link>
            ))}
          </div>

          {/* Funil resumido */}
          <div className="card overflow-hidden lg:col-span-3">
            <div className="border-b border-line px-4 py-2.5 dark:border-white/[0.06]">
              <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                Visão rápida do funil
              </h2>
            </div>
            {stages.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto p-3">
                {stages.map((stage) => {
                  const count = stage.opportunities?.length ?? 0;
                  return (
                    <Link
                      key={stage.id}
                      href="/app/crm"
                      className="flex min-w-[4.5rem] flex-1 flex-col rounded-lg border border-line/80 px-2.5 py-2.5 transition-colors hover:border-brand-500/20 dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
                    >
                      <span
                        className="mb-1.5 h-0.5 w-full rounded-full opacity-80"
                        style={{ backgroundColor: stage.color || "#6366F1" }}
                      />
                      <span className="truncate text-[10px] font-medium text-ink-faint">
                        {stage.name}
                      </span>
                      <span className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink dark:text-white">
                        {count}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <p className="text-xs text-ink-muted">
                  Crie etapas e oportunidades para acompanhar o comercial.
                </p>
                <Link href="/app/crm" className="btn-secondary btn-sm h-8 shrink-0">
                  Abrir funil
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
