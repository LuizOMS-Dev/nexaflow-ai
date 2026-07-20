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
  PageHeader,
  Select,
  SelectAvatar,
  Spinner,
} from "@/components/ui";

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

type TaskFilter = "all" | "today" | "open" | "overdue" | "done";

const priorityLabel: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

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
    queryFn: () => api<TeamMember[]>("/team"),
    enabled: open,
  });

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

    return [...list].sort((a, b) => {
      // Atrasadas e urgentes primeiro; sem prazo por último
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [items, filter]);

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

  return (
    <div>
      <PageHeader
        title="Tarefas"
        actions={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova tarefa
          </button>
        }
      />

      {!isLoading && items.length > 0 ? (
        <div
          className="mb-4 flex flex-wrap gap-1.5"
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
                  ? "bg-ink text-white dark:bg-white dark:text-ink"
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
                  filter === c.id ? "opacity-80" : "text-ink-faint"
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
          description="Use Nova tarefa no topo para criar a primeira."
        />
      ) : !filtered.length ? (
        <EmptyState title="Nenhuma tarefa neste filtro" />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 dark:border-[#262b36] dark:bg-[#12151c] sm:flex-row sm:items-center sm:justify-between",
                  overdue && "border-rose-500/20 dark:border-rose-400/25"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink dark:text-gray-100">{task.title}</p>
                    <span className="badge-neutral">
                      {statusLabel[task.status] || task.status}
                    </span>
                    <span className="badge-brand">
                      {priorityLabel[task.priority] || task.priority}
                    </span>
                    {overdue ? (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                        Atrasada
                      </span>
                    ) : null}
                  </div>
                  {task.description ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">
                      {task.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {task.assignee?.name || "Sem responsável"}
                    {task.contact ? ` · ${task.contact.name}` : ""}
                    {task.dueAt
                      ? ` · ${overdue ? "Venceu" : "Até"} ${formatDate(task.dueAt)}`
                      : " · Sem prazo"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {task.status === "TODO" && (
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      onClick={() =>
                        updateMutation.mutate({ id: task.id, status: "IN_PROGRESS" })
                      }
                    >
                      Iniciar
                    </button>
                  )}
                  {task.status !== "DONE" && task.status !== "CANCELLED" && (
                    <button
                      type="button"
                      className="btn-secondary h-8 text-xs"
                      onClick={() => updateMutation.mutate({ id: task.id, status: "DONE" })}
                    >
                      Concluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QUICK — Nova tarefa */}
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
                    ...((teamQuery.data || [])
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
    </div>
  );
}
