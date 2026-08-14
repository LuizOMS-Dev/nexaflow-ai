"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, statusLabel } from "@/lib/utils";
import {
  ChoiceChip,
  DateInput,
  DialogFooter,
  EmptyState,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  Select,
  SelectAvatar,
  Spinner,
} from "@/components/ui";
import { TenantModule } from "@/components/tenant/tenant-module";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueAt?: string;
  assignee?: { id: string; name: string } | null;
  contact?: { id: string; name: string } | null;
};

type TeamMember = {
  id: string;
  role?: string;
  user?: { id: string; name: string; email?: string };
};

/** `/team` devolve objeto; aceitamos também array legado para o seletor de responsável. */
type TeamListPayload =
  | TeamMember[]
  | { members?: TeamMember[]; items?: TeamMember[] };

type TaskFilter = "all" | "today" | "open" | "overdue" | "done";

type TaskSectionId = "overdue" | "today" | "upcoming" | "done";

const priorityLabel: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

function priorityBadgeClass(priority: string) {
  switch (priority) {
    case "URGENT":
      return "badge-danger";
    case "HIGH":
      return "badge-warning";
    case "LOW":
      return "badge-neutral";
    default:
      return "badge-brand";
  }
}

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function endOfDay(d = new Date()) {
  return startOfDay(d) + 24 * 60 * 60 * 1000 - 1;
}

function isDone(t: Task) {
  return t.status === "DONE" || t.status === "CANCELLED";
}

function isOverdue(t: Task) {
  if (isDone(t) || !t.dueAt) return false;
  return new Date(t.dueAt).getTime() < startOfDay();
}

function isDueToday(t: Task) {
  if (isDone(t) || !t.dueAt) return false;
  const ts = new Date(t.dueAt).getTime();
  return ts >= startOfDay() && ts <= endOfDay();
}

function isUpcoming(t: Task) {
  return !isDone(t) && !isOverdue(t) && !isDueToday(t);
}

function sortByDue(a: Task, b: Task) {
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return ad - bd;
}

function sortDoneRecent(a: Task, b: Task) {
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : 0;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : 0;
  return bd - ad;
}

/** Ordem operacional: urgentes primeiro, depois o dia, o que vem e o histórico. */
const SECTIONS: {
  id: TaskSectionId;
  title: string;
  accent?: string;
}[] = [
  {
    id: "overdue",
    title: "Atrasadas",
    accent: "text-rose-700 dark:text-rose-300",
  },
  { id: "today", title: "Hoje" },
  { id: "upcoming", title: "Próximas" },
  { id: "done", title: "Concluídas" },
];

