"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Search,
  Send,
  Sparkles,
  UserPlus,
  Archive,
  CheckCircle2,
  Star,
  StickyNote,
  Bot,
  Trash2,
  RotateCcw,
  ArrowLeft,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Info,
  ChevronDown,
  User,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  cn,
  commercialStatusLabel,
  formatDate,
  initials,
  leadPriorityLabel,
  statusLabel,
} from "@/lib/utils";
import {
  Dropdown,
  DropdownItem,
  FormField,
  FormSection,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { useAuth } from "@/store/auth";

const CLOSE_REASONS = [
  { value: "COMPLETED", label: "Resolvido" },
  { value: "HUMAN_CLOSED", label: "Encerrado pelo atendente" },
  { value: "AI_RESOLVED", label: "Resolvido pela IA" },
  { value: "NO_RESPONSE", label: "Inatividade do cliente" },
  { value: "SALE", label: "Venda realizada" },
  { value: "GAVE_UP", label: "Cliente desistiu" },
  { value: "FORWARDED", label: "Encaminhado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "DUPLICATE", label: "Duplicado" },
  { value: "OTHER", label: "Outro" },
] as const;

const CLOSE_REASON_LABEL: Record<string, string> = Object.fromEntries(
  CLOSE_REASONS.map((r) => [r.value, r.label])
);

type ConversationListItem = {
  id: string;
  status: string;
  isUnread: boolean;
  isFavorite: boolean;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  aiSentiment?: string;
  aiIntent?: string;
  aiScore?: number;
  contact: {
    id: string;
    name: string;
    phone?: string;
    commercialStatus?: string;
    priority?: string;
    score?: number;
    nextAction?: string | null;
    scoreBreakdown?: Array<{ label: string; delta?: number }> | null;
    tags?: Array<{ tag: { id: string; name: string; color: string } }>;
  };
  channel?: { id: string; name: string; type: string };
  assignedTo?: { id: string; name: string } | null;
};

type MessageMeta = {
  agentId?: string;
  agentName?: string;
  aiAuto?: boolean;
  systemNotice?: boolean;
  systemEvent?: boolean;
  eventKind?: string;
  noticeKind?: string;
  humanHandoff?: boolean;
  attendanceClosed?: boolean;
  closeSource?: string;
  closeReason?: string;
  agentUserId?: string;
  pendingApproval?: boolean;
  originalReply?: string;
  [key: string]: unknown;
};

type ConversationMessage = {
  id: string;
  content: string;
  direction: string;
  type?: string;
  isAiGenerated?: boolean;
  aiApproved?: boolean | null;
  createdAt: string;
  metadata?: MessageMeta | null;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
};

/** Origem derivada dos campos persistidos (sem enum novo no banco). */
type MessageOrigin = "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM" | "INTERNAL_NOTE";

type ConversationDetail = ConversationListItem & {
  aiSummary?: string;
  closedAt?: string | null;
  closeReason?: string | null;
  closeSource?: string | null;
  closeNote?: string | null;
  messages: ConversationMessage[];
  notes: Array<{ id: string; content: string; createdAt: string; author: { name: string } }>;
  contact: ConversationListItem["contact"] & {
    email?: string;
    memory?: { summary?: string } | null;
  };
};

type AiSuggestion = {
  reply: string;
  summary: string;
  intent: string;
  sentiment: string;
  commercialStatus?: string;
  priority?: string;
  score: number;
  nextAction: string;
  tags: string[];
  reasons: string[];
};

type ListScope = "queue" | "unread" | "mine" | "ai" | "approve";

/**
 * Empty state — minimalista, sem card/borda/CTA.
 * `compact` = coluna da lista (mais denso).
 */
function QuietEmpty({
  title,
  withIcon = true,
  compact = false,
}: {
  title: string;
  withIcon?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center select-none",
        compact ? "gap-1.5 px-3" : "gap-2.5 px-5"
      )}
    >
      {withIcon ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-full text-ink-faint/90 dark:text-gray-500",
            compact
              ? "h-7 w-7 bg-black/[0.03] dark:bg-white/[0.04]"
              : "h-10 w-10 bg-black/[0.04] dark:bg-white/[0.05]"
          )}
          aria-hidden
        >
          <MessageSquare
            className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"}
            strokeWidth={1.5}
          />
        </div>
      ) : null}
      <p
        className={cn(
          "tracking-tight",
          compact
            ? "text-[12px] font-medium text-ink-faint"
            : "text-[13.5px] font-medium text-ink-muted dark:text-gray-400"
        )}
      >
        {title}
      </p>
    </div>
  );
}

function formatMsgTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(value: string) {
  const d = new Date(value);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return "Hoje";
  if (dayKey(value) === dayKey(yest.toISOString())) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function attendanceLabel(c: {
  assignedTo?: { id: string; name: string } | null;
  status?: string;
}) {
  if (c.assignedTo?.name) return `Atendido por ${c.assignedTo.name}`;
  if (c.status === "PENDING") return "Aguardando atendente";
  if (c.status === "CLOSED" || c.status === "ARCHIVED") return "Sem responsável";
  return "IA atendendo";
}

function messageMeta(m: ConversationMessage): MessageMeta {
  return (m.metadata || {}) as MessageMeta;
}

/** Classifica origem a partir de direction + isAiGenerated + metadata (já persistidos). */
function resolveMessageOrigin(m: ConversationMessage): MessageOrigin {
  const meta = messageMeta(m);
  if (
    m.type === "SYSTEM" ||
    meta.systemNotice ||
    meta.systemEvent ||
    meta.eventKind === "attendance_closed" ||
    meta.eventKind === "attendance_reopened" ||
    meta.eventKind === "close_suggestion"
  ) {
    return "SYSTEM";
  }
  if (m.direction === "INTERNAL") return "INTERNAL_NOTE";
  if (m.direction === "INBOUND") return "CUSTOMER";
  if (m.isAiGenerated) return "AI";
  return "HUMAN";
}

function messageGroupKey(m: ConversationMessage): string {
  const origin = resolveMessageOrigin(m);
  const meta = messageMeta(m);
  if (origin === "AI") return `AI:${meta.agentId || meta.agentName || "ai"}`;
  if (origin === "HUMAN") return `HUMAN:${m.author?.id || "human"}`;
  if (origin === "INTERNAL_NOTE") return `NOTE:${m.author?.id || "note"}`;
  if (origin === "SYSTEM") return `SYS:${meta.noticeKind || "sys"}`;
  return "CUSTOMER";
}

function aiDisplayName(m: ConversationMessage): string {
  const meta = messageMeta(m);
  return (meta.agentName || "").trim() || "Assistente";
}

function systemEventLabel(m: ConversationMessage): string {
  const meta = messageMeta(m);
  const who = (meta.agentName || m.author?.name || "").trim().split(" ")[0];
  // Só "assumiu" quando um humano realmente assumiu (takeover real)
  if (meta.noticeKind === "human_takeover") {
    return who ? `${who} assumiu o atendimento` : "Atendente humano assumiu";
  }
  if (meta.noticeKind === "ai_resumed_by_human" || meta.noticeKind === "ai_resumed_customer_return") {
    return who ? `${who} devolveu o atendimento para a IA` : "IA reassumiu o atendimento";
  }
  if (meta.noticeKind === "human_transfer") {
    return who ? `${who} transferiu o atendimento` : "Atendimento transferido";
  }
  if (meta.noticeKind === "handoff_brief") {
    return "Resumo para o atendente";
  }
  // IA pediu humano / fila — ainda NÃO há atendente no comando
  if (
    meta.noticeKind === "platform_ai_degradation_handoff" ||
    meta.noticeKind === "ai_handoff_request" ||
    meta.noticeKind === "returned_to_queue" ||
    meta.humanHandoff
  ) {
    return "Aguardando atendente humano";
  }
  if (meta.eventKind === "close_suggestion") {
    return "Este atendimento parece concluído";
  }
  if (meta.eventKind === "attendance_reopened") {
    return "Atendimento reaberto";
  }
  if (
    meta.eventKind === "attendance_closed" ||
    meta.noticeKind === "attendance_closed" ||
    meta.attendanceClosed
  ) {
    if (meta.closeSource === "inactivity") {
      return "Encerrado automaticamente · Inatividade do cliente";
    }
    if (meta.closeSource === "ai") {
      return who
        ? `${who} encerrou o atendimento · Resolvido pela IA`
        : "Encerrado automaticamente · Resolvido pela IA";
    }
    return who ? `Atendimento finalizado por ${who}` : "Atendimento finalizado";
  }
  // Timeline interna: usa o texto do evento (já em linguagem de produto)
  const firstLine = (m.content || "").split("\n")[0]?.trim();
  return firstLine?.slice(0, 100) || "Evento do sistema";
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 text-right font-medium leading-snug text-ink dark:text-gray-100">
        {value}
      </span>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <InboxInner />
    </Suspense>
  );
}

