"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ChevronLeft, ChevronRight, Inbox, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency, leadPriorityLabel } from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  EntitySummary,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  PageHeader,
  Select,
  SelectAvatar,
  Spinner,
} from "@/components/ui";

type ContactMini = {
  id: string;
  name: string;
  company?: string | null;
  score?: number;
  priority?: string | null;
  nextAction?: string | null;
};

type Opportunity = {
  id: string;
  title: string;
  value: string | number;
  probability: number;
  contact: ContactMini;
  product?: string | null;
  notes?: string | null;
};

type Stage = {
  id: string;
  name: string;
  color: string;
  opportunities: Opportunity[];
};

type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

type Contact = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
};

function stageTotal(stage: Stage) {
  return stage.opportunities.reduce((sum, o) => sum + Number(o.value || 0), 0);
}

export default function CrmPage() {
  const qc = useQueryClient();
  const [pipelineId, setPipelineId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    contactId: "",
    stageId: "",
    value: "0",
  });

  const trackRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<number | null>(null);
  const measureRafRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [boardFade, setBoardFade] = useState(false);

  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Array<{ id: string; name: string; isDefault?: boolean }>>("/pipelines"),
  });

  /** Lista única por id (evita opção repetida se a API devolver duplicata acidental) */
  const pipelineOptions = useMemo(() => {
    const list = pipelines.data || [];
    const seen = new Set<string>();
    const unique = list.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    // Labels: se nomes iguais, diferencia (2), (3)…
    const nameCount = new Map<string, number>();
    return unique.map((p) => {
      const base = p.name.trim() || "Funil";
      const n = (nameCount.get(base.toLowerCase()) || 0) + 1;
      nameCount.set(base.toLowerCase(), n);
      const label = n > 1 ? `${base} (${n})` : base;
      return { id: p.id, label, isDefault: p.isDefault };
    });
  }, [pipelines.data]);

  useEffect(() => {
    if (!pipelineId && pipelineOptions[0]) setPipelineId(pipelineOptions[0].id);
  }, [pipelineOptions, pipelineId]);

  const board = useQuery({
    queryKey: ["board", pipelineId],
    enabled: !!pipelineId,
    queryFn: () => api<Pipeline>(`/pipelines/${pipelineId}/board`),
  });

  const contacts = useQuery({
    queryKey: ["contacts-mini"],
    queryFn: () => api<{ items: Contact[] }>("/contacts?limit=100"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api("/opportunities", {
        method: "POST",
        json: {
          pipelineId,
          stageId: form.stageId || board.data?.stages[0]?.id,
          contactId: form.contactId,
          title: form.title,
          value: Number(form.value || 0),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", pipelineId] });
      setOpen(false);
      setForm({ title: "", contactId: "", stageId: "", value: "0" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      api(`/opportunities/${id}`, { method: "PATCH", json: { stageId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", pipelineId] }),
  });

  const updateOverflow = useCallback(() => {
    const el = trackRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    // subpixel / padding: tolerância 2px
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = el.scrollLeft;
    const atStart = left <= 2;
    const atEnd = left >= max - 2;
    setCanScrollLeft(max > 2 && !atStart);
    setCanScrollRight(max > 2 && !atEnd);
  }, []);

  /** Remede após layout (sidebar, resize, smooth scroll) */
  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current != null) cancelAnimationFrame(measureRafRef.current);
    measureRafRef.current = requestAnimationFrame(() => {
      updateOverflow();
      // segunda passagem após reflow / smooth scroll
      window.setTimeout(updateOverflow, 80);
      window.setTimeout(updateOverflow, 320);
    });
  }, [updateOverflow]);

  useEffect(() => {
    const el = trackRef.current;
    const shell = shellRef.current;
    if (!el) return;

    const onScroll = () => updateOverflow();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScroll as EventListener);

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(el);
    if (shell) ro.observe(shell);
    // observa body do shell da app (sidebar reflow)
    const appShell = document.querySelector(".nf-app-shell");
    if (appShell) ro.observe(appShell);

    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScroll as EventListener);
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (measureRafRef.current != null) cancelAnimationFrame(measureRafRef.current);
    };
  }, [updateOverflow, scheduleMeasure, board.data?.stages?.length, pipelineId]);

  useEffect(() => {
    // troca de funil: volta ao início + fade (sem destruir o track com key)
    setBoardFade(true);
    const el = trackRef.current;
    if (el) el.scrollLeft = 0;
    scheduleMeasure();
    const t = window.setTimeout(() => setBoardFade(false), 200);
    return () => window.clearTimeout(t);
  }, [pipelineId, scheduleMeasure]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current != null) {
      window.clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const handleBoardDragOver = useCallback(
    (e: DragEvent) => {
      if (!draggingId) return;
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edge = 64;
      const x = e.clientX;
      let dir = 0;
      if (x < rect.left + edge) dir = -1;
      else if (x > rect.right - edge) dir = 1;

      if (dir === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollRef.current != null) return;
      // auto-scroll suave — não pula etapas de uma vez
      autoScrollRef.current = window.setInterval(() => {
        const track = trackRef.current;
        if (!track) return;
        track.scrollLeft += dir * 10;
        updateOverflow();
      }, 20);
    },
    [draggingId, stopAutoScroll, updateOverflow]
  );

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  /** Avança ~1–2 colunas completas (largura real da coluna + gap) */
  function scrollByPage(dir: -1 | 1) {
    const el = trackRef.current;
    if (!el) return;
    const col = el.querySelector(".crm-kanban-column") as HTMLElement | null;
    const styles = getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap || "12") || 12;
    const colW = col?.offsetWidth || 272;
    // desktop largo: 2 colunas; tablet/mobile: 1
    const steps = el.clientWidth >= 1100 ? 2 : 1;
    const amount = (colW + gap) * steps;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
    scheduleMeasure();
  }

  function onBoardKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight" && canScrollRight) {
      e.preventDefault();
      scrollByPage(1);
    } else if (e.key === "ArrowLeft" && canScrollLeft) {
      e.preventDefault();
      scrollByPage(-1);
    }
  }

  function onDragStart(e: DragEvent, oppId: string) {
    e.dataTransfer.setData("text/opportunity-id", oppId);
    e.dataTransfer.setData("text/plain", oppId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(oppId);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropStageId(null);
    stopAutoScroll();
  }

  function onColumnDragOver(e: DragEvent, stageId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStageId(stageId);
    handleBoardDragOver(e);
  }

  function onColumnDrop(e: DragEvent, stageId: string) {
    e.preventDefault();
    const id =
      e.dataTransfer.getData("text/opportunity-id") || e.dataTransfer.getData("text/plain");
    setDropStageId(null);
    setDraggingId(null);
    stopAutoScroll();
    if (!id) return;
    // não chama API se já está na mesma etapa
    const current = board.data?.stages.find((s) => s.opportunities.some((o) => o.id === id));
    if (current?.id === stageId) return;
    moveMutation.mutate({ id, stageId });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const stageCount = board.data?.stages.length ?? 0;

  const headerActions = useMemo(
    () => (
      <>
        <Select
          className="w-full min-w-0 sm:w-auto sm:min-w-[180px]"
          size="sm"
          triggerClassName="h-9"
          value={pipelineId}
          onChange={setPipelineId}
          options={pipelineOptions.map((p) => ({
            value: p.id,
            label: `${p.label}${p.isDefault ? " · padrão" : ""}`,
          }))}
          aria-label="Selecionar funil"
        />
        <button
          type="button"
          className="btn-primary h-9 w-full sm:w-auto"
          onClick={() => setOpen(true)}
          disabled={!pipelineId}
        >
          <Plus className="h-3.5 w-3.5" /> Nova oportunidade
        </button>
      </>
    ),
    [pipelineId, pipelineOptions]
  );

  return (
    <div className="crm-page">
      <div className="crm-page-header">
        <PageHeader
          title="Funil de vendas"
          actions={headerActions}
        />
      </div>

      {board.isLoading || pipelines.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Spinner />
        </div>
      ) : !board.data ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="Nenhum funil encontrado"
          />
        </div>
      ) : (
        <div
          ref={shellRef}
          className="crm-board-shell"
          aria-label="Quadro do funil"
          onKeyDown={onBoardKeyDown}
        >
          {/* Seta esquerda: só com scrollLeft > 0 */}
          <div
            className="crm-board-edge crm-board-edge--left"
            data-visible={canScrollLeft ? "true" : "false"}
            aria-hidden={!canScrollLeft}
          >
            <button
              type="button"
              className="crm-board-edge-btn"
              aria-label="Ver etapas anteriores"
              title="Ver etapas anteriores"
              tabIndex={canScrollLeft ? 0 : -1}
              disabled={!canScrollLeft}
              onClick={() => scrollByPage(-1)}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          {/* Seta direita: só com conteúdo à direita */}
          <div
            className="crm-board-edge crm-board-edge--right"
            data-visible={canScrollRight ? "true" : "false"}
            aria-hidden={!canScrollRight}
          >
            <button
              type="button"
              className="crm-board-edge-btn"
              aria-label="Ver próximas etapas"
              title="Ver próximas etapas"
              tabIndex={canScrollRight ? 0 : -1}
              disabled={!canScrollRight}
              onClick={() => scrollByPage(1)}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div
            ref={trackRef}
            className={cn("crm-kanban-track", boardFade && "crm-board-crossfade")}
            role="list"
            tabIndex={0}
            aria-label={`${stageCount} etapas do funil. Use setas ou teclado para navegar.`}
            onDragOver={handleBoardDragOver}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) stopAutoScroll();
            }}
            onDrop={() => stopAutoScroll()}
          >
            {board.data.stages.map((stage) => {
              const total = stageTotal(stage);
              const count = stage.opportunities.length;
              return (
                <section
                  key={stage.id}
                  role="listitem"
                  className="crm-kanban-column"
                  data-drop-active={dropStageId === stage.id ? "true" : "false"}
                  aria-label={`${stage.name}, ${count} oportunidades`}
                  onDragOver={(e) => onColumnDragOver(e, stage.id)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropStageId((cur) => (cur === stage.id ? null : cur));
                    }
                  }}
                  onDrop={(e) => onColumnDrop(e, stage.id)}
                >
                  <div
                    className="crm-kanban-column-accent"
                    style={{ background: stage.color || "#6366f1" }}
                    aria-hidden
                  />
                  <header className="crm-kanban-column-header">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: stage.color || "#6366f1" }}
                          aria-hidden
                        />
                        <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink dark:text-gray-100">
                          {stage.name}
                        </h3>
                      </div>
                      <span className="badge-neutral shrink-0 tabular-nums">{count}</span>
                    </div>
                    {total > 0 ? (
                      <p className="pl-4 text-[11px] font-medium tabular-nums text-ink-muted">
                        {formatCurrency(total)}
                      </p>
                    ) : null}
                  </header>

                  <div className="crm-kanban-cards">
                    {count === 0 ? (
                      <div className="crm-column-empty">
                        <Inbox
                          className="h-3.5 w-3.5 text-ink-faint opacity-60"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        <p className="text-[12px] font-medium text-ink-muted dark:text-gray-400">
                          Nenhuma oportunidade
                        </p>
                        <p className="max-w-[12rem] text-[10.5px] leading-relaxed text-ink-faint">
                          Arraste uma oportunidade para esta etapa.
                        </p>
                      </div>
                    ) : (
                      stage.opportunities.map((opp) => {
                        const priority = opp.contact?.priority;
                        const score = opp.contact?.score;
                        const nextAction = opp.contact?.nextAction;
                        const company = opp.contact?.company;
                        return (
                          <article
                            key={opp.id}
                            className="crm-opp-card group"
                            draggable
                            data-dragging={draggingId === opp.id ? "true" : "false"}
                            onDragStart={(e) => onDragStart(e, opp.id)}
                            onDragEnd={onDragEnd}
                            aria-grabbed={draggingId === opp.id}
                          >
                            <p className="text-[13px] font-medium leading-snug text-ink dark:text-gray-100">
                              {opp.contact?.name || "Contato"}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-muted">
                              {opp.title}
                            </p>
                            {company ? (
                              <p className="mt-1 truncate text-[11px] text-ink-faint">{company}</p>
                            ) : null}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                                {formatCurrency(opp.value)}
                              </span>
                              {typeof score === "number" && score > 0 ? (
                                <span className="text-[10px] tabular-nums text-ink-faint">
                                  Score {score}
                                </span>
                              ) : opp.probability > 0 ? (
                                <span className="text-[10px] tabular-nums text-ink-faint">
                                  {opp.probability}%
                                </span>
                              ) : null}
                            </div>

                            {nextAction ? (
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-secondary dark:text-gray-400">
                                <span className="text-ink-faint">Próxima ação: </span>
                                {nextAction}
                              </p>
                            ) : null}

                            {priority && priority !== "NORMAL" ? (
                              <span className="mt-1.5 inline-flex rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary dark:bg-white/[0.06] dark:text-gray-300">
                                {leadPriorityLabel[priority] || priority}
                              </span>
                            ) : null}

                            {/* Acessibilidade / fallback sem arrastar */}
                            <div
                              className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <Select
                                size="sm"
                                value=""
                                placeholder="Mover para…"
                                onChange={(stageId) => {
                                  if (stageId) moveMutation.mutate({ id: opp.id, stageId });
                                }}
                                options={[
                                  { value: "", label: "Mover para…" },
                                  ...board.data!.stages
                                    .filter((s) => s.id !== stage.id)
                                    .map((s) => ({ value: s.id, label: s.name })),
                                ]}
                                aria-label={`Mover ${opp.title} para outra etapa`}
                              />
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova oportunidade"
        size="lg"
        variant="contextual"
        initialFocus="panel"
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
              form="nf-new-opp-form"
              className="btn-primary h-9 px-4 sm:min-w-[10.5rem]"
              disabled={
                createMutation.isPending ||
                !form.title.trim() ||
                !form.contactId
              }
            >
              {createMutation.isPending ? "Criando…" : "Criar oportunidade"}
            </button>
          </DialogFooter>
        }
      >
        <form id="nf-new-opp-form" onSubmit={onCreate} className="space-y-4">
          {form.contactId ? (
            <EntitySummary
              title={
                contacts.data?.items.find((c) => c.id === form.contactId)?.name ||
                "Contato"
              }
              subtitle={
                contacts.data?.items.find((c) => c.id === form.contactId)?.company ||
                undefined
              }
            />
          ) : null}

          <FormSection title="Oportunidade" surface>
            <FormField label="Título" required>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Ex.: Plano Profissional"
              />
            </FormField>
            <FormField label="Contato" required>
              <Select
                value={form.contactId}
                onChange={(contactId) => setForm({ ...form, contactId })}
                required
                placeholder="Selecionar contato"
                options={[
                  { value: "", label: "Selecionar contato…" },
                  ...(contacts.data?.items.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description:
                      [c.phone, c.company].filter(Boolean).join(" · ") ||
                      c.email ||
                      undefined,
                    leading: <SelectAvatar name={c.name} />,
                  })) || []),
                ]}
                aria-label="Contato"
              />
            </FormField>
          </FormSection>

          <FormSection title="Funil" surface>
            {pipelineOptions.length > 1 ? (
              <FormField label="Funil">
                <Select
                  value={pipelineId}
                  onChange={(id) => {
                    setPipelineId(id);
                    setForm((f) => ({ ...f, stageId: "" }));
                  }}
                  options={pipelineOptions.map((p) => ({
                    value: p.id,
                    label: p.label,
                  }))}
                  aria-label="Funil"
                />
              </FormField>
            ) : null}
            <FieldGrid>
              <FormField label="Etapa">
                <Select
                  value={form.stageId}
                  onChange={(stageId) => setForm({ ...form, stageId })}
                  placeholder="Primeira etapa"
                  options={[
                    {
                      value: "",
                      label: board.data?.stages[0]?.name
                        ? `${board.data.stages[0].name} (padrão)`
                        : "Primeira etapa",
                    },
                    ...(board.data?.stages.map((s) => ({
                      value: s.id,
                      label: s.name,
                    })) || []),
                  ]}
                  aria-label="Etapa"
                />
              </FormField>
              <FormField label="Valor">
                <MoneyInput
                  value={form.value}
                  onChange={(value) => setForm({ ...form, value })}
                  placeholder="0,00"
                />
              </FormField>
            </FieldGrid>
          </FormSection>
        </form>
      </Modal>
    </div>
  );
}