export default function TasksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    assigneeId: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ items: Task[] }>("/tasks"),
  });

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamListPayload>("/team"),
    enabled: open,
  });

  const teamMembers = useMemo(() => {
    const raw = teamQuery.data;
    if (!raw) return [] as TeamMember[];
    if (Array.isArray(raw)) return raw;
    return raw.members || raw.items || [];
  }, [teamQuery.data]);

  const items = data?.items || [];

  const counts = useMemo(() => {
    return {
      all: items.length,
      today: items.filter(isDueToday).length,
      open: items.filter((t) => !isDone(t)).length,
      overdue: items.filter(isOverdue).length,
      done: items.filter(isDone).length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "today") list = items.filter(isDueToday);
    else if (filter === "open") list = items.filter((t) => !isDone(t));
    else if (filter === "overdue") list = items.filter(isOverdue);
    else if (filter === "done") list = items.filter(isDone);
    return list;
  }, [items, filter]);

  const sections = useMemo(() => {
    const overdue = filtered.filter(isOverdue).sort(sortByDue);
    const today = filtered.filter(isDueToday).sort(sortByDue);
    const upcoming = filtered.filter(isUpcoming).sort(sortByDue);
    const done = filtered.filter(isDone).sort(sortDoneRecent);
    return { overdue, today, upcoming, done } as Record<TaskSectionId, Task[]>;
  }, [filtered]);

  const createMutation = useMutation({
    mutationFn: () => {
      const json: Record<string, unknown> = {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
      };
      if (form.dueDate) {
        json.dueAt = new Date(`${form.dueDate}T18:00:00.000Z`).toISOString();
      }
      if (form.assigneeId) json.assigneeId = form.assigneeId;
      return api("/tasks", { method: "POST", json });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      setForm({
        title: "",
        description: "",
        priority: "MEDIUM",
        dueDate: "",
        assigneeId: "",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/tasks/${id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const filterChips: { id: TaskFilter; label: string; count: number }[] = [
    { id: "open", label: "Pendentes", count: counts.open },
    { id: "today", label: "Hoje", count: counts.today },
    { id: "overdue", label: "Atrasadas", count: counts.overdue },
    { id: "done", label: "Concluídas", count: counts.done },
    { id: "all", label: "Todas", count: counts.all },
  ];

  /** Em filtros pontuais, só a seção relevante; em open/all, grupos com itens. */
  const visibleSectionIds = useMemo((): TaskSectionId[] => {
    if (filter === "overdue") return ["overdue"];
    if (filter === "today") return ["today"];
    if (filter === "done") return ["done"];
    if (filter === "open") return ["overdue", "today", "upcoming"];
    return ["overdue", "today", "upcoming", "done"];
  }, [filter]);

  const hasAnyInView = visibleSectionIds.some((id) => sections[id].length > 0);

  return (
    <TenantModule
      kind="execute"
      title="Tarefas"
      kicker="Execução"
      actions={
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova tarefa
        </button>
      }
    >
      {!isLoading && items.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filtrar tarefas"
        >
          {filterChips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                filter === c.id
                  ? "bg-rose-600 text-white dark:bg-rose-500"
                  : "bg-black/[0.04] text-ink-secondary hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.09]",
                c.id === "overdue" && c.count > 0 && filter !== c.id
                  ? "text-rose-700 dark:text-rose-300"
                  : null
              )}
            >
              {c.label}
              <span
                className={cn(
                  "tabular-nums text-[11px]",
                  filter === c.id ? "opacity-90" : "text-ink-faint"
                )}
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !items.length ? (
        <EmptyState
          title="Nenhuma tarefa"
          description="Crie a primeira com Nova tarefa."
          icon={<CheckSquare className="h-4 w-4" strokeWidth={1.75} />}
        />
      ) : !hasAnyInView ? (
        <EmptyState title="Nenhuma tarefa neste filtro" />
      ) : (
        <div className="nf-exec-board" role="list" aria-label="Quadro de execução">
          {SECTIONS.filter((s) => visibleSectionIds.includes(s.id)).map((meta) => {
            const list = sections[meta.id];
            return (
              <section
                key={meta.id}
                className={cn(
                  "nf-exec-col",
                  meta.id === "overdue" && "nf-exec-col--overdue"
                )}
                aria-label={meta.title}
              >
                <div className="nf-exec-col__head">
                  <span className={cn(meta.accent)}>{meta.title}</span>
                  <span className="tabular-nums text-ink-faint">{list.length}</span>
                </div>
                <div className="nf-exec-col__body">
                  {list.length === 0 ? (
                    <p className="px-1 py-6 text-center text-[12px] text-ink-faint">
                      Vazio
                    </p>
                  ) : (
                    list.map((task) => (
                      <div key={task.id} className="nf-exec-card">
                        <TaskRow
                          task={task}
                          overdue={meta.id === "overdue"}
                          busy={updateMutation.isPending}
                          onStart={() =>
                            updateMutation.mutate({ id: task.id, status: "IN_PROGRESS" })
                          }
                          onDone={() =>
                            updateMutation.mutate({ id: task.id, status: "DONE" })
                          }
                          compact
                        />
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova tarefa"
        icon={<CheckSquare className="h-4 w-4" strokeWidth={1.75} />}
        size="md"
        variant="contextual"
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
              form="nf-new-task-form"
              className="btn-primary h-9 px-4 sm:min-w-[7.5rem]"
              disabled={createMutation.isPending || !form.title.trim()}
            >
              {createMutation.isPending ? "Criando…" : "Criar tarefa"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-new-task-form" onSubmit={onCreate} className="space-y-4">
          <FormSection title="Tarefa" surface>
            <FormField label="Título" required>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Ex.: Retornar ligação"
              />
            </FormField>
            <FormField label="Detalhes">
              <textarea
                className="input min-h-[64px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>

          <FormSection title="Quando e quem" surface>
            <FieldGrid>
              <FormField label="Prazo">
                <DateInput
                  value={form.dueDate}
                  onChange={(dueDate) => setForm({ ...form, dueDate })}
                  aria-label="Prazo"
                />
              </FormField>
              <FormField label="Responsável">
                <Select
                  value={form.assigneeId}
                  onChange={(assigneeId) => setForm({ ...form, assigneeId })}
                  placeholder="Eu (padrão)"
                  options={[
                    { value: "", label: "Eu (padrão)" },
                    ...(teamMembers
                      .map((m) => {
                        const u = m.user;
                        if (!u?.id) return null;
                        return {
                          value: u.id,
                          label: u.name,
                          description: u.email,
                          leading: <SelectAvatar name={u.name} />,
                        };
                      })
                      .filter(Boolean) as {
                      value: string;
                      label: string;
                      description?: string;
                      leading?: ReactNode;
                    }[]),
                  ]}
                  aria-label="Responsável"
                />
              </FormField>
            </FieldGrid>
          </FormSection>

          <FormSection title="Prioridade" surface>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Prioridade">
              {(
                [
                  { value: "LOW", label: "Baixa" },
                  { value: "MEDIUM", label: "Média" },
                  { value: "HIGH", label: "Alta" },
                  { value: "URGENT", label: "Urgente" },
                ] as const
              ).map((p) => (
                <ChoiceChip
                  key={p.value}
                  selected={form.priority === p.value}
                  onClick={() => setForm({ ...form, priority: p.value })}
                >
                  {p.label}
                </ChoiceChip>
              ))}
            </div>
          </FormSection>
        </form>
      </Modal>
    </TenantModule>
  );
}

function TaskRow({
  task,
  overdue,
  busy,
  onStart,
  onDone,
  compact,
}: {
  task: Task;
  overdue: boolean;
  busy: boolean;
  onStart: () => void;
  onDone: () => void;
  compact?: boolean;
}) {
  const done = isDone(task);
  const dueText = task.dueAt
    ? overdue
      ? `Venceu ${formatDate(task.dueAt)}`
      : formatDate(task.dueAt)
    : "Sem prazo";

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-1.5">
          <p
            className={cn(
              "text-[13px] font-medium leading-snug text-ink dark:text-gray-100",
              done && "text-ink-muted line-through decoration-ink-faint/50"
            )}
          >
            {task.title}
          </p>
          <span className={priorityBadgeClass(task.priority)}>
            {priorityLabel[task.priority] || task.priority}
          </span>
        </div>
        <p className="text-[11px] text-ink-faint">
          <span
            className={cn(
              overdue && !done && "font-medium text-rose-700 dark:text-rose-300"
            )}
          >
            {dueText}
          </span>
          {" · "}
          {task.assignee?.name || "Sem responsável"}
          {task.contact ? ` · ${task.contact.name}` : ""}
        </p>
        {!done ? (
          <div className="flex flex-wrap gap-1">
            {task.status === "TODO" && (
              <button
                type="button"
                className="btn-secondary h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={onStart}
              >
                Iniciar
              </button>
            )}
            {task.status !== "DONE" && task.status !== "CANCELLED" && (
              <button
                type="button"
                className="btn-secondary h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={onDone}
              >
                Concluir
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4",
        overdue && "bg-rose-500/[0.03] dark:bg-rose-400/[0.04]"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={cn(
              "truncate text-[13.5px] font-medium text-ink dark:text-gray-100",
              done && "text-ink-muted line-through decoration-ink-faint/50"
            )}
          >
            {task.title}
          </p>
          <span className={priorityBadgeClass(task.priority)}>
            {priorityLabel[task.priority] || task.priority}
          </span>
          {overdue ? (
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
              Atrasada
            </span>
          ) : null}
        </div>

        {/* Meta legível: prazo · responsável · relação · status */}
        <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-faint">
          <div className="inline-flex items-center gap-1">
            <dt className="sr-only">Prazo</dt>
            <dd
              className={cn(
                overdue && !done
                  ? "font-medium text-rose-700 dark:text-rose-300"
                  : "text-ink-muted"
              )}
            >
              {dueText}
            </dd>
          </div>
          <span aria-hidden className="text-ink-faint/60">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dt className="sr-only">Responsável</dt>
            <dd>{task.assignee?.name || "Sem responsável"}</dd>
          </div>
          {task.contact ? (
            <>
              <span aria-hidden className="text-ink-faint/60">
                ·
              </span>
              <div className="inline-flex items-center gap-1">
                <dt className="sr-only">Relação</dt>
                <dd className="truncate max-w-[12rem]">{task.contact.name}</dd>
              </div>
            </>
          ) : null}
          <span aria-hidden className="text-ink-faint/60">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dt className="sr-only">Status</dt>
            <dd>
              <span className="badge-neutral">
                {statusLabel[task.status] || task.status}
              </span>
            </dd>
          </div>
        </dl>

        {task.description ? (
          <p className="line-clamp-1 text-[12.5px] text-ink-muted">{task.description}</p>
        ) : null}
      </div>

      {!done ? (
        <div className="flex shrink-0 gap-1.5 self-start sm:self-center">
          {task.status === "TODO" && (
            <button
              type="button"
              className="btn-secondary h-7 px-2.5 text-[11.5px]"
              disabled={busy}
              onClick={onStart}
            >
              Iniciar
            </button>
          )}
          {task.status !== "DONE" && task.status !== "CANCELLED" && (
            <button
              type="button"
              className="btn-secondary h-7 px-2.5 text-[11.5px]"
              disabled={busy}
              onClick={onDone}
            >
              Concluir
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
