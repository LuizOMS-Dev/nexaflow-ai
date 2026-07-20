"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  Workflow,
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
  PageHeader,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";

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
  trigger: { type?: string } | null;
  definition?: {
    nodes?: Array<{ id?: string; type?: string; data?: Record<string, unknown> }>;
    edges?: unknown[];
  } | null;
  version: number;
  lastRunAt?: string | null;
  _count?: { runs: number };
  runs?: RunMini[];
};

const TRIGGER_LABEL: Record<string, string> = {
  "contact.created": "Novo contato criado",
  "message.received": "Nova mensagem recebida",
  "conversation.closed": "Conversa encerrada",
  "tag.added": "Etiqueta adicionada",
  "stage.changed": "Mudança de etapa no funil",
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

function stepCount(item: Automation): number {
  const nodes = item.definition?.nodes;
  if (!Array.isArray(nodes)) return 0;
  // exclui nó de trigger se quiser só ações — conta todos os nós do fluxo
  return nodes.length;
}

function stepSummary(item: Automation): string | null {
  const nodes = item.definition?.nodes;
  if (!Array.isArray(nodes) || !nodes.length) return null;
  const labels = nodes.map((n) => {
    const t = (n.type || "").toLowerCase();
    const action = String(n.data?.action || n.data?.event || "");
    if (t === "trigger") return "Gatilho";
    if (action === "send_message") return "Mensagem";
    if (action === "create_task") return "Criar tarefa";
    if (action.includes("contact")) return "Atualizar contato";
    if (t === "condition") return "Condição";
    if (t === "action") return "Ação";
    return n.type || "Etapa";
  });
  return labels.join(" → ");
}

function isFailedStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "failed" || s === "error" || s === "failure";
}