function InboxInner() {
  const qc = useQueryClient();
  const { user, tenant } = useAuth();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("id") || searchParams.get("c")
  );
  const statusFromUrl = (searchParams.get("status") || "").toUpperCase();
  const [status, setStatus] = useState(
    ["OPEN", "PENDING", "CLOSED", "ARCHIVED"].includes(statusFromUrl)
      ? statusFromUrl
      : "OPEN"
  );

  useEffect(() => {
    const s = (searchParams.get("status") || "").toUpperCase();
    if (["OPEN", "PENDING", "CLOSED", "ARCHIVED"].includes(s)) setStatus(s);
    const id = searchParams.get("id") || searchParams.get("c");
    if (id) setSelectedId(id);
  }, [searchParams]);
  const [scope, setScope] = useState<ListScope>("queue");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("COMPLETED");
  const [closeNote, setCloseNote] = useState("");
  const [contextOpen, setContextOpen] = useState(true);
  const [mobileContext, setMobileContext] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const memberRole = tenant?.role || "";
  const canHardDelete =
    user?.platformRole === "SUPERADMIN" ||
    memberRole === "ADMIN" ||
    memberRole === "SUPERVISOR";

  const listQuery = useQuery({
    queryKey: ["conversations", status, search, scope, user?.id],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      if (scope === "unread") params.set("unread", "1");
      if (scope === "mine" && user?.id) params.set("assignedToId", user.id);
      if (scope === "ai") params.set("unassigned", "1");
      if (scope === "approve") params.set("pendingApproval", "1");
      return api<{ items: ConversationListItem[] }>(`/conversations?${params}`);
    },
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  });

  const detailQuery = useQuery({
    queryKey: ["conversation", selectedId],
    enabled: !!selectedId,
    queryFn: () => api<ConversationDetail>(`/conversations/${selectedId}`),
    refetchInterval: selectedId ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  const quickReplies = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => api<Array<{ id: string; title: string; content: string }>>("/quick-replies"),
  });

  useEffect(() => {
    if (!selectedId && listQuery.data?.items?.[0]) {
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
        setSelectedId(listQuery.data.items[0].id);
      }
    }
  }, [listQuery.data, selectedId]);

  const messageCount = detailQuery.data?.messages?.length ?? 0;
  useEffect(() => {
    if (messageCount > messagesCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    messagesCountRef.current = messageCount;
  }, [messageCount, selectedId]);

  useEffect(() => {
    // Ao abrir conversa, ir ao fim
    if (selectedId && messageCount > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMutation = useMutation({
    mutationFn: (payload: { content: string; isInternal?: boolean }) =>
      api(`/conversations/${selectedId}/messages`, { method: "POST", json: payload }),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<ConversationListItem & { status?: string }>(`/conversations/${selectedId}`, {
        method: "PATCH",
        json: payload,
      }),
    /**
     * Arquivar/encerrar/reabrir: atualiza TODAS as abas na hora.
     * Só invalidate deixava a conversa “presa” nas outras abas até F5.
     */
    onMutate: async (payload) => {
      if (!selectedId || typeof payload.status !== "string") return {};
      const id = selectedId;
      const newStatus = payload.status;

      await qc.cancelQueries({ queryKey: ["conversations"] });
      await qc.cancelQueries({ queryKey: ["conversation", id] });

      const previousLists = qc.getQueriesData<{ items: ConversationListItem[] }>({
        queryKey: ["conversations"],
      });
      const previousDetail = qc.getQueryData(["conversation", id]);

      for (const [key, data] of previousLists) {
        if (!data?.items) continue;
        // queryKey: ["conversations", status, search, scope, userId]
        const filterStatus = String(key[1] ?? "");
        const nextItems =
          filterStatus && filterStatus !== newStatus
            ? data.items.filter((c) => c.id !== id)
            : data.items.map((c) =>
                c.id === id ? { ...c, status: newStatus, isUnread: false } : c
              );
        qc.setQueryData(key, { ...data, items: nextItems });
      }

      qc.setQueryData(["conversation", id], (old: ConversationDetail | undefined) =>
        old ? { ...old, status: newStatus } : old
      );

      return { previousLists, previousDetail, id };
    },
    onError: (_err, _payload, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.previousLists || []) {
        qc.setQueryData(key, data);
      }
      if (ctx.id && ctx.previousDetail !== undefined) {
        qc.setQueryData(["conversation", ctx.id], ctx.previousDetail);
      }
    },
    onSuccess: async (server, payload) => {
      const id = selectedId;
      if (id && server && typeof server === "object") {
        qc.setQueryData(["conversation", id], (old: ConversationDetail | undefined) =>
          old ? { ...old, ...server } : old
        );
        // Reforça remoção nas listas cujo filtro não bate com o novo status
        if (typeof payload.status === "string") {
          const newStatus = payload.status;
          const lists = qc.getQueriesData<{ items: ConversationListItem[] }>({
            queryKey: ["conversations"],
          });
          for (const [key, data] of lists) {
            if (!data?.items) continue;
            const filterStatus = String(key[1] ?? "");
            if (filterStatus && filterStatus !== newStatus) {
              qc.setQueryData(key, {
                ...data,
                items: data.items.filter((c) => c.id !== id),
              });
            }
          }
        }
      }
      // Refetch ativo + invalida cache de abas inativas (troca de chip sem F5)
      await qc.refetchQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["human-queue-pending"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("nexaflow:conversation-updated", {
            detail: { conversationId: id, status: payload.status },
          })
        );
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/conversations/${selectedId}`, { method: "DELETE", json: {} }),
    onSuccess: () => {
      const gone = selectedId;
      setSelectedId(null);
      setAi(null);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.removeQueries({ queryKey: ["conversation", gone] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => api(`/conversations/${selectedId}/assign`, { method: "POST", json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["human-queue-pending"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Não foi possível assumir o atendimento.";
      window.alert(msg);
    },
  });

  const resumeAiMutation = useMutation({
    mutationFn: () =>
      api(`/conversations/${selectedId}/resume-ai`, { method: "POST", json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["human-queue-pending"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Não foi possível retomar a IA.";
      window.alert(msg);
    },
  });

  function openCloseModal() {
    setCloseReason("COMPLETED");
    setCloseNote("");
    setCloseOpen(true);
  }

  function submitClose() {
    actionMutation.mutate(
      {
        status: "CLOSED",
        closeReason: closeReason || undefined,
        closeNote: closeNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCloseOpen(false);
          setCloseNote("");
        },
      }
    );
  }

  function confirmArchive() {
    if (
      confirm(
        "Arquivar esta conversa?\n\nO chat no WhatsApp não é apagado. A conversa fica em Arquivadas."
      )
    ) {
      actionMutation.mutate({ status: "ARCHIVED" });
    }
  }

  function confirmDelete() {
    if (!canHardDelete) {
      alert("Apenas administradores ou supervisores podem excluir. Use Finalizar ou Arquivar.");
      return;
    }
    if (
      confirm(
        "Excluir permanentemente da NexaFlow?\n\nMensagens internas serão apagadas. O WhatsApp não é alterado."
      )
    ) {
      deleteMutation.mutate();
    }
  }

  function confirmReopen() {
    if (confirm("Reabrir e voltar para a fila de abertas?")) {
      actionMutation.mutate({ status: "OPEN" });
    }
  }

  async function requestAi() {
    if (!selectedId) return;
    setAiLoading(true);
    try {
      const result = await api<AiSuggestion>(`/conversations/${selectedId}/ai-suggest`, {
        method: "POST",
        json: {},
      });
      setAi(result);
      if (result.reply) {
        setInternal(false);
        setMessage(result.reply);
        textareaRef.current?.focus();
      }
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
    } finally {
      setAiLoading(false);
    }
  }

  async function sendAiReply() {
    if (!selectedId || !ai?.reply) return;
    await api(`/conversations/${selectedId}/ai-send`, {
      method: "POST",
      json: { content: ai.reply, approved: true },
    });
    setAi(null);
    setMessage("");
    qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || !selectedId) return;
    await sendMutation.mutateAsync({ content: message.trim(), isInternal: internal });
  }

  const items = listQuery.data?.items || [];
  const conversation = detailQuery.data;
  const isClosed =
    conversation?.status === "CLOSED" || conversation?.status === "ARCHIVED";
  const iOwnIt = conversation?.assignedTo?.id === user?.id;
  const hasHuman = Boolean(conversation?.assignedTo);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    scope !== "queue" ||
    status !== "OPEN";

  async function approvePendingMessage(
    messageId: string,
    opts?: { content?: string; discard?: boolean }
  ) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/messages/${messageId}/approve`, {
        method: "POST",
        json: {
          content: opts?.content,
          discard: opts?.discard,
        },
      });
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      console.error(e);
    }
  }
  const listEmpty = !listQuery.isLoading && items.length === 0;
  /** Coluna direita só com conversa selecionada (e toggle aberto) */
  const showContextPanel = Boolean(selectedId) && contextOpen;

  const listEmptyLabel = hasActiveFilters
    ? "Nenhuma conversa encontrada"
    : "Nenhuma conversa";

  const centerEmptyTitle = listEmpty
    ? hasActiveFilters
      ? "Nenhuma conversa encontrada"
      : "Nenhuma conversa ainda"
    : "Selecione uma conversa";

  const scopeChips: { value: ListScope; label: string }[] = [
    { value: "queue", label: "Todas" },
    { value: "unread", label: "Não lidas" },
    { value: "mine", label: "Minhas" },
    { value: "ai", label: "IA" },
    { value: "approve", label: "Aprovar" },
  ];

  /** Status da fila — chips (mesmo idioma visual do escopo; sem Select “form”) */
  const statusChips: { value: string; label: string }[] = [
    { value: "OPEN", label: "Abertas" },
    { value: "PENDING", label: "Pendentes" },
    { value: "CLOSED", label: "Encerradas" },
    { value: "ARCHIVED", label: "Arquivadas" },
  ];

  function filterChipClass(active: boolean) {
    return cn(
      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
      active
        ? "bg-brand-500/[0.15] text-brand-700 ring-1 ring-inset ring-brand-500/20 dark:bg-brand-500/[0.18] dark:text-brand-200 dark:ring-brand-400/25"
        : "text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
    );
  }

  const timeline = useMemo(() => {
    if (!conversation?.messages)
      return [] as Array<
        | { kind: "day"; key: string; label: string }
        | {
            kind: "msg";
            key: string;
            msg: ConversationMessage;
            showLabel: boolean;
            origin: MessageOrigin;
          }
      >;
    const out: Array<
      | { kind: "day"; key: string; label: string }
      | {
          kind: "msg";
          key: string;
          msg: ConversationMessage;
          showLabel: boolean;
          origin: MessageOrigin;
        }
    > = [];
    let lastDay = "";
    let lastBucket = "";
    for (const m of conversation.messages) {
      const dk = dayKey(m.createdAt);
      if (dk !== lastDay) {
        out.push({ kind: "day", key: `d-${dk}`, label: dayLabel(m.createdAt) });
        lastDay = dk;
        lastBucket = "";
      }
      const origin = resolveMessageOrigin(m);
      const bucket = messageGroupKey(m);
      // Eventos de sistema sempre “sozinhos” (sem agrupar com bolhas)
      const showLabel = origin === "SYSTEM" ? true : bucket !== lastBucket;
      lastBucket = origin === "SYSTEM" ? "" : bucket;
      out.push({ kind: "msg", key: m.id, msg: m, showLabel, origin });
    }
    return out;
  }, [conversation?.messages]);

  const score = conversation?.contact.score ?? conversation?.aiScore ?? 0;
  const scorePct = Math.min(100, Math.max(0, score));

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col lg:h-[calc(100vh-4rem)]">
      <Modal
        open={closeOpen}
        onClose={() => !actionMutation.isPending && setCloseOpen(false)}
        title="Finalizar atendimento?"
        description="O atendimento sai da fila. O histórico permanece."
        variant="confirm"
        size="sm"
        preventClose={actionMutation.isPending}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary h-9 text-sm"
              disabled={actionMutation.isPending}
              onClick={() => setCloseOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 text-sm"
              disabled={actionMutation.isPending}
              onClick={submitClose}
            >
              {actionMutation.isPending ? "Finalizando…" : "Finalizar"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormSection title="Encerramento" surface>
            <FormField label="Motivo">
              <Select
                value={closeReason}
                onChange={setCloseReason}
                options={CLOSE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                aria-label="Motivo"
              />
            </FormField>
            <FormField label="Observação">
              <textarea
                className="input min-h-[72px] w-full resize-none"
                placeholder="Opcional"
                value={closeNote}
                maxLength={500}
                onChange={(e) => setCloseNote(e.target.value)}
              />
            </FormField>
          </FormSection>
        </div>
      </Modal>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border border-line bg-white dark:border-[#262b36] dark:bg-[#12151c]",
          showContextPanel
            ? "lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,340px)]"
            : "lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]"
        )}
      >
        {/* ═══ LISTA ═══ */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-r border-line dark:border-[#262b36]",
            selectedId ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="shrink-0 space-y-2 border-b border-line px-3 py-2.5 dark:border-[#262b36]">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-ink dark:text-white">
              Conversas
            </h1>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                className="input h-8 pl-8 text-[12.5px]"
                placeholder="Buscar conversas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar conversas"
              />
            </div>

            {/* Escopo da lista */}
            <div
              className="flex flex-wrap items-center gap-0.5"
              role="group"
              aria-label="Escopo da lista"
            >
              {scopeChips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setScope(c.value)}
                  className={filterChipClass(scope === c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Status da fila — mesma família visual, linha separada */}
            <div
              className="flex flex-wrap items-center gap-0.5 border-t border-line-soft pt-2 dark:border-white/[0.05]"
              role="group"
              aria-label="Status da conversa"
            >
              {statusChips.map((c) => (
                <button
                  key={c.value || "all"}
                  type="button"
                  onClick={() => setStatus(c.value)}
                  className={filterChipClass(status === c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="flex justify-center p-10">
                <Spinner />
              </div>
            )}
            {listEmpty && (
              <div className="flex justify-center px-3 pt-8 pb-4">
                <QuietEmpty title={listEmptyLabel} compact />
              </div>
            )}
            {items.map((c) => {
              const selected = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setAi(null);
                    setMobileContext(false);
                  }}
                  className={cn(
                    "relative w-full border-b border-line-soft px-3 py-3 text-left transition-colors dark:border-white/[0.04]",
                    selected
                      ? "bg-black/[0.03] dark:bg-white/[0.045]"
                      : "hover:bg-black/[0.02] dark:hover:bg-white/[0.025]"
                  )}
                >
                  {selected && (
                    <span
                      className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-brand-500"
                      aria-hidden
                    />
                  )}
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-[11px] font-semibold text-ink-secondary dark:bg-white/10 dark:text-gray-200">
                        {initials(c.contact.name)}
                      </div>
                      {c.isUnread && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 dark:border-[#12151c]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-[13px] text-ink dark:text-gray-100",
                            c.isUnread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {c.contact.name}
                        </p>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-faint">
                          {formatMsgTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-muted">
                        {c.lastMessagePreview || "Sem mensagens"}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-ink-faint">
                        {c.channel?.type || "Canal"}
                        {" · "}
                        {c.assignedTo?.name
                          ? c.assignedTo.name
                          : c.status === "PENDING"
                            ? "Aguardando"
                            : "IA"}
                        {c.isFavorite ? " · ★" : ""}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ═══ CHAT ═══ */}
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            selectedId ? "flex" : "hidden lg:flex"
          )}
        >
          {!selectedId && (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F7F8FA] px-6 pb-[12vh] dark:bg-[#0c0e13]">
              {/* pb sobe o bloco opticamente — centralizado na área útil, sem flutuação */}
              <QuietEmpty title={centerEmptyTitle} />
            </div>
          )}
          {selectedId && detailQuery.isLoading && (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          )}
          {conversation && (
            <>
              {/* Header */}
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5 dark:border-[#262b36] sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 shrink-0 px-0 lg:hidden"
                    aria-label="Voltar"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[11px] font-semibold dark:bg-white/10">
                    {initials(conversation.contact.name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-[14px] font-semibold text-ink dark:text-white">
                      {conversation.contact.name}
                    </h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-muted">
                      <span>
                        {conversation.channel?.name || conversation.channel?.type || "Canal"}
                      </span>
                      <span className="text-ink-faint">·</span>
                      <span>{statusLabel[conversation.status] || conversation.status}</span>
                      {isClosed && conversation.closeReason ? (
                        <>
                          <span className="text-ink-faint">·</span>
                          <span className="text-ink-faint" title="Motivo do encerramento">
                            {CLOSE_REASON_LABEL[conversation.closeReason] ||
                              conversation.closeReason}
                            {conversation.closeSource === "inactivity" ||
                            conversation.closeSource === "ai"
                              ? " (automático)"
                              : ""}
                          </span>
                        </>
                      ) : null}
                      <span className="text-ink-faint">·</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          conversation.assignedTo?.name
                            ? "text-ink-secondary dark:text-gray-300"
                            : conversation.status === "PENDING"
                              ? "text-amber-700 dark:text-amber-300"
                              : conversation.status === "CLOSED" ||
                                  conversation.status === "ARCHIVED"
                                ? "text-ink-faint"
                                : "text-brand-700 dark:text-brand-300"
                        )}
                        title="Responsável atual do atendimento"
                      >
                        {!conversation.assignedTo?.name &&
                          conversation.status !== "CLOSED" &&
                          conversation.status !== "ARCHIVED" &&
                          conversation.status !== "PENDING" && (
                            <Bot className="h-3 w-3" strokeWidth={1.75} />
                          )}
                        {attendanceLabel(conversation)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {!isClosed && !iOwnIt && (
                    <button
                      type="button"
                      className="btn-primary h-8 text-xs"
                      disabled={assignMutation.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            "Assumir este atendimento?\n\nO cliente pode ser avisado no WhatsApp e a IA para de responder sozinha."
                          )
                        ) {
                          assignMutation.mutate();
                        }
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {assignMutation.isPending ? "Assumindo…" : "Assumir"}
                    </button>
                  )}
                  {!isClosed && iOwnIt && (
                    <>
                      <span
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200"
                        title="A IA não responderá automaticamente enquanto o atendimento estiver com você."
                      >
                        <User className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Você · IA pausada
                      </span>
                      <button
                        type="button"
                        className="btn-secondary h-8 text-xs"
                        disabled={resumeAiMutation.isPending}
                        title="A IA voltará a responder na próxima mensagem do cliente"
                        onClick={() => {
                          if (
                            confirm(
                              "A IA voltará a responder automaticamente às próximas mensagens deste cliente.\n\nVocê deixa de ser o responsável operacional. Continuar?"
                            )
                          ) {
                            resumeAiMutation.mutate();
                          }
                        }}
                      >
                        <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {resumeAiMutation.isPending ? "Retomando…" : "Retomar IA"}
                      </button>
                    </>
                  )}
                  {!isClosed && !hasHuman && !iOwnIt && conversation.status !== "PENDING" && (
                    <span className="hidden h-8 items-center gap-1 rounded-lg bg-brand-500/10 px-2.5 text-[11px] font-medium text-brand-700 dark:text-brand-300 sm:inline-flex">
                      <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                      IA ativa
                    </span>
                  )}
                  {!isClosed && !hasHuman && conversation.status === "PENDING" && (
                    <span className="hidden h-8 items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 text-[11px] font-medium text-amber-800 dark:text-amber-200 sm:inline-flex">
                      Aguardando · IA pausada
                    </span>
                  )}

                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 px-0 lg:hidden"
                    title="Detalhes"
                    onClick={() => setMobileContext(true)}
                  >
                    <Info className="h-4 w-4" strokeWidth={1.75} />
                  </button>

                  <button
                    type="button"
                    className="btn-ghost hidden h-8 w-8 px-0 lg:inline-flex"
                    title={contextOpen ? "Ocultar contexto" : "Mostrar contexto"}
                    onClick={() => setContextOpen((v) => !v)}
                  >
                    {contextOpen ? (
                      <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </button>

                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        className="btn-secondary h-8 w-8 px-0"
                        aria-label="Mais ações"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    {!isClosed && (
                      <>
                        <DropdownItem
                          onClick={() =>
                            actionMutation.mutate({ isFavorite: !conversation.isFavorite })
                          }
                        >
                          <Star className="h-3.5 w-3.5" />
                          {conversation.isFavorite ? "Remover importante" : "Marcar importante"}
                        </DropdownItem>
                        {iOwnIt && (
                          <DropdownItem
                            onClick={() => {
                              if (
                                confirm(
                                  "A IA voltará a responder automaticamente às próximas mensagens deste cliente.\n\nContinuar?"
                                )
                              ) {
                                resumeAiMutation.mutate();
                              }
                            }}
                          >
                            <Bot className="h-3.5 w-3.5" />
                            Retomar IA
                          </DropdownItem>
                        )}
                        <DropdownItem onClick={openCloseModal}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Finalizar atendimento
                        </DropdownItem>
                        <DropdownItem onClick={confirmArchive}>
                          <Archive className="h-3.5 w-3.5" />
                          Arquivar
                        </DropdownItem>
                      </>
                    )}
                    {isClosed && (
                      <DropdownItem onClick={confirmReopen}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reabrir
                      </DropdownItem>
                    )}
                    {canHardDelete && (
                      <DropdownItem danger onClick={confirmDelete}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </DropdownItem>
                    )}
                  </Dropdown>
                </div>
              </header>

              {isClosed && (
                <div className="shrink-0 border-b border-amber-500/[0.15] bg-amber-500/[0.07] px-4 py-2.5 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12.5px] font-medium text-amber-950 dark:text-amber-100">
                      {conversation.status === "ARCHIVED" ? "Arquivada" : "Finalizada"}
                      {conversation.closedAt ? ` · ${formatDate(conversation.closedAt)}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="btn-primary h-7 text-[11px]"
                        onClick={confirmReopen}
                        disabled={actionMutation.isPending}
                      >
                        Reabrir
                      </button>
                      {conversation.status !== "ARCHIVED" && (
                        <button
                          type="button"
                          className="btn-secondary h-7 text-[11px]"
                          onClick={confirmArchive}
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sugestão de encerramento pela IA */}
              {!isClosed &&
                conversation.messages.some((m) => {
                  const meta = messageMeta(m);
                  return meta.eventKind === "close_suggestion";
                }) &&
                (() => {
                  const lastSug = [...conversation.messages]
                    .reverse()
                    .find((m) => messageMeta(m).eventKind === "close_suggestion");
                  if (!lastSug) return null;
                  const age =
                    Date.now() - new Date(lastSug.createdAt).getTime() < 12 * 3600_000;
                  if (!age) return null;
                  return (
                    <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 dark:bg-amber-500/[0.08] sm:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12.5px] text-amber-950 dark:text-amber-100">
                          Este atendimento parece concluído.
                        </p>
                        <button
                          type="button"
                          className="btn-secondary h-7 px-2.5 text-[11px]"
                          onClick={openCloseModal}
                        >
                          Encerrar atendimento
                        </button>
                      </div>
                    </div>
                  );
                })()}

              {/* Mensagens — origem só na UI interna (nunca no texto do WhatsApp) */}
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-[#F7F8FA] px-3 py-4 dark:bg-[#0c0e13] sm:px-5">
                {timeline.map((item) => {
                  if (item.kind === "day") {
                    return (
                      <div key={item.key} className="flex justify-center py-3">
                        <span className="rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-ink-muted dark:bg-white/[0.06]">
                          {item.label}
                        </span>
                      </div>
                    );
                  }

                  const m = item.msg;
                  const origin = item.origin;
                  const time = formatMsgTime(m.createdAt);

                  // Eventos de sistema / handoff — timeline discreta (não bolha de chat)
                  if (origin === "SYSTEM") {
                    return (
                      <div key={item.key} className="flex justify-center py-2.5">
                        <span
                          className="max-w-[min(90%,22rem)] rounded-full border border-black/[0.06] bg-black/[0.03] px-3 py-1 text-center text-[11px] font-medium text-ink-muted dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400"
                          title={m.content}
                        >
                          {systemEventLabel(m)}
                          {time ? (
                            <span className="ml-1.5 tabular-nums text-ink-faint">· {time}</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  }

                  const isTeam = origin === "AI" || origin === "HUMAN" || origin === "INTERNAL_NOTE";
                  const agentName = origin === "AI" ? aiDisplayName(m) : "";
                  const humanName = m.author?.name || "Atendente";
                  const contactName = conversation?.contact.name || "Cliente";

                  const senderTooltip =
                    origin === "AI"
                      ? `Enviado por ${agentName}\nAgente de IA`
                      : origin === "HUMAN"
                        ? `Enviado por ${humanName}\nAtendente`
                        : origin === "INTERNAL_NOTE"
                          ? `Nota interna · ${humanName}`
                          : contactName;

                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex",
                        isTeam ? "justify-end" : "justify-start",
                        item.showLabel ? "mt-3" : "mt-0.5"
                      )}
                    >
                      <div
                        className={cn(
                          "flex min-w-0 max-w-[min(78%,28rem)] flex-col",
                          isTeam ? "items-end" : "items-start"
                        )}
                      >
                        {/* Identificação do remetente — só no 1º do grupo */}
                        {item.showLabel && origin === "CUSTOMER" && (
                          <p
                            className="mb-1 px-0.5 text-[11px] font-medium text-ink-secondary dark:text-gray-400"
                            title={senderTooltip}
                          >
                            {contactName}
                          </p>
                        )}
                        {item.showLabel && origin === "AI" && (
                          <p
                            className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300"
                            title={senderTooltip}
                          >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/[0.15]">
                              <Bot className="h-3 w-3" strokeWidth={1.75} />
                            </span>
                            {agentName}
                          </p>
                        )}
                        {item.showLabel && origin === "HUMAN" && (
                          <p
                            className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-ink-secondary dark:text-gray-400"
                            title={senderTooltip}
                          >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[9px] font-bold text-ink dark:bg-white/[0.15] dark:text-gray-200">
                              {initials(humanName)}
                            </span>
                            {humanName}
                          </p>
                        )}
                        {item.showLabel && origin === "INTERNAL_NOTE" && (
                          <p
                            className="mb-1 flex items-center gap-1 px-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"
                            title={senderTooltip}
                          >
                            <StickyNote className="h-3 w-3" strokeWidth={1.75} />
                            Nota interna
                            <span className="font-normal text-amber-700/80 dark:text-amber-200/70">
                              · {humanName}
                            </span>
                          </p>
                        )}

                        <div
                          className={cn(
                            "px-3 py-2 text-[13px] leading-relaxed",
                            origin === "INTERNAL_NOTE"
                              ? "rounded-2xl border border-amber-500/25 bg-amber-50 text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/[0.1] dark:text-amber-50"
                              : origin === "AI" &&
                                  m.aiApproved === false &&
                                  messageMeta(m).pendingApproval
                                ? "rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] text-ink dark:border-amber-400/30 dark:bg-amber-500/[0.1] dark:text-gray-100"
                                : origin === "AI"
                                  ? "rounded-2xl border border-brand-500/20 bg-brand-500/[0.08] text-ink dark:border-brand-400/25 dark:bg-brand-500/[0.12] dark:text-gray-100"
                                  : origin === "HUMAN"
                                    ? "rounded-2xl bg-ink text-white dark:bg-white dark:text-ink"
                                    : "rounded-2xl border border-black/[0.06] bg-white text-ink dark:border-white/[0.08] dark:bg-[#1a1f29] dark:text-gray-100"
                          )}
                          title={!item.showLabel ? senderTooltip : undefined}
                        >
                          {origin === "AI" &&
                          m.aiApproved === false &&
                          messageMeta(m).pendingApproval ? (
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                              Aguardando aprovação
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p
                            className={cn(
                              "mt-1 text-right text-[10px] tabular-nums",
                              origin === "HUMAN"
                                ? "text-white/[0.55] dark:text-ink/50"
                                : "text-ink-faint"
                            )}
                          >
                            {time}
                          </p>
                          {origin === "AI" &&
                          m.aiApproved === false &&
                          messageMeta(m).pendingApproval ? (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-amber-500/20 pt-2">
                              <button
                                type="button"
                                className="btn-primary h-7 px-2.5 text-[11px]"
                                onClick={() => void approvePendingMessage(m.id)}
                              >
                                Aprovar e enviar
                              </button>
                              <button
                                type="button"
                                className="btn-secondary h-7 px-2.5 text-[11px]"
                                onClick={() => {
                                  const edited = window.prompt("Editar antes de enviar", m.content);
                                  if (edited != null && edited.trim()) {
                                    void approvePendingMessage(m.id, {
                                      content: edited.trim(),
                                    });
                                  }
                                }}
                              >
                                Editar e enviar
                              </button>
                              <button
                                type="button"
                                className="btn-ghost h-7 px-2.5 text-[11px] text-ink-muted"
                                onClick={() =>
                                  void approvePendingMessage(m.id, { discard: true })
                                }
                              >
                                Descartar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              {!isClosed ? (
                <div className="shrink-0 border-t border-line bg-white px-3 py-2.5 dark:border-[#262b36] dark:bg-[#12151c] sm:px-4">
                  {ai && (
                    <div className="mb-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.05] px-3 py-2 dark:bg-brand-500/[0.08]">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                          Sugestão da IA
                        </p>
                        <button
                          type="button"
                          className="text-[10px] text-ink-faint hover:text-ink"
                          onClick={() => setAi(null)}
                        >
                          Fechar
                        </button>
                      </div>
                      {ai.nextAction ? (
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          Próximo passo: {ai.nextAction}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary h-7 text-[11px]"
                          onClick={() => {
                            setMessage(ai.reply);
                            setInternal(false);
                          }}
                        >
                          Usar no campo
                        </button>
                        <button
                          type="button"
                          className="btn-primary h-7 text-[11px]"
                          onClick={() => void sendAiReply()}
                        >
                          Enviar sugestão
                        </button>
                      </div>
                    </div>
                  )}

                  {quickReplies.data && quickReplies.data.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {quickReplies.data.slice(0, 6).map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-ink-secondary hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-gray-300"
                          onClick={() => {
                            setMessage(qr.content);
                            setInternal(false);
                          }}
                        >
                          {qr.title}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mb-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setInternal(false)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                        !internal
                          ? "bg-ink text-white dark:bg-white dark:text-ink"
                          : "text-ink-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                      )}
                    >
                      Responder
                    </button>
                    <button
                      type="button"
                      onClick={() => setInternal(true)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                        internal
                          ? "bg-amber-600 text-white"
                          : "text-ink-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                      )}
                    >
                      Nota interna
                    </button>
                  </div>

                  <form onSubmit={onSend}>
                    <div
                      className={cn(
                        "rounded-xl border px-2.5 pb-2 pt-2 transition-colors",
                        internal
                          ? "border-amber-500/30 bg-amber-50/80 dark:border-amber-400/25 dark:bg-amber-500/[0.07]"
                          : "border-black/[0.08] bg-[#F5F6F8] dark:border-white/[0.08] dark:bg-[#0c0e13]"
                      )}
                    >
                      {internal && (
                        <p className="mb-1.5 px-1 text-[10px] font-medium text-amber-800/90 dark:text-amber-200/90">
                          Visível apenas para a equipe
                        </p>
                      )}
                      <textarea
                        ref={textareaRef}
                        className="max-h-36 min-h-[52px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint dark:text-gray-100"
                        placeholder={
                          internal ? "Adicionar nota interna…" : "Digite uma mensagem…"
                        }
                        value={message}
                        rows={2}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (message.trim() && !sendMutation.isPending) {
                              void sendMutation.mutateAsync({
                                content: message.trim(),
                                isInternal: internal,
                              });
                            }
                          }
                        }}
                      />
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-brand-700 hover:bg-brand-500/10 dark:text-brand-300"
                          onClick={() => void requestAi()}
                          disabled={aiLoading}
                        >
                          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {aiLoading ? "Gerando…" : "Sugerir resposta"}
                        </button>
                        <button
                          type="submit"
                          className={cn(
                            "btn-primary h-8 min-w-[5.5rem] px-3 text-xs",
                            internal && "bg-amber-600 hover:bg-amber-700"
                          )}
                          disabled={sendMutation.isPending || !message.trim()}
                        >
                          {sendMutation.isPending
                            ? "…"
                            : internal
                              ? "Adicionar nota"
                              : "Enviar"}
                          {!internal && !sendMutation.isPending && (
                            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="shrink-0 border-t border-line px-4 py-3 text-center text-xs text-ink-muted dark:border-[#262b36]">
                  Conversa encerrada — reabra para enviar mensagens.
                </div>
              )}
            </>
          )}
        </main>

        {/* ═══ CONTEXTO (desktop) — só com conversa selecionada ═══ */}
        {showContextPanel && (
          <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-line dark:border-[#262b36] lg:flex">
            {conversation ? (
              <ContextPanel
                conversation={conversation}
                score={score}
                scorePct={scorePct}
                scoreOpen={scoreOpen}
                setScoreOpen={setScoreOpen}
                insightsOpen={insightsOpen}
                setInsightsOpen={setInsightsOpen}
                ai={ai}
                setMessage={setMessage}
                setInternal={setInternal}
                sendAiReply={sendAiReply}
              />
            ) : detailQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Spinner />
              </div>
            ) : null}
          </aside>
        )}
      </div>

      {/* Drawer contexto mobile */}
      {mobileContext && conversation && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar"
            onClick={() => setMobileContext(false)}
          />
          <div className="absolute bottom-0 right-0 top-0 flex w-[min(100%,22rem)] flex-col overflow-y-auto bg-white shadow-xl dark:bg-[#12151c]">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5 dark:border-[#262b36]">
              <p className="text-sm font-semibold text-ink dark:text-white">Detalhes</p>
              <button
                type="button"
                className="btn-ghost h-8 px-2 text-xs"
                onClick={() => setMobileContext(false)}
              >
                Fechar
              </button>
            </div>
            <ContextPanel
              conversation={conversation}
              score={score}
              scorePct={scorePct}
              scoreOpen={scoreOpen}
              setScoreOpen={setScoreOpen}
              insightsOpen={insightsOpen}
              setInsightsOpen={setInsightsOpen}
              ai={ai}
              setMessage={setMessage}
              setInternal={setInternal}
              sendAiReply={sendAiReply}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ContextPanel({
  conversation,
  score,
  scorePct,
  scoreOpen,
  setScoreOpen,
  insightsOpen,
  setInsightsOpen,
  ai,
  setMessage,
  setInternal,
  sendAiReply,
}: {
  conversation: ConversationDetail;
  score: number;
  scorePct: number;
  scoreOpen: boolean;
  setScoreOpen: (v: boolean) => void;
  insightsOpen: boolean;
  setInsightsOpen: (v: boolean) => void;
  ai: AiSuggestion | null;
  setMessage: (v: string) => void;
  setInternal: (v: boolean) => void;
  sendAiReply: () => void;
}) {
  const breakdown = Array.isArray(conversation.contact.scoreBreakdown)
    ? conversation.contact.scoreBreakdown
    : [];

  return (
    <div className="space-y-5 p-4">
      <Section title="Contato">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-sm font-semibold dark:bg-white/10">
            {initials(conversation.contact.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-semibold text-ink dark:text-white">
              {conversation.contact.name}
            </p>
            <p className="truncate text-[12px] text-ink-muted">
              {conversation.contact.phone || "Sem telefone"}
            </p>
            {conversation.contact.email ? (
              <p className="truncate text-[12px] text-ink-muted">{conversation.contact.email}</p>
            ) : null}
          </div>
        </div>
        {conversation.contact.tags && conversation.contact.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {conversation.contact.tags.map((t) => (
              <span
                key={t.tag.id}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ background: t.tag.color }}
              >
                {t.tag.name}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Atendimento">
        <div className="space-y-1.5 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <MetaRow
            label="Status"
            value={statusLabel[conversation.status] || conversation.status}
          />
          <MetaRow
            label="Responsável"
            value={conversation.assignedTo?.name || "Não atribuído"}
          />
          <MetaRow
            label="Canal"
            value={conversation.channel?.name || conversation.channel?.type || "—"}
          />
          <MetaRow label="Modo" value={attendanceLabel(conversation)} />
        </div>
      </Section>

      <Section title="Comercial">
        <div className="space-y-1.5 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <MetaRow
            label="Status"
            value={
              commercialStatusLabel[conversation.contact.commercialStatus || ""] ||
              conversation.contact.commercialStatus ||
              "Novo"
            }
          />
          <MetaRow
            label="Prioridade"
            value={
              leadPriorityLabel[conversation.contact.priority || ""] ||
              conversation.contact.priority ||
              "Normal"
            }
          />
          <div>
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="text-ink-muted">Score</span>
              <span className="font-medium tabular-nums text-ink dark:text-gray-100">
                {score}/100
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${scorePct}%` }}
              />
            </div>
            {breakdown.length > 0 && (
              <button
                type="button"
                className="mt-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400"
                onClick={() => setScoreOpen(!scoreOpen)}
              >
                {scoreOpen ? "Ocultar detalhes" : "Ver detalhes do score"}
              </button>
            )}
            {scoreOpen && breakdown.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-ink-muted">
                {breakdown.map((r, i) => (
                  <li key={i} className="leading-snug">
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {conversation.contact.nextAction ? (
          <div className="mt-2 rounded-xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              Próxima ação
            </p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-ink dark:text-white">
              {conversation.contact.nextAction}
            </p>
          </div>
        ) : null}
      </Section>

      {(conversation.aiSummary ||
        conversation.contact.memory?.summary ||
        conversation.aiIntent ||
        conversation.aiSentiment) && (
        <Section
          title="Insights"
          action={
            <button
              type="button"
              className="text-ink-faint"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-label="Recolher"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  !insightsOpen && "-rotate-90"
                )}
              />
            </button>
          }
        >
          {insightsOpen && (
            <div className="space-y-2 rounded-xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
              {conversation.aiIntent ? (
                <MetaRow label="Intenção" value={conversation.aiIntent} />
              ) : null}
              {conversation.aiSentiment ? (
                <MetaRow label="Tom" value={conversation.aiSentiment} />
              ) : null}
              {(conversation.aiSummary || conversation.contact.memory?.summary) && (
                <div>
                  <p className="text-[11px] text-ink-muted">Resumo</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary dark:text-gray-300">
                    {conversation.aiSummary || conversation.contact.memory?.summary}
                  </p>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {ai && (
        <Section title="Sugestão">
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.04] p-3 dark:bg-brand-500/[0.08]">
            {ai.summary ? (
              <p className="text-[12px] leading-relaxed text-ink-muted">{ai.summary}</p>
            ) : null}
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink dark:text-gray-100">
              {ai.reply}
            </p>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                className="btn-secondary h-7 flex-1 text-[11px]"
                onClick={() => {
                  setMessage(ai.reply);
                  setInternal(false);
                }}
              >
                Usar
              </button>
              <button
                type="button"
                className="btn-primary h-7 flex-1 text-[11px]"
                onClick={() => void sendAiReply()}
              >
                Enviar
              </button>
            </div>
          </div>
        </Section>
      )}

      {conversation.notes?.length > 0 && (
        <Section title="Notas">
          <div className="space-y-2">
            {conversation.notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-amber-500/[0.15] bg-amber-500/[0.06] px-2.5 py-2 text-[12px] dark:bg-amber-500/[0.08]"
              >
                <p className="text-ink-secondary dark:text-gray-200">{n.content}</p>
                <p className="mt-1 text-[10px] text-ink-faint">
                  {n.author.name} · {formatDate(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
