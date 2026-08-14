"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronLeft,
  Filter,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Workflow,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  BuilderNode,
  DialogFooter,
  Dropdown,
  DropdownItem,
  EmptyState,
  FormField,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { TenantModule, TenantStatStrip } from "@/components/tenant/tenant-module";

/* ─── Tipos (contrato real da API) ─── */

type RunMini = {
  id: string;
  status: string;
  error?: string | null;
  createdAt: string;
};

type Automation = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  trigger: { type?: string; conditions?: unknown[] } | null;
  definition?: {
    nodes?: Array<{ id?: string; type?: string; data?: Record<string, unknown> }>;
    edges?: unknown[];
    actions?: Array<{ type?: string; title?: string; body?: string }>;
  } | null;
  version: number;
  lastRunAt?: string | null;
  _count?: { runs: number };
  runs?: RunMini[];
};

type RunStep = { name: string; status: string; detail?: string };

type AutomationRun = {
  id: string;
  status: string;
  error?: string | null;
  createdAt: string;
  result?: {
    message?: string;
    durationMs?: number;
    steps?: RunStep[];
    version?: number;
  } | null;
};

type StatusFilter = "all" | "ACTIVE" | "PAUSED" | "DRAFT";

/* ─── Labels humanos (códigos técnicos só em detalhe) ─── */

const TRIGGER_LABEL: Record<string, string> = {
  "contact.created": "Novo contato criado",
  "message.received": "Nova mensagem recebida",
  "conversation.closed": "Conversa encerrada",
  "conversation.created": "Nova conversa",
  "tag.added": "Etiqueta adicionada",
  "stage.changed": "Mudança de etapa no funil",
  "lead.status_changed": "Status comercial alterado",
};

const CONDITION_OPTIONS = [
  { value: "always", label: "Sempre — qualquer ocorrência do gatilho" },
  { value: "has_tag", label: "Somente se o contato tiver etiqueta" },
  { value: "first_message", label: "Somente na primeira mensagem" },
] as const;

/* ─── Helpers ─── */

function relativeTime(value?: string | null) {
  if (!value) return null;
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

function triggerLabel(type?: string | null) {
  if (!type) return "Gatilho não definido";
  return TRIGGER_LABEL[type] || type.replace(/[._]/g, " ");
}

function actionCount(item: Automation): number {
  const fromActions = item.definition?.actions;
  if (Array.isArray(fromActions) && fromActions.length) return fromActions.length;
  const nodes = item.definition?.nodes;
  if (!Array.isArray(nodes)) return 0;
  return nodes.filter((n) => {
    const t = (n.type || "").toLowerCase();
    return t === "action" || t === "then";
  }).length;
}

function hasCondition(item: Automation): boolean {
  const conds = item.trigger?.conditions;
  if (Array.isArray(conds) && conds.length > 0) return true;
  const nodes = item.definition?.nodes;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n) => (n.type || "").toLowerCase() === "condition");
}

function isFailedStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "failed" || s === "error" || s === "failure";
}

function isSuccessStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "success" || s === "ok" || s === "passed" || s === "completed";
}

function healthInfo(item: Automation): {
  label: string;
  tone: "ok" | "warn" | "neutral";
} {
  const runs = item.runs || [];
  const total = item._count?.runs ?? runs.length;
  if (total === 0 && !item.lastRunAt) {
    return { label: "Ainda não executado", tone: "neutral" };
  }
  const recentFails = runs.filter((r) => isFailedStatus(r.status) || r.error).length;
  if (recentFails > 0) {
    return {
      label:
        recentFails === 1
          ? "1 falha recente"
          : `${recentFails} falhas recentes`,
      tone: "warn",
    };
  }
  if (runs.length > 0 || item.lastRunAt) {
    return { label: "Sem erros recentes", tone: "ok" };
  }
  return { label: "Ainda não executado", tone: "neutral" };
}