function healthInfo(item: Automation): { label: string; tone: "ok" | "warn" | "neutral" } {
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

export default function AutomationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [runsId, setRunsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerType: "contact.created",
    actionMessage: "Olá! Obrigado por entrar em contato.",
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

  const createMutation = useMutation({
    mutationFn: () =>
      api("/automations", {
        method: "POST",
        json: {
          name: form.name,
          description: form.description,
          status: "ACTIVE",
          trigger: { type: form.triggerType },
          definition: {
            nodes: [
              { id: "1", type: "trigger", data: { event: form.triggerType } },
              {
                id: "2",
                type: "action",
                data: { action: "send_message", content: form.actionMessage },
              },
              {
                id: "3",
                type: "action",
                data: { action: "create_task", title: "Follow-up automático" },
              },
            ],
            edges: [
              { from: "1", to: "2" },
              { from: "2", to: "3" },
            ],
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      setOpen(false);
      setForm({
        name: "",
        description: "",
        triggerType: "contact.created",
        actionMessage: "Olá! Obrigado por entrar em contato.",
      });
      toast({ kind: "success", title: "Fluxo criado" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível criar", description: e.message }),
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
      toast({ kind: "error", title: "Não foi possível atualizar", description: e.message }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/automations/${id}/run-test`, { method: "POST", json: {} }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      qc.invalidateQueries({ queryKey: ["automation-runs", id] });
      setRunsId(id);
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
      if (runsId === id) setRunsId(null);
      setDeleteTarget(null);
      toast({ kind: "success", title: "Fluxo excluído" });
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível excluir", description: e.message }),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const items = data || [];
  const runsTitle = useMemo(() => {
    if (!runsId) return "Execuções";
    const a = items.find((x) => x.id === runsId);
    return a ? `Execuções · ${a.name}` : "Execuções do fluxo";
  }, [runsId, items]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Fluxos"
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo fluxo
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex gap-3 p-4">
              <div className="skeleton h-9 w-9 rounded-lg" />
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
          description={error instanceof Error ? error.message : "Tente novamente."}
          action={
            <button type="button" className="btn-primary" onClick={() => refetch()}>
              Tentar de novo
            </button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          icon={<Workflow className="h-5 w-5" strokeWidth={1.5} />}
          title="Nenhum fluxo criado"
          description="Use Novo fluxo no topo para criar o primeiro."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const badge = statusBadge(item.status);
            const health = healthInfo(item);
            const runs = item._count?.runs ?? 0;
            const steps = stepCount(item);
            const summary = stepSummary(item);
            const last = relativeTime(item.lastRunAt);
            const healthBadge =
              health.tone === "warn"
                ? { text: "Atenção", className: "badge-warning" }
                : null;

            return (
              <article
                key={item.id}
                className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-secondary dark:bg-white/5">
                    <Workflow className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink dark:text-gray-100">
                        {item.name}
                      </h3>
                      <span className={badge.className}>{badge.text}</span>
                      {healthBadge && item.status === "ACTIVE" ? (
                        <span className={healthBadge.className}>{healthBadge.text}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-ink-muted">
                      {item.description?.trim() || "Sem descrição"}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                      <span className="font-medium text-ink-secondary dark:text-gray-400">
                        {triggerLabel(item.trigger?.type)}
                      </span>
                      {steps > 0 && (
                        <span title={summary || undefined}>
                          {steps} etapa{steps === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>
                        {runs === 0
                          ? "Nenhuma execução"
                          : `${runs} execução${runs === 1 ? "" : "ões"}`}
                      </span>
                      <span>
                        {last
                          ? `Última execução ${last}`
                          : "Nunca executado"}
                      </span>
                      <span
                        className={cn(
                          health.tone === "ok" && "text-emerald-600/90 dark:text-emerald-400/90",
                          health.tone === "warn" && "text-amber-700 dark:text-amber-300",
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
                    onClick={() => setRunsId(item.id)}
                  >
                    Ver execuções
                  </button>
                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 px-0"
                        aria-label="Mais ações"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    <DropdownItem
                      onClick={() =>
                        toggleMutation.mutate({
                          id: item.id,
                          status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
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
                      <Trash2 className="mr-1.5 inline h-3.5 w-3.5" /> Excluir fluxo
                    </DropdownItem>
                  </Dropdown>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Large list · histórico de execuções */}
      <Modal
        open={!!runsId}
        onClose={() => setRunsId(null)}
        title={runsTitle}
        description="Histórico de execuções."
        size="lg"
        variant="detail"
      >
        {runsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !runsQuery.data?.length ? (
          <p className="text-sm text-ink-muted">
            Nenhuma execução ainda.
          </p>
        ) : (
          <div className="max-h-[min(28rem,60vh)] space-y-3 overflow-y-auto">
            {runsQuery.data.map((run) => {
              const failed = isFailedStatus(run.status) || Boolean(run.error);
              return (
                <div
                  key={run.id}
                  className="rounded-xl border border-line p-3 dark:border-white/[0.06]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink dark:text-white">
                        Execução · {run.id.slice(-6)}
                      </span>
                      <span
                        className={cn(
                          failed ? "badge-warning" : "badge-success"
                        )}
                      >
                        {failed ? "Falhou" : "Sucesso"}
                      </span>
                    </div>
                    <span className="text-ink-faint">
                      {formatDate(run.createdAt)}
                      {run.result?.durationMs != null
                        ? ` · ${run.result.durationMs}ms`
                        : ""}
                    </span>
                  </div>
                  {run.error ? (
                    <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                      {run.error}
                    </p>
                  ) : null}

                  {/* Debugger visual */}
                  <ul className="mt-3 space-y-0">
                    {(run.result?.steps || []).map((step, i, arr) => {
                      const ok =
                        step.status === "ok" ||
                        step.status === "success" ||
                        step.status === "passed";
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
                                : "bg-red-500/[0.15] text-red-600 dark:text-red-400"
                            )}
                          >
                            {ok ? "✓" : "!"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-ink dark:text-gray-100">
                              {step.name}
                            </p>
                            {step.detail ? (
                              <p className="mt-0.5 text-[11px] text-ink-faint">{step.detail}</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                    {!run.result?.steps?.length && (
                      <li className="text-xs text-ink-faint">
                        {run.result?.message || "Sem passos detalhados neste run."}
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

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
                { value: "stage.changed", label: "Mudança de etapa" },
              ]}
              aria-label="Quando executar"
            />
          </BuilderNode>

          <BuilderNode
            step={2}
            title="Então"
            accent="action"
          >
            <FormField label="Enviar mensagem" htmlFor="flow-msg">
              <textarea
                id="flow-msg"
                className="input min-h-[80px]"
                value={form.actionMessage}
                onChange={(e) => setForm({ ...form, actionMessage: e.target.value })}
                placeholder="Olá! Obrigado por entrar em contato."
              />
            </FormField>
            <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2.5 dark:border-emerald-400/20">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/[0.15] text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                +
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink dark:text-gray-100">
                  Criar tarefa de follow-up
                </p>

              </div>
            </div>
          </BuilderNode>

          <BuilderNode
            step={3}
            title="Identificação"
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
                placeholder="Ex.: Boas-vindas novo contato"
              />
            </FormField>
            <FormField label="Descrição" htmlFor="flow-desc">
              <input
                id="flow-desc"
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
        description="Esta ação remove o fluxo e o histórico de execuções. Não pode ser desfeita."
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
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </button>
          </DialogFooter>
        }
      >
        {deleteTarget ? (
          <p className="text-sm text-ink-secondary dark:text-gray-300">
            Confirma a exclusão de{" "}
            <strong className="text-ink dark:text-white">{deleteTarget.name}</strong>?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
