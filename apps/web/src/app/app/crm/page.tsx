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
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  Inbox,
  Plus,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  cn,
  commercialStatusLabel,
  formatCurrency,
  leadPriorityLabel,
} from "@/lib/utils";
import {
  DialogFooter,
  EmptyState,
  EntitySummary,
  FieldGrid,
  FormField,
  FormSection,
  Modal,
  MoneyInput,
  Select,
  SelectAvatar,
  Spinner,
} from "@/components/ui";
import { TenantModule } from "@/components/tenant/tenant-module";

/* -------------------------------------------------------------------------- */
/* Types — espelham o payload real de GET /pipelines/:id/board                */
/* -------------------------------------------------------------------------- */

type ContactMini = {
  id: string;
  name: string;
  company?: string | null;
  score?: number;
  priority?: string | null;
  nextAction?: string | null;
  commercialStatus?: string | null;
  jobTitle?: string | null;
};

type Opportunity = {
  id: string;
  title: string;
  value: string | number;
  probability: number;
  status?: string;
  product?: string | null;
  notes?: string | null;
  lastActivityAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  contact: ContactMini;
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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function stageTotal(stage: Stage) {
  return stage.opportunities.reduce((sum, o) => sum + Number(o.value || 0), 0);
}

/** Tempo relativo curto em PT-BR (ex.: "há 3d", "agora"). */
function relativeTime(value?: string | null): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return "agora";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} mês${months > 1 ? "es" : ""}`;
  return `há ${Math.floor(months / 12)}a`;
}

/**
 * Proxy de “tempo na etapa”: lastActivityAt (atualizado no move de stage)
 * ou updatedAt / createdAt como fallback.
 */
function timeInStageLabel(opp: Opportunity): string | null {
  const ts = opp.lastActivityAt || opp.updatedAt || opp.createdAt;
  const rel = relativeTime(ts);
  if (!rel) return null;
  return rel === "agora" ? "entrou agora" : `${rel} na etapa`;
}

function priorityTone(priority?: string | null): "danger" | "warning" | null {
  if (priority === "URGENTE") return "danger";
  if (priority === "ALTA") return "warning";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

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
  const [contactPickerInput, setContactPickerInput] = useState("");
  const [contactPickerQ, setContactPickerQ] = useState("");

  const trackRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<number | null>(null);
  const autoScrollDirRef = useRef<number>(0);
  const measureRafRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [boardFade, setBoardFade] = useState(false);

  const pipelines = useQuery({
    queryKey: ["pipelines"],
    queryFn: () =>
      api<Array<{ id: string; name: string; isDefault?: boolean }>>("/pipelines"),
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

  useEffect(() => {
    const t = window.setTimeout(() => setContactPickerQ(contactPickerInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [contactPickerInput]);

  /** Contatos 3.0 — lista da API + fallback dos já presentes no board. */
  const contactsQuery = useQuery({
    queryKey: ["contacts", "crm-picker", contactPickerQ],
    queryFn: () => {
      const qs = new URLSearchParams({
        archived: "0",
        limit: "50",
        sort: "name",
        order: "asc",
      });
      if (contactPickerQ) qs.set("search", contactPickerQ);
      return api<{ items: Contact[] }>(`/contacts?${qs.toString()}`);
    },
  });

  const contactOptions = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contactsQuery.data?.items || []) {
      if (c?.id) map.set(c.id, c);
    }
    for (const stage of board.data?.stages || []) {
      for (const opp of stage.opportunities || []) {
        const c = opp.contact;
        if (c?.id && !map.has(c.id)) {
          map.set(c.id, {
            id: c.id,
            name: c.name,
            company: c.company ?? null,
            phone: null,
            email: null,
          });
        }
      }
    }
    return [...map.values()];
  }, [board.data, contactsQuery.data]);

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

  /* ---- Board metrics (comercial) ----------------------------------------- */

  const boardStats = useMemo(() => {
    const stages = board.data?.stages ?? [];
    let count = 0;
    let value = 0;
    for (const s of stages) {
      count += s.opportunities.length;
      value += stageTotal(s);
    }
    return { count, value, stages: stages.length };
  }, [board.data?.stages]);

  /* ---- Scroll / overflow ------------------------------------------------- */

  const updateOverflow = useCallback(() => {
    const el = trackRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = el.scrollLeft;
    const atStart = left <= 2;
    const atEnd = left >= max - 2;
    setCanScrollLeft(max > 2 && !atStart);
    setCanScrollRight(max > 2 && !atEnd);
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current != null) cancelAnimationFrame(measureRafRef.current);
    measureRafRef.current = requestAnimationFrame(() => {
      updateOverflow();
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

  /** Shift + roda do mouse → scroll horizontal (não interfere no DnD). */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // trackpad horizontal já rola nativamente; Shift+vertical vira horizontal
      if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        updateOverflow();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [updateOverflow, board.data?.stages?.length, pipelineId]);

  useEffect(() => {
    setBoardFade(true);
    const el = trackRef.current;
    if (el) el.scrollLeft = 0;
    scheduleMeasure();
    const t = window.setTimeout(() => setBoardFade(false), 200);
    return () => window.clearTimeout(t);
  }, [pipelineId, scheduleMeasure]);

  /* ---- Auto-scroll ao arrastar perto das bordas -------------------------- */

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current != null) {
      window.cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    autoScrollDirRef.current = 0;
  }, []);

  const tickAutoScroll = useCallback(function tickAutoScrollFrame() {
    const track = trackRef.current;
    const dir = autoScrollDirRef.current;
    if (!track || dir === 0) {
      autoScrollRef.current = null;
      return;
    }
    // velocidade moderada — não “pula” etapas de uma vez
    track.scrollLeft += dir * 12;
    updateOverflow();
    autoScrollRef.current = window.requestAnimationFrame(tickAutoScrollFrame);
  }, [updateOverflow]);

  const handleBoardDragOver = useCallback(
    (e: DragEvent) => {
      if (!draggingId) return;
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const edge = 72;
      const x = e.clientX;
      let dir = 0;
      if (x < rect.left + edge) dir = -1;
      else if (x > rect.right - edge) dir = 1;

      if (dir === 0) {
        stopAutoScroll();
        return;
      }

      // atualiza direção mesmo se o loop já estiver rodando
      const prev = autoScrollDirRef.current;
      autoScrollDirRef.current = dir;
      if (prev === 0 || autoScrollRef.current == null) {
        if (autoScrollRef.current != null) {
          window.cancelAnimationFrame(autoScrollRef.current);
        }
        autoScrollRef.current = window.requestAnimationFrame(tickAutoScroll);
      }
    },
    [draggingId, stopAutoScroll, tickAutoScroll]
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

  /* ---- Drag & drop ------------------------------------------------------- */

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
      e.dataTransfer.getData("text/opportunity-id") ||
      e.dataTransfer.getData("text/plain");
    setDropStageId(null);
    setDraggingId(null);
    stopAutoScroll();
    if (!id) return;
    const current = board.data?.stages.find((s) =>
      s.opportunities.some((o) => o.id === id)
    );
    if (current?.id === stageId) return;
    moveMutation.mutate({ id, stageId });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync();
  }

  const stageCount = board.data?.stages.length ?? 0;
  const isBoardLoading =
    pipelines.isLoading || (!!pipelineId && board.isLoading);
  const boardError = board.isError || pipelines.isError;

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
          disabled={!pipelineId || isBoardLoading}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova oportunidade
        </button>
      </>
    ),
    [pipelineId, pipelineOptions, isBoardLoading]
  );

  return (
    <TenantModule
      kind="board"
      title="Funil"
      kicker="Pipeline"
      className="crm-page"
      actions={headerActions}
    >
      {/* Resumo comercial compacto — só com dados */}
      {board.data && !isBoardLoading ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary dark:text-zinc-300">
            <Sparkles className="h-3 w-3 text-brand-500 opacity-80" aria-hidden />
            {boardStats.count === 0
              ? "Nenhuma oportunidade aberta"
              : boardStats.count === 1
                ? "1 oportunidade aberta"
                : `${boardStats.count} oportunidades abertas`}
          </span>
          {boardStats.value > 0 ? (
            <>
              <span className="text-ink-faint" aria-hidden>
                ·
              </span>
              <span className="tabular-nums font-semibold text-brand-600 dark:text-brand-400">
                {formatCurrency(boardStats.value)}
              </span>
              <span className="text-ink-faint">no funil</span>
            </>
          ) : null}
          {boardStats.stages > 0 ? (
            <>
              <span className="text-ink-faint" aria-hidden>
                ·
              </span>
              <span className="text-ink-faint">
                {boardStats.stages} etapa{boardStats.stages === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {isBoardLoading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 py-20"
          role="status"
          aria-live="polite"
        >
          <Spinner />
          <p className="text-[13px] text-ink-muted dark:text-zinc-400">
            Carregando o funil…
          </p>
        </div>
      ) : boardError ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <EmptyState
            title="Não foi possível carregar o funil"
            description="Verifique a conexão e tente de novo."
            action={
              <button
                type="button"
                className="btn-secondary h-9"
                onClick={() => {
                  void pipelines.refetch();
                  if (pipelineId) void board.refetch();
                }}
              >
                Tentar novamente
              </button>
            }
          />
        </div>
      ) : !board.data ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <EmptyState
            title="Nenhum funil por aqui"
            description="Crie um funil de vendas para começar a acompanhar oportunidades."
            action={
              <button
                type="button"
                className="btn-primary h-9"
                onClick={() => setOpen(true)}
                disabled={!pipelineId}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova oportunidade
              </button>
            }
          />
        </div>
      ) : (
        <div
          ref={shellRef}
          className="crm-board-shell"
          aria-label="Quadro do funil de vendas"
          onKeyDown={onBoardKeyDown}
        >
          {/* Fade + seta esquerda */}
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
          {/* Fade + seta direita */}
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
            aria-label={`${stageCount} etapas do funil. Use setas, Shift+roda ou teclado para navegar.`}
            onDragOver={handleBoardDragOver}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                stopAutoScroll();
              }
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
                          className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white/40 dark:ring-white/10"
                          style={{ background: stage.color || "#6366f1" }}
                          aria-hidden
                        />
                        <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink dark:text-gray-100">
                          {stage.name}
                        </h3>
                      </div>
                      <span className="badge-neutral shrink-0 tabular-nums">
                        {count}
                      </span>
                    </div>
                    {total > 0 ? (
                      <p className="pl-4 text-[11px] font-medium tabular-nums text-ink-muted dark:text-zinc-400">
                        {formatCurrency(total)}
                      </p>
                    ) : (
                      <p className="pl-4 text-[11px] text-ink-faint">
                        Sem valor nesta etapa
                      </p>
                    )}
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
                          Etapa vazia
                        </p>
                        <p className="max-w-[12rem] text-[10.5px] leading-relaxed text-ink-faint">
                          Arraste um deal para cá quando estiver nesta fase.
                        </p>
                      </div>
                    ) : (
                      stage.opportunities.map((opp) => {
                        const priority = opp.contact?.priority;
                        const score = opp.contact?.score;
                        const nextAction = opp.contact?.nextAction;
                        const company = opp.contact?.company;
                        const commercial =
                          opp.contact?.commercialStatus &&
                          opp.contact.commercialStatus !== "NOVO"
                            ? commercialStatusLabel[
                                opp.contact.commercialStatus
                              ] || opp.contact.commercialStatus
                            : null;
                        const stageTime = timeInStageLabel(opp);
                        const pTone = priorityTone(priority);
                        const showPriority =
                          priority && priority !== "NORMAL" && pTone;

                        return (
                          <article
                            key={opp.id}
                            className="crm-opp-card group"
                            draggable
                            data-dragging={
                              draggingId === opp.id ? "true" : "false"
                            }
                            onDragStart={(e) => onDragStart(e, opp.id)}
                            onDragEnd={onDragEnd}
                            aria-grabbed={draggingId === opp.id}
                            aria-label={`${opp.contact?.name || "Contato"} — ${opp.title}, ${formatCurrency(opp.value)}`}
                          >
                            {/* Topo: contato + grip sutil */}
                            <div className="flex items-start gap-1.5">
                              <GripVertical
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-70 group-focus-within:opacity-70"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-[13px] font-semibold leading-snug text-ink dark:text-gray-100">
                                    {opp.contact?.name || "Contato"}
                                  </p>
                                  {showPriority ? (
                                    <span
                                      className={cn(
                                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                        pTone === "danger"
                                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                      )}
                                    >
                                      {leadPriorityLabel[priority!] || priority}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-muted dark:text-zinc-400">
                                  {opp.title}
                                </p>
                                {company ? (
                                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                                    {company}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            {/* Valor + meta secundária */}
                            <div className="mt-2.5 flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold tabular-nums tracking-tight text-brand-600 dark:text-brand-400">
                                {formatCurrency(opp.value)}
                              </span>
                              <div className="flex min-w-0 items-center gap-1.5">
                                {commercial ? (
                                  <span className="truncate rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary dark:bg-white/[0.06] dark:text-zinc-300">
                                    {commercial}
                                  </span>
                                ) : typeof score === "number" && score > 0 ? (
                                  <span className="text-[10px] tabular-nums text-ink-faint">
                                    Score {score}
                                  </span>
                                ) : opp.probability > 0 ? (
                                  <span className="text-[10px] tabular-nums text-ink-faint">
                                    {opp.probability}%
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* Próxima ação */}
                            {nextAction ? (
                              <p className="mt-2 line-clamp-2 rounded-md bg-brand-500/[0.04] px-1.5 py-1 text-[11px] leading-snug text-ink-secondary dark:bg-brand-400/[0.06] dark:text-zinc-300">
                                <span className="font-medium text-brand-600/90 dark:text-brand-400/90">
                                  Próximo:{" "}
                                </span>
                                {nextAction}
                              </p>
                            ) : null}

                            {/* Tempo na etapa */}
                            {stageTime ? (
                              <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-ink-faint">
                                <Clock3
                                  className="h-3 w-3 shrink-0 opacity-70"
                                  strokeWidth={1.75}
                                  aria-hidden
                                />
                                <span>{stageTime}</span>
                              </p>
                            ) : null}

                            {/* Fallback acessível sem arrastar */}
                            <div
                              className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <Select
                                size="sm"
                                value=""
                                placeholder="Mover para…"
                                onChange={(nextStageId) => {
                                  if (nextStageId) {
                                    moveMutation.mutate({
                                      id: opp.id,
                                      stageId: nextStageId,
                                    });
                                  }
                                }}
                                options={[
                                  { value: "", label: "Mover para…" },
                                  ...board.data!.stages
                                    .filter((s) => s.id !== stage.id)
                                    .map((s) => ({
                                      value: s.id,
                                      label: s.name,
                                    })),
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
                contactOptions.find((c) => c.id === form.contactId)?.name ||
                "Contato"
              }
              subtitle={
                contactOptions.find((c) => c.id === form.contactId)?.company ||
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
                placeholder="Ex.: Plano Profissional — renovação"
              />
            </FormField>
            <FormField label="Contato" required>
              <input
                className="input mb-2 h-9 text-[13px]"
                value={contactPickerInput}
                onChange={(e) => setContactPickerInput(e.target.value)}
                placeholder="Buscar contato"
                aria-label="Buscar contato"
              />
              <Select
                value={form.contactId}
                onChange={(contactId) => setForm({ ...form, contactId })}
                required
                placeholder="Selecionar contato do funil"
                options={[
                  { value: "", label: "Selecionar contato…" },
                  ...contactOptions.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.company || undefined,
                    leading: <SelectAvatar name={c.name} />,
                  })),
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
    </TenantModule>
  );
}