function statusBadge(status: string) {
  if (status === "ACTIVE") return { text: "Ativo", className: "badge-success" };
  if (status === "PAUSED") return { text: "Pausado", className: "badge-warning" };
  if (status === "DRAFT") return { text: "Rascunho", className: "badge-neutral" };
  if (status === "ARCHIVED") return { text: "Arquivado", className: "badge-neutral" };
  return { text: status, className: "badge-neutral" };
}

function runStatusLabel(status: string, error?: string | null) {
  if (isFailedStatus(status) || error) return { text: "Falhou", className: "badge-warning" };
  if ((status || "").toLowerCase() === "partial") {
    return { text: "Parcial", className: "badge-warning" };
  }
  if (isSuccessStatus(status)) return { text: "Sucesso", className: "badge-success" };
  return { text: status || "—", className: "badge-neutral" };
}

function stepHumanName(name: string) {
  const map: Record<string, string> = {
    actions: "Ações",
    create_task: "Criar tarefa",
    send_message: "Enviar mensagem",
    set_lead_status: "Atualizar status comercial",
    add_tag: "Adicionar etiqueta",
    notify_internal: "Notificar equipe",
  };
  return map[name] || name.replace(/[._]/g, " ");
}

/* ─── Página ─── */

export default function AutomationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [runsId, setRunsId] = useState<string | null>(null);
  /** Execução selecionada no histórico → abre o debugger */
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerType: "contact.created",
    condition: "always" as (typeof CONDITION_OPTIONS)[number]["value"],
    actionMessage: "Olá! Obrigado por entrar em contato.",
    createFollowUp: true,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["automations"],
    queryFn: () => api<Automation[]>("/automations"),
  });

  const runsQuery = useQuery({
    queryKey: ["automation-runs", runsId],
    queryFn: () => api<AutomationRun[]>(`/automations/${runsId}/runs`),
    enabled: !!runsId,
  });

  useEffect(() => {
    setSelectedRunId(null);
  }, [runsId]);

  const createMutation = useMutation({
    mutationFn: () => {
      const conditions =
        form.condition === "always"
          ? []
          : form.condition === "has_tag"
            ? [{ field: "hasTag", op: "eq", value: true }]
            : [{ field: "firstMessage", op: "eq", value: true }];

      const nodes: Array<{
        id: string;
        type: string;
        data: Record<string, unknown>;
      }> = [
        { id: "1", type: "trigger", data: { event: form.triggerType } },
      ];

      if (form.condition !== "always") {
        nodes.push({
          id: "c1",
          type: "condition",
          data: {
            kind: form.condition,
            label:
              form.condition === "has_tag"
                ? "Contato com etiqueta"
                : "Primeira mensagem",
          },
        });
      }

      nodes.push({
        id: "2",
        type: "action",
        data: { action: "send_message", content: form.actionMessage },
      });

      if (form.createFollowUp) {
        nodes.push({
          id: "3",
          type: "action",
          data: { action: "create_task", title: "Follow-up automático" },
        });
      }

      const edges = nodes.slice(0, -1).map((n, i) => ({
        from: n.id,
        to: nodes[i + 1].id,
      }));

      const actions: Array<{ type: string; title?: string; body?: string }> = [
        {
          type: "notify_internal",
          title: form.name.trim() || "Fluxo",
          body: form.actionMessage,
        },
      ];
      if (form.createFollowUp) {
        actions.push({
          type: "create_task",
          title: "Follow-up automático",
          body: form.actionMessage,
        });
      }

      return api("/automations", {
        method: "POST",
        json: {
          name: form.name,
          description: form.description,
          status: "ACTIVE",
          trigger: {
            type: form.triggerType,
            ...(conditions.length ? { conditions } : {}),
          },
          definition: { nodes, edges, actions },
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      setOpen(false);
      setForm({
        name: "",
        description: "",
        triggerType: "contact.created",
        condition: "always",
        actionMessage: "Olá! Obrigado por entrar em contato.",
        createFollowUp: true,
      });
      toast({ kind: "success", title: "Fluxo criado" });
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "Não foi possível criar",
        description: e.message,
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/automations/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast({
        kind: "success",
        title: vars.status === "ACTIVE" ? "Fluxo ativado." : "Fluxo pausado.",
      });
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "Não foi possível atualizar",
        description: e.message,
      }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/automations/${id}/run-test`, { method: "POST", json: {} }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      qc.invalidateQueries({ queryKey: ["automation-runs", id] });
      setRunsId(id);
      setSelectedRunId(null);
      toast({
        kind: "success",
        title: "Teste concluído",
        description: "Sem envio a clientes.",
      });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Falha no teste", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/automations/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      if (runsId === id) {
        setRunsId(null);
        setSelectedRunId(null);
      }
      setDeleteTarget(null);
      toast({ kind: "success", title: "Fluxo excluído" });
    },
    onError: (e: Error) =>
      toast({
        kind: "error",
        title: "Não foi possível excluir",
        description: e.message,
      }),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const items = data || [];

  const metrics = useMemo(() => {
    const active = items.filter((i) => i.status === "ACTIVE").length;
    const paused = items.filter((i) => i.status === "PAUSED").length;
    const runsTotal = items.reduce((acc, i) => acc + (i._count?.runs ?? 0), 0);
    const withIssues = items.filter((i) => healthInfo(i).tone === "warn").length;
    return { active, paused, runsTotal, withIssues, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const runsTitle = useMemo(() => {
    if (!runsId) return "Execuções";
    const a = items.find((x) => x.id === runsId);
    return a ? `Execuções · ${a.name}` : "Execuções do fluxo";
  }, [runsId, items]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId || !runsQuery.data) return null;
    return runsQuery.data.find((r) => r.id === selectedRunId) ?? null;
  }, [selectedRunId, runsQuery.data]);

  const filterChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: metrics.total },
    { id: "ACTIVE", label: "Ativos", count: metrics.active },
    { id: "PAUSED", label: "Pausados", count: metrics.paused },
    {
      id: "DRAFT",
      label: "Rascunhos",
      count: items.filter((i) => i.status === "DRAFT").length,
    },
  ];

  return (
    <TenantModule
      kind="flow"
      title="Fluxos"
      kicker="Automação"
      actions={
        <button type="button" className="btn-primary h-9" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo fluxo
        </button>
      }
    >
      {!isLoading && !isError && items.length > 0 ? (
        <TenantStatStrip
          items={[
            {
              label: metrics.total ? `${metrics.total} no total` : "Ativos",
              value: metrics.active,
              tone: "ok",
            },
            {
              label: "Pausados",
              value: metrics.paused,
              tone: metrics.paused ? "warn" : "default",
            },
            {
              label: "Execuções",
              value: metrics.runsTotal,
            },
            {
              label: metrics.withIssues ? "Com falhas" : "Atenção",
              value: metrics.withIssues,
              tone: metrics.withIssues ? "danger" : "default",
            },
          ]}
        />
      ) : null}

      {/* Filtros */}
      {!isLoading && !isError && items.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filtrar fluxos por status"
        >
          {filterChips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === c.id}
              onClick={() => setStatusFilter(c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                statusFilter === c.id
                  ? "bg-ink text-white dark:bg-white dark:text-ink"
                  : "bg-black/[0.04] text-ink-secondary hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.09]"
              )}
            >
              {c.label}
              <span
                className={cn(
                  "tabular-nums text-[11px]",
                  statusFilter === c.id ? "opacity-80" : "text-ink-faint"
                )}
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando fluxos">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-4">
              <div className="skeleton h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton h-3 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Não foi possível carregar os fluxos"
          description={
            error instanceof Error ? error.message : "Tente novamente em instantes."
          }
          action={
            <button type="button" className="btn-primary" onClick={() => refetch()}>
              Tentar de novo
            </button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          icon={<Workflow className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum fluxo ainda"
          description="Crie o primeiro: quando um evento acontecer, o NexaFlow executa as ações automaticamente."
          action={
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo fluxo
            </button>
          }
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={<Filter className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum fluxo neste filtro"
          description="Ajuste o filtro ou crie um novo fluxo."
        />
      ) : (
        <ul className="space-y-2" aria-label="Seus fluxos">
          {filtered.map((item) => {
            const badge = statusBadge(item.status);
            const health = healthInfo(item);
            const runs = item._count?.runs ?? 0;
            const actions = actionCount(item);
            const last = relativeTime(item.lastRunAt);
            const thenLabel =
              actions === 0
                ? "Sem ações"
                : actions === 1
                  ? "1 ação"
                  : `${actions} ações`;

            return (
              <li key={item.id}>
                <article className="flex flex-col gap-3 rounded-2xl border border-cyan-500/15 bg-[var(--surface-raised)] px-4 py-3.5 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4 dark:border-cyan-400/15">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        item.status === "ACTIVE"
                          ? "bg-cyan-500/[0.12] text-cyan-700 dark:text-cyan-300"
                          : "bg-surface-subtle text-ink-secondary dark:bg-white/5"
                      )}
                    >
                      <Zap className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink dark:text-gray-100">
                          {item.name}
                        </h3>
                        <span className={badge.className}>{badge.text}</span>
                        {health.tone === "warn" && item.status === "ACTIVE" ? (
                          <span className="badge-warning">Atenção</span>
                        ) : null}
                      </div>
                      {item.description?.trim() ? (
                        <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-snug text-ink-muted">
                          {item.description.trim()}
                        </p>
                      ) : null}

                      {/* Cadeia visual QUANDO → COND → ENTÃO */}
                      <div className="nf-flow-chain mt-2" aria-label="Cadeia do fluxo">
                        <span className="nf-flow-chain__step">
                          {triggerLabel(item.trigger?.type)}
                        </span>
                        <span className="nf-flow-chain__arrow" aria-hidden>
                          →
                        </span>
                        {hasCondition(item) ? (
                          <>
                            <span className="nf-flow-chain__step">Condição</span>
                            <span className="nf-flow-chain__arrow" aria-hidden>
                              →
                            </span>
                          </>
                        ) : null}
                        <span className="nf-flow-chain__step">{thenLabel}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                        <span>
                          {runs === 0
                            ? "Nenhuma execução"
                            : `${runs} execução${runs === 1 ? "" : "ões"}`}
                        </span>
                        <span>
                          {last ? `Última ${last}` : "Nunca executado"}
                        </span>
                        <span
                          className={cn(
                            health.tone === "ok" &&
                              "text-emerald-600/90 dark:text-emerald-400/90",
                            health.tone === "warn" &&
                              "text-amber-700 dark:text-amber-300",
                            health.tone === "neutral" && "text-ink-faint"
                          )}
                        >
                          {health.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:self-center">
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      disabled={testMutation.isPending}
                      onClick={() => testMutation.mutate(item.id)}
                    >
                      <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {testMutation.isPending && testMutation.variables === item.id
                        ? "Testando…"
                        : "Testar"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      onClick={() => {
                        setSelectedRunId(null);
                        setRunsId(item.id);
                      }}
                    >
                      <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Execuções
                    </button>
                    <Dropdown
                      align="right"
                      trigger={
                        <button
                          type="button"
                          className="btn-ghost h-8 w-8 px-0"
                          aria-label={`Mais ações de ${item.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      }
                    >
                      <DropdownItem
                        onClick={() =>
                          toggleMutation.mutate({
                            id: item.id,
                            status:
                              item.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                          })
                        }
                      >
                        {item.status === "ACTIVE" ? (
                          <>
                            <Pause className="mr-1.5 inline h-3.5 w-3.5" /> Pausar
                          </>
                        ) : (
                          <>
                            <Play className="mr-1.5 inline h-3.5 w-3.5" /> Ativar
                          </>
                        )}
                      </DropdownItem>
                      <DropdownItem danger onClick={() => setDeleteTarget(item)}>
                        Excluir fluxo
                      </DropdownItem>
                    </Dropdown>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {/* Histórico de execuções → seleção abre debugger */}
      <Modal
        open={!!runsId}
        onClose={() => {
          setRunsId(null);
          setSelectedRunId(null);
        }}
        title={
          selectedRun
            ? `Debugger · ${selectedRun.id.slice(-6)}`
            : runsTitle
        }
        description={
          selectedRun
            ? "Passos da execução selecionada."
            : "Selecione uma execução para inspecionar os passos."
        }
        size="lg"
        variant="detail"
      >
        {selectedRun ? (
          <div className="space-y-4">
            <button
              type="button"
              className="btn-ghost h-8 -ml-1 gap-1 px-2 text-xs"
              onClick={() => setSelectedRunId(null)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Voltar ao histórico
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const st = runStatusLabel(selectedRun.status, selectedRun.error);
                  return <span className={st.className}>{st.text}</span>;
                })()}
                <span className="text-[12px] text-ink-faint">
                  {formatDate(selectedRun.createdAt)}
                  {selectedRun.result?.durationMs != null
                    ? ` · ${selectedRun.result.durationMs} ms`
                    : ""}
                </span>
              </div>
              {/* Código técnico só no detalhe */}
              <code className="text-[11px] text-ink-faint">{selectedRun.id}</code>
            </div>

            {selectedRun.error ? (
              <p className="rounded-lg bg-red-500/[0.06] px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
                {selectedRun.error}
              </p>
            ) : null}

            <ul className="space-y-0" aria-label="Passos da execução">
              {(selectedRun.result?.steps || []).map((step, i, arr) => {
                const ok =
                  step.status === "ok" ||
                  step.status === "success" ||
                  step.status === "passed";
                const skip = step.status === "skip";
                return (
                  <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                    {i < arr.length - 1 && (
                      <span
                        className="absolute left-[7px] top-4 bottom-0 w-px bg-line dark:bg-white/[0.08]"
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-[1] mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                        ok
                          ? "bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-400"
                          : skip
                            ? "bg-black/[0.06] text-ink-faint dark:bg-white/[0.08]"
                            : "bg-red-500/[0.15] text-red-600 dark:text-red-400"
                      )}
                    >
                      {ok ? "✓" : skip ? "–" : "!"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink dark:text-gray-100">
                        {stepHumanName(step.name)}
                      </p>
                      {step.detail ? (
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {step.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!selectedRun.result?.steps?.length && (
                <li className="text-sm text-ink-muted">
                  {selectedRun.result?.message ||
                    "Sem passos detalhados nesta execução."}
                </li>
              )}
            </ul>
          </div>
        ) : runsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !runsQuery.data?.length ? (
          <EmptyState
            title="Nenhuma execução ainda"
            description="Use Testar no fluxo para simular uma execução sem impacto em clientes."
          />
        ) : (
          <div className="max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto">
            {runsQuery.data.map((run) => {
              const st = runStatusLabel(run.status, run.error);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors",
                    "hover:border-violet-500/30 hover:bg-violet-500/[0.04] dark:border-white/[0.06] dark:hover:bg-violet-500/[0.06]"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink dark:text-white">
                        Execução · {run.id.slice(-6)}
                      </span>
                      <span className={st.className}>{st.text}</span>
                    </div>
                    {run.error ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-red-600 dark:text-red-400">
                        {run.error}
                      </p>
                    ) : run.result?.steps?.length ? (
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {run.result.steps.length} passo
                        {run.result.steps.length === 1 ? "" : "s"} · toque para
                        inspecionar
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        Toque para inspecionar
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {formatDate(run.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Builder: QUANDO → CONDIÇÃO → ENTÃO → Identificação */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo fluxo"
        icon={<Workflow className="h-4 w-4" strokeWidth={1.75} />}
        size="lg"
        variant="builder"
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="nf-new-flow-form"
              className="btn-primary h-9 px-4 sm:min-w-[8.5rem]"
              disabled={createMutation.isPending || form.name.trim().length < 2}
            >
              {createMutation.isPending ? "Criando…" : "Criar fluxo"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-new-flow-form" onSubmit={onCreate} className="space-y-0">
          <BuilderNode
            step={1}
            title="Quando"
            hint="O evento que inicia este fluxo."
            accent="trigger"
          >
            <Select
              id="flow-trigger"
              value={form.triggerType}
              onChange={(triggerType) => setForm({ ...form, triggerType })}
              options={[
                { value: "contact.created", label: "Novo contato criado" },
                { value: "message.received", label: "Nova mensagem recebida" },
                { value: "conversation.closed", label: "Conversa encerrada" },
                { value: "tag.added", label: "Etiqueta adicionada" },
                { value: "stage.changed", label: "Mudança de etapa no funil" },
              ]}
              aria-label="Quando executar"
            />
          </BuilderNode>

          <BuilderNode
            step={2}
            title="Condição"
            hint="Opcional — restrinja quando o fluxo deve rodar."
            accent="default"
          >
            <Select
              id="flow-condition"
              value={form.condition}
              onChange={(condition) =>
                setForm({
                  ...form,
                  condition: condition as typeof form.condition,
                })
              }
              options={CONDITION_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              aria-label="Condição do fluxo"
            />
          </BuilderNode>

          <BuilderNode
            step={3}
            title="Então"
            hint="Ações executadas em sequência."
            accent="action"
          >
            <FormField label="Enviar mensagem" htmlFor="flow-msg">
              <textarea
                id="flow-msg"
                className="input min-h-[80px]"
                value={form.actionMessage}
                onChange={(e) =>
                  setForm({ ...form, actionMessage: e.target.value })
                }
                placeholder="Olá! Obrigado por entrar em contato."
              />
            </FormField>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                form.createFollowUp
                  ? "border-emerald-500/30 bg-emerald-500/[0.06] dark:border-emerald-400/25"
                  : "border-dashed border-line bg-transparent dark:border-white/[0.08]"
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-line text-violet-600 focus:ring-violet-500/30"
                checked={form.createFollowUp}
                onChange={(e) =>
                  setForm({ ...form, createFollowUp: e.target.checked })
                }
              />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink dark:text-gray-100">
                  Criar tarefa de follow-up
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Agenda um lembrete automático para a equipe.
                </p>
              </div>
            </label>

            <div
              className="flex items-start gap-2.5 rounded-xl border border-dashed border-black/[0.08] px-3 py-2.5 dark:border-white/[0.1]"
              aria-hidden
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-[11px] font-bold text-ink-faint dark:bg-white/[0.06]">
                +
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink-muted dark:text-gray-400">
                  Adicionar ação
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Em breve: etiquetas, status comercial e mais.
                </p>
              </div>
            </div>
          </BuilderNode>

          <BuilderNode
            step={4}
            title="Identificação"
            hint="Como este fluxo aparece na lista."
            accent="meta"
            isLast
          >
            <FormField label="Nome do fluxo" htmlFor="flow-name" required>
              <input
                id="flow-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                placeholder="Ex.: Boas-vindas novo contato"
              />
            </FormField>
            <FormField label="Descrição" htmlFor="flow-desc">
              <input
                id="flow-desc"
                className="input"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="O que este fluxo faz (opcional)"
              />
            </FormField>
          </BuilderNode>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        title="Excluir fluxo?"
        description="Remove o fluxo e o histórico de execuções. Esta ação não pode ser desfeita."
        variant="danger"
        tone="danger"
        size="sm"
        preventClose={deleteMutation.isPending}
        footer={
          <DialogFooter>
            <button
              type="button"
              className="btn-secondary h-9 min-w-[5.5rem] px-3.5"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger h-9 min-w-[5.5rem] px-3.5"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </button>
          </DialogFooter>
        }
      >
        {deleteTarget ? (
          <p className="text-sm text-ink-secondary dark:text-gray-300">
            Confirma a exclusão de{" "}
            <strong className="text-ink dark:text-white">
              {deleteTarget.name}
            </strong>
            ?
          </p>
        ) : null}
      </Modal>
    </TenantModule>
  );
}
