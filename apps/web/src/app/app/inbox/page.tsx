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
  Filter,
  ArrowRightLeft,
  Clock,
  Inbox,
  ListTodo,
  Hourglass,
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
  useToast,
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

/**
 * Navegação operacional principal da Central de Atendimento.
 * Substitui o par antigo (escopo + status chips) que competia visualmente.
 */
type OpsNav = "inbox" | "mine" | "waiting" | "ai" | "closed";

const OPS_NAV_ITEMS: Array<{
  id: OpsNav;
  label: string;
  hint: string;
  icon: typeof Inbox;
}> = [
  { id: "inbox", label: "Caixa de entrada", hint: "Conversas abertas", icon: Inbox },
  { id: "mine", label: "Minha fila", hint: "Atribuídas a você", icon: ListTodo },
  {
    id: "waiting",
    label: "Aguardando atendimento",
    hint: "Fila humana — handoff da IA",
    icon: Hourglass,
  },
  { id: "ai", label: "IA", hint: "IA atendendo sem humano", icon: Bot },
  { id: "closed", label: "Encerradas", hint: "Finalizadas", icon: CheckCircle2 },
];

/** Monta query da lista a partir da nav operacional + filtros secundários. */
function buildConversationParams(opts: {
  opsNav: OpsNav;
  search: string;
  userId?: string;
  unreadOnly: boolean;
  needsApproval: boolean;
  archived: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.search.trim()) params.set("search", opts.search.trim());
  if (opts.unreadOnly) params.set("unread", "1");
  if (opts.needsApproval) params.set("pendingApproval", "1");

  switch (opts.opsNav) {
    case "inbox":
      params.set("status", "OPEN");
      break;
    case "mine":
      // Sem status: OPEN + PENDING atribuídos a mim (excluímos CLOSED no client se vier)
      if (opts.userId) params.set("assignedToId", opts.userId);
      break;
    case "waiting":
      params.set("status", "PENDING");
      params.set("unassigned", "1");
      break;
    case "ai":
      params.set("status", "OPEN");
      params.set("unassigned", "1");
      break;
    case "closed":
      params.set("status", opts.archived ? "ARCHIVED" : "CLOSED");
      break;
  }
  return params;
}

/** Tempo de espera a partir de timestamp (ex.: última msg / entrada na fila). */
function waitDuration(from?: string | null): {
  label: string;
  tone: "normal" | "warn" | "late";
} | null {
  if (!from) return null;
  const ms = Date.now() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  let label: string;
  if (mins < 1) label = "<1 min";
  else if (mins < 60) label = `${mins} min`;
  else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    label = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const tone = mins >= 30 ? "late" : mins >= 10 ? "warn" : "normal";
  return { label, tone };
}

function waitToneClass(tone: "normal" | "warn" | "late") {
  if (tone === "late") return "text-rose-700 dark:text-rose-300";
  if (tone === "warn") return "text-amber-700 dark:text-amber-300";
  return "text-ink-muted dark:text-zinc-500";
}

/**
 * Empty / soft-error — quiet, no card wall, no instructional tips.
 * `compact` = coluna da lista (mais denso).
 */
function QuietEmpty({
  title,
  description,
  withIcon = true,
  compact = false,
  action,
}: {
  title: string;
  description?: string;
  withIcon?: boolean;
  compact?: boolean;
  action?: ReactNode;
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
            "flex items-center justify-center rounded-full text-ink-faint/90 dark:text-zinc-500",
            compact
              ? "h-8 w-8 bg-black/[0.03] dark:bg-white/[0.04]"
              : "h-11 w-11 bg-black/[0.04] dark:bg-white/[0.05]"
          )}
          aria-hidden
        >
          <MessageSquare
            className={compact ? "h-3.5 w-3.5" : "h-5 w-5"}
            strokeWidth={1.5}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <p
          className={cn(
            "tracking-tight",
            compact
              ? "text-[12.5px] font-medium text-ink-muted dark:text-zinc-400"
              : "text-[14px] font-medium text-ink dark:text-zinc-200"
          )}
        >
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              "leading-relaxed text-ink-faint dark:text-zinc-500",
              compact ? "text-[11px]" : "text-[12.5px]"
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
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

type HandoffKind = "human" | "pending" | "ai" | "paused" | "closed" | "idle";

/**
 * Status operacional de handoff — linguagem de atendimento (única fonte).
 * Não repetir o mesmo texto no header, lista e badges ao mesmo tempo.
 */
function handoffStatus(c: {
  assignedTo?: { id: string; name: string } | null;
  status?: string;
  viewerOwns?: boolean;
}): {
  label: string;
  kind: HandoffKind;
  /** Linha curta para item da fila (ex.: "Aguardando" / "IA" / nome) */
  short: string;
  /** Quem atende / fila */
  ownerLine: string;
} {
  if (c.status === "CLOSED" || c.status === "ARCHIVED") {
    return {
      label: c.status === "ARCHIVED" ? "Arquivada" : "Encerrada",
      kind: "closed",
      short: c.status === "ARCHIVED" ? "Arquivada" : "Encerrada",
      ownerLine: c.assignedTo?.name || "—",
    };
  }
  if (c.viewerOwns && c.assignedTo?.name) {
    return {
      label: "Atendimento humano",
      kind: "paused",
      short: "Você",
      ownerLine: "Você",
    };
  }
  if (c.assignedTo?.name) {
    return {
      label: "Atendimento humano",
      kind: "human",
      short: c.assignedTo.name.split(" ")[0] || c.assignedTo.name,
      ownerLine: c.assignedTo.name,
    };
  }
  if (c.status === "PENDING") {
    return {
      label: "Aguardando atendimento",
      kind: "pending",
      short: "Aguardando",
      ownerLine: "Fila humana",
    };
  }
  return {
    label: "IA atendendo",
    kind: "ai",
    short: "IA",
    ownerLine: "Fila / IA",
  };
}

function handoffToneClass(kind: HandoffKind) {
  switch (kind) {
    case "pending":
      return "text-amber-700 dark:text-amber-300";
    case "ai":
      return "text-violet-700 dark:text-violet-300";
    case "paused":
      return "text-emerald-700 dark:text-emerald-300";
    case "human":
      return "text-ink-secondary dark:text-zinc-300";
    case "closed":
      return "text-ink-faint dark:text-zinc-500";
    default:
      return "text-ink-muted dark:text-zinc-400";
  }
}

function channelShort(type?: string, name?: string) {
  if (name && name.trim()) return name;
  const t = (type || "").toUpperCase();
  if (t.includes("WHATSAPP") || t === "WA") return "WhatsApp";
  if (t.includes("INSTAGRAM") || t === "IG") return "Instagram";
  if (t.includes("WEB") || t === "WIDGET") return "Web";
  if (t.includes("EMAIL")) return "E-mail";
  return type || "Canal";
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
  /** Painel de contexto: cabeçalho com divisória sky/teal (workspace de atendimento). */
  context = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  context?: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          context &&
            "border-b border-sky-500/20 pb-2 dark:border-teal-400/25"
        )}
      >
        <h4
          className={cn(
            "flex min-w-0 items-center gap-2 text-[12px] font-semibold tracking-tight",
            context
              ? "text-sky-900 dark:text-sky-100/95"
              : "text-ink dark:text-zinc-200"
          )}
        >
          {context ? (
            <span
              className="h-3.5 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-sky-500 to-teal-500"
              aria-hidden
            />
          ) : null}
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
      <span className="shrink-0 text-ink-muted dark:text-zinc-500">{label}</span>
      <span className="min-w-0 text-right font-medium leading-snug text-ink dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

/** Segmented control compacto (escopo / modo do composer). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full rounded-lg border border-black/[0.07] bg-black/[0.03] p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]",
        size === "md" && "p-0.5"
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-md text-center font-medium transition-colors duration-150",
              size === "sm" ? "px-1.5 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]",
              active
                ? "bg-white text-ink shadow-sm dark:bg-[#1c1f28] dark:text-zinc-100"
                : "text-ink-muted hover:text-ink dark:text-zinc-500 dark:hover:text-zinc-300"
            )}
          >
            {opt.label}
          </button>
        );
      })}
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
  const { toast } = useToast();
  const { user, tenant } = useAuth();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("id") || searchParams.get("c")
  );
  const statusFromUrl = (searchParams.get("status") || "").toUpperCase();
  const navFromUrl = (searchParams.get("nav") || "").toLowerCase();

  const initialNav = ((): OpsNav => {
    if (["inbox", "mine", "waiting", "ai", "closed"].includes(navFromUrl)) {
      return navFromUrl as OpsNav;
    }
    if (statusFromUrl === "PENDING") return "waiting";
    if (statusFromUrl === "CLOSED" || statusFromUrl === "ARCHIVED") return "closed";
    return "inbox";
  })();

  const [opsNav, setOpsNav] = useState<OpsNav>(initialNav);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [archivedView, setArchivedView] = useState(statusFromUrl === "ARCHIVED");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState<string>("");
  const [transferNote, setTransferNote] = useState("");
  const [searchInput, setSearchInput] = useState("");
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
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateTimestamp = () => setCurrentTimestamp(Date.now());
    updateTimestamp();
    const intervalId = window.setInterval(updateTimestamp, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const s = (searchParams.get("status") || "").toUpperCase();
    const n = (searchParams.get("nav") || "").toLowerCase();
    if (["inbox", "mine", "waiting", "ai", "closed"].includes(n)) {
      setOpsNav(n as OpsNav);
    } else if (s === "PENDING") {
      setOpsNav("waiting");
    } else if (s === "CLOSED") {
      setOpsNav("closed");
      setArchivedView(false);
    } else if (s === "ARCHIVED") {
      setOpsNav("closed");
      setArchivedView(true);
    }
    const id = searchParams.get("id") || searchParams.get("c");
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    if (!filtersOpen) return;
    function onDoc(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filtersOpen]);

  /** Debounce da busca — evita request a cada tecla. */
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const memberRole = tenant?.role || "";
  const canHardDelete =
    user?.platformRole === "SUPERADMIN" ||
    memberRole === "ADMIN" ||
    memberRole === "SUPERVISOR";

  const listParamsKey = useMemo(
    () =>
      buildConversationParams({
        opsNav,
        search,
        userId: user?.id,
        unreadOnly,
        needsApproval,
        archived: archivedView,
      }).toString(),
    [opsNav, search, user?.id, unreadOnly, needsApproval, archivedView]
  );

  const listQuery = useQuery({
    queryKey: ["conversations", listParamsKey, user?.id],
    queryFn: () => {
      const params = buildConversationParams({
        opsNav,
        search,
        userId: user?.id,
        unreadOnly,
        needsApproval,
        archived: archivedView,
      });
      return api<{ items: ConversationListItem[]; total?: number }>(
        `/conversations?${params}`
      );
    },
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  });

  /** Contadores leves por aba (limit=1 → usa total da API). */
  const navCountsQuery = useQuery({
    queryKey: ["conversation-nav-counts", user?.id],
    queryFn: async () => {
      const bases: OpsNav[] = ["inbox", "mine", "waiting", "ai", "closed"];
      const entries = await Promise.all(
        bases.map(async (nav) => {
          const p = buildConversationParams({
            opsNav: nav,
            search: "",
            userId: user?.id,
            unreadOnly: false,
            needsApproval: false,
            archived: false,
          });
          p.set("limit", "1");
          p.set("page", "1");
          try {
            const r = await api<{ total?: number }>(`/conversations?${p}`);
            return [nav, r.total ?? 0] as const;
          } catch {
            return [nav, 0] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<OpsNav, number>;
    },
    staleTime: 12_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  /** Realtime leve: contadores e lista acompanham eventos do shell. */
  useEffect(() => {
    function onUpdated() {
      void qc.invalidateQueries({ queryKey: ["conversation-nav-counts"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    }
    window.addEventListener("nexaflow:conversation-updated", onUpdated);
    window.addEventListener("nexaflow:notification", onUpdated);
    return () => {
      window.removeEventListener("nexaflow:conversation-updated", onUpdated);
      window.removeEventListener("nexaflow:notification", onUpdated);
    };
  }, [qc]);

  const teamQuery = useQuery({
    queryKey: ["team-for-transfer"],
    queryFn: () =>
      api<{
        members: Array<{
          user: { id: string; name: string; email?: string; isActive?: boolean };
          isActive?: boolean;
        }>;
      }>("/team"),
    enabled: transferOpen,
    retry: false,
    staleTime: 60_000,
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
        // queryKey: ["conversations", listParamsKey, userId]
        const paramsKey = String(key[1] ?? "");
        const stillMatches =
          (newStatus === "OPEN" && paramsKey.includes("status=OPEN")) ||
          (newStatus === "PENDING" && paramsKey.includes("status=PENDING")) ||
          (newStatus === "CLOSED" && paramsKey.includes("status=CLOSED")) ||
          (newStatus === "ARCHIVED" && paramsKey.includes("status=ARCHIVED")) ||
          (!paramsKey.includes("status=") &&
            newStatus !== "CLOSED" &&
            newStatus !== "ARCHIVED");
        const nextItems = stillMatches
          ? data.items.map((c) =>
              c.id === id ? { ...c, status: newStatus, isUnread: false } : c
            )
          : data.items.filter((c) => c.id !== id);
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
        if (typeof payload.status === "string") {
          await qc.refetchQueries({ queryKey: ["conversations"] });
        }
      }
      await qc.refetchQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["conversation-nav-counts"] });
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
    mutationFn: (payload?: { userId?: string | null; note?: string }) =>
      api(`/conversations/${selectedId}/assign`, {
        method: "POST",
        json: payload && Object.keys(payload).length ? payload : {},
      }),
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-nav-counts"] });
      qc.invalidateQueries({ queryKey: ["human-queue-pending"] });
      if (payload?.userId) {
        setTransferOpen(false);
        setTransferUserId("");
        setTransferNote("");
      }
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Não foi possível concluir a atribuição.";
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

  const rawItems = listQuery.data?.items || [];
  /** Minha fila: só abertas/pendentes (API não filtra multi-status). */
  const items =
    opsNav === "mine"
      ? rawItems.filter((c) => c.status === "OPEN" || c.status === "PENDING")
      : rawItems;
  const listTotal =
    opsNav === "mine"
      ? items.length
      : listQuery.data?.total ?? items.length;
  const conversation = detailQuery.data;
  const isClosed =
    conversation?.status === "CLOSED" || conversation?.status === "ARCHIVED";
  const iOwnIt = conversation?.assignedTo?.id === user?.id;
  const hasHuman = Boolean(conversation?.assignedTo);
  const navCounts = navCountsQuery.data;

  /** Filtros secundários / busca — não confundir com troca de fila. */
  const hasSecondaryFilters =
    Boolean(search.trim()) ||
    unreadOnly ||
    needsApproval ||
    (opsNav === "closed" && archivedView);

  const secondaryFilterCount =
    (unreadOnly ? 1 : 0) +
    (needsApproval ? 1 : 0) +
    (opsNav === "closed" && archivedView ? 1 : 0);

  /** Ação primária contextual do header — uma só. */
  type PrimaryAction = "assume" | "transfer" | "resume_ai" | "reopen" | null;
  const primaryAction: PrimaryAction = (() => {
    if (!conversation) return null;
    if (isClosed) return "reopen";
    if (!hasHuman || conversation.status === "PENDING") return "assume";
    if (iOwnIt) return "resume_ai";
    return null;
  })();

  const transferMembers = useMemo(() => {
    const members = teamQuery.data?.members || [];
    return members
      .filter((m) => m.user?.id && m.user.id !== user?.id && m.isActive !== false)
      .map((m) => m.user);
  }, [teamQuery.data, user?.id]);

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
    } catch (err: unknown) {
      toast({
        kind: "error",
        title: opts?.discard ? "Não foi possível descartar" : "Não foi possível aprovar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }
  const listEmpty = !listQuery.isLoading && items.length === 0;
  /** Coluna direita só com conversa selecionada (e toggle aberto) */
  const showContextPanel = Boolean(selectedId) && contextOpen;

  /**
   * Empty states — não duplicar a mesma mensagem lista × centro.
   * A: há itens, nada selecionado → centro “Selecione…”
   * B: fila atual vazia → lista compacta
   * C: tenant sem conversas ativas → centro “Nenhuma conversa aberta…”
   */
  const openQueueTotal =
    (navCounts?.inbox ?? 0) +
    (navCounts?.mine ?? 0) +
    (navCounts?.waiting ?? 0) +
    (navCounts?.ai ?? 0);
  const noOpenAtAll =
    !listQuery.isLoading &&
    !navCountsQuery.isLoading &&
    openQueueTotal === 0 &&
    opsNav !== "closed" &&
    !hasSecondaryFilters;

  const listEmptyLabel = hasSecondaryFilters
    ? "Nenhuma conversa neste filtro"
    : "Nenhuma conversa nesta fila.";

  const centerEmpty = (() => {
    if (noOpenAtAll) {
      return {
        title: "Tudo em dia",
        description: "Nenhuma conversa aberta no momento.",
        soft: null as string | null,
      };
    }
    if (listEmpty) {
      const softParts: string[] = [];
      if (navCounts?.waiting) softParts.push(`${navCounts.waiting} aguardando atendimento`);
      if (navCounts?.mine) softParts.push(`${navCounts.mine} na sua fila`);
      if (navCounts?.ai) softParts.push(`${navCounts.ai} com a IA`);
      return {
        title: "Selecione uma conversa",
        description: "Escolha uma conversa na lista para abrir o atendimento.",
        soft: softParts.length ? softParts.join(" · ") : null,
      };
    }
    return {
      title: "Selecione uma conversa",
      description: "Escolha uma conversa na lista para abrir o atendimento.",
      soft: null as string | null,
    };
  })();

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
    <div className="nf-mod nf-mod--inbox nf-mod--bleed flex min-h-0 flex-col">
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

      <Modal
        open={transferOpen}
        onClose={() => !assignMutation.isPending && setTransferOpen(false)}
        title="Transferir atendimento"
        description="Escolha o atendente. A nota é interna e não vai ao cliente."
        size="md"
        preventClose={assignMutation.isPending}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary h-9 text-sm"
              disabled={assignMutation.isPending}
              onClick={() => setTransferOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-9 text-sm"
              disabled={assignMutation.isPending || !transferUserId}
              onClick={() => {
                if (!transferUserId) return;
                assignMutation.mutate({
                  userId: transferUserId,
                  note: transferNote.trim() || undefined,
                });
              }}
            >
              {assignMutation.isPending ? "Transferindo…" : "Transferir"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {teamQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : teamQuery.isError ? (
            <QuietEmpty
              title="Não foi possível carregar a equipe"
              description="Só quem tem permissão de equipe vê a lista. Você ainda pode devolver à fila."
              compact
              withIcon={false}
              action={
                <button
                  type="button"
                  className="btn-secondary h-8 text-xs"
                  onClick={() => {
                    if (
                      confirm(
                        "Devolver este atendimento à fila humana?\n\nFica aguardando outro atendente. A IA não retoma automaticamente."
                      )
                    ) {
                      assignMutation.mutate({ userId: null });
                      setTransferOpen(false);
                    }
                  }}
                >
                  Devolver à fila
                </button>
              }
            />
          ) : transferMembers.length === 0 ? (
            <QuietEmpty
              title="Nenhum colega disponível"
              description="Não há outros membros ativos para transferir."
              compact
              withIcon={false}
            />
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {transferMembers.map((m) => {
                const active = transferUserId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTransferUserId(m.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-sky-500/40 bg-sky-500/[0.08] dark:border-sky-400/35 dark:bg-sky-400/[0.1]"
                        : "border-black/[0.06] hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[11px] font-semibold dark:bg-white/10">
                      {initials(m.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink dark:text-zinc-100">
                        {m.name}
                      </span>
                      {m.email ? (
                        <span className="block truncate text-[11px] text-ink-faint dark:text-zinc-500">
                          {m.email}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <FormField label="Nota interna (opcional)">
            <textarea
              className="input min-h-[64px] w-full resize-none text-[13px]"
              placeholder="Contexto para quem receber — não é enviado ao cliente"
              value={transferNote}
              maxLength={500}
              onChange={(e) => setTransferNote(e.target.value)}
            />
          </FormField>
          <button
            type="button"
            className="text-[12px] font-medium text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => {
              if (
                confirm(
                  "Devolver este atendimento à fila humana?\n\nFica aguardando outro atendente."
                )
              ) {
                assignMutation.mutate({ userId: null });
                setTransferOpen(false);
              }
            }}
          >
            Ou devolver à fila (sem atendente)
          </button>
        </div>
      </Modal>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]",
          showContextPanel
            ? "lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)_minmax(300px,340px)]"
            : "lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]"
        )}
      >
        {/* ═══ FILA / INBOX ═══ */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-r border-black/[0.05] bg-[var(--surface-raised)] dark:border-white/[0.06] dark:bg-transparent",
            selectedId ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="shrink-0 space-y-2 border-b border-black/[0.06] px-3 py-2.5 dark:border-white/[0.07]">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h1 className="font-display text-[15px] font-semibold tracking-tight text-ink dark:text-white">
                Conversas
              </h1>
              {listTotal > 0 ? (
                <span className="tabular-nums text-[11px] font-medium text-ink-muted dark:text-zinc-400">
                  {listTotal}
                </span>
              ) : null}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted/80 dark:text-zinc-500" />
              <input
                className="input h-8 pl-8 text-[12.5px]"
                placeholder="Buscar conversas..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Buscar conversas"
              />
            </div>

            <nav className="space-y-0.5" aria-label="Filas de atendimento">
              {OPS_NAV_ITEMS.map((item) => {
                const active = opsNav === item.id;
                const count = navCounts?.[item.id];
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.hint}
                    onClick={() => {
                      setOpsNav(item.id);
                      if (item.id !== "closed") setArchivedView(false);
                    }}
                    className={cn(
                      "relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pl-2.5 text-left transition-colors duration-150",
                      active
                        ? "bg-violet-500/[0.12] text-ink dark:bg-white/[0.08] dark:text-zinc-50"
                        : "text-ink-secondary hover:bg-black/[0.035] dark:text-zinc-400 dark:hover:bg-white/[0.045] dark:hover:text-zinc-200"
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-full bg-violet-500 dark:bg-violet-400"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active
                          ? "text-violet-600 dark:text-violet-300"
                          : "text-ink-muted dark:text-zinc-500"
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {item.label}
                    </span>
                    {typeof count === "number" && count > 0 ? (
                      <span
                        className={cn(
                          "tabular-nums text-[11px] font-medium",
                          active
                            ? "text-ink-secondary dark:text-zinc-300"
                            : item.id === "waiting"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-ink-muted dark:text-zinc-500"
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="relative" ref={filtersRef}>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium transition-colors duration-150",
                  secondaryFilterCount > 0 || filtersOpen
                    ? "border-violet-500/30 bg-violet-500/[0.08] text-violet-900 dark:border-violet-400/30 dark:bg-violet-400/[0.1] dark:text-violet-100"
                    : "border-black/[0.08] text-ink-secondary hover:bg-black/[0.03] dark:border-white/[0.09] dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-300"
                )}
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
              >
                <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
                {secondaryFilterCount > 0
                  ? `Filtros · ${secondaryFilterCount}`
                  : "Filtros"}
              </button>
              {filtersOpen ? (
                <div className="absolute left-0 right-0 z-20 mt-1 space-y-1 rounded-xl border border-black/[0.08] bg-white p-2 shadow-lg dark:border-white/[0.1] dark:bg-[#161a22]">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      className="rounded border-black/20"
                      checked={unreadOnly}
                      onChange={(e) => setUnreadOnly(e.target.checked)}
                    />
                    Não lidas
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      className="rounded border-black/20"
                      checked={needsApproval}
                      onChange={(e) => setNeedsApproval(e.target.checked)}
                    />
                    Aguardando aprovação da IA
                  </label>
                  {opsNav === "closed" ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        className="rounded border-black/20"
                        checked={archivedView}
                        onChange={(e) => setArchivedView(e.target.checked)}
                      />
                      Arquivadas
                    </label>
                  ) : null}
                  {secondaryFilterCount > 0 ? (
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[11.5px] font-medium text-sky-800 hover:bg-sky-500/10 dark:text-sky-300"
                      onClick={() => {
                        setUnreadOnly(false);
                        setNeedsApproval(false);
                        setArchivedView(false);
                      }}
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="flex justify-center p-10">
                <Spinner />
              </div>
            )}
            {listQuery.isError && !listQuery.isLoading && (
              <div className="flex justify-center px-3 pt-8 pb-4">
                <QuietEmpty
                  title="Não foi possível carregar"
                  description="Tente de novo em instantes."
                  compact
                  action={
                    <button
                      type="button"
                      className="btn-secondary h-7 text-[11px]"
                      onClick={() => void listQuery.refetch()}
                    >
                      Tentar novamente
                    </button>
                  }
                />
              </div>
            )}
            {listEmpty && !listQuery.isError && (
              <div className="px-3 py-6">
                <p className="text-center text-[12px] font-medium text-ink-muted dark:text-zinc-500">
                  {listEmptyLabel}
                </p>
              </div>
            )}
            {items.map((c) => {
              const selected = selectedId === c.id;
              const handoff = handoffStatus({
                ...c,
                viewerOwns: c.assignedTo?.id === user?.id,
              });
              const showWait =
                handoff.kind === "pending" ? waitDuration(c.lastMessageAt) : null;
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
                    "nf-inbox-list-item relative w-full border-b border-black/[0.04] px-3 py-2.5 text-left dark:border-white/[0.04]",
                    selected && "is-active",
                    !selected && "hover:bg-black/[0.025] dark:hover:bg-white/[0.03]",
                    c.isUnread && !selected && "bg-black/[0.012] dark:bg-white/[0.015]",
                    handoff.kind === "pending" &&
                      !selected &&
                      "bg-amber-500/[0.035] dark:bg-amber-500/[0.04]"
                  )}
                >
                  {selected && (
                    <span
                      className="absolute bottom-2 left-0 top-2 w-[2.5px] rounded-full bg-violet-500 dark:bg-violet-400"
                      aria-hidden
                    />
                  )}
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold",
                          handoff.kind === "pending"
                            ? "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"
                            : c.isUnread
                              ? "bg-sky-500/15 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100"
                              : "bg-surface-subtle text-ink-secondary dark:bg-white/10 dark:text-zinc-200"
                        )}
                      >
                        {initials(c.contact.name)}
                      </div>
                      {c.isUnread && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-[#12151c]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-[13px] text-ink dark:text-zinc-100",
                            c.isUnread || handoff.kind === "pending"
                              ? "font-semibold"
                              : "font-medium"
                          )}
                        >
                          {c.contact.name}
                        </p>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-faint dark:text-zinc-500">
                          {showWait ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 font-medium",
                                waitToneClass(showWait.tone)
                              )}
                              title="Tempo de espera"
                            >
                              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                              {showWait.label}
                            </span>
                          ) : (
                            formatMsgTime(c.lastMessageAt)
                          )}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 line-clamp-2 text-[12px] leading-snug",
                          c.isUnread
                            ? "text-ink-secondary dark:text-zinc-300"
                            : "text-ink-muted dark:text-zinc-500"
                        )}
                      >
                        {c.lastMessagePreview || "Sem mensagens"}
                      </p>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px]">
                        <span className="truncate text-ink-faint dark:text-zinc-500">
                          {channelShort(c.channel?.type, c.channel?.name)}
                        </span>
                        <span className="text-ink-faint/60" aria-hidden>
                          ·
                        </span>
                        <span
                          className={cn(
                            "truncate font-medium",
                            handoffToneClass(handoff.kind)
                          )}
                        >
                          {handoff.kind === "pending"
                            ? "Aguardando atendimento"
                            : handoff.short}
                        </span>
                        {c.contact.priority === "HIGH" ||
                        c.contact.priority === "URGENT" ? (
                          <span className="rounded bg-rose-500/10 px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                            {leadPriorityLabel[c.contact.priority] || c.contact.priority}
                          </span>
                        ) : null}
                        {c.isFavorite ? (
                          <Star
                            className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400"
                            aria-label="Importante"
                          />
                        ) : null}
                      </div>
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
            "flex min-h-0 min-w-0 flex-col bg-[#F3F5F8]/80 dark:bg-black/20",
            selectedId ? "flex" : "hidden lg:flex"
          )}
        >
          {!selectedId && (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F4F5F7] px-6 pb-[8vh] dark:bg-[#0a0c10]">
              <QuietEmpty
                title={centerEmpty.title}
                description={centerEmpty.description}
                withIcon={!noOpenAtAll}
              />
              {centerEmpty.soft ? (
                <p className="mt-3 text-center text-[12px] tabular-nums text-ink-muted dark:text-zinc-500">
                  {centerEmpty.soft}
                </p>
              ) : null}
            </div>
          )}
          {selectedId && detailQuery.isLoading && (
            <div className="flex flex-1 items-center justify-center bg-[#F4F5F7] dark:bg-[#0a0c10]">
              <Spinner />
            </div>
          )}
          {selectedId && detailQuery.isError && !detailQuery.isLoading && (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F4F5F7] px-6 dark:bg-[#0a0c10]">
              <QuietEmpty
                title="Não foi possível abrir a conversa"
                description="Verifique a conexão e tente de novo."
                action={
                  <button
                    type="button"
                    className="btn-secondary h-8 text-xs"
                    onClick={() => void detailQuery.refetch()}
                  >
                    Tentar novamente
                  </button>
                }
              />
            </div>
          )}
          {conversation && (
            <>
              {/* Header operacional — status uma vez + uma ação primária */}
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5 dark:border-[#262b36] sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    className="btn-ghost h-8 w-8 shrink-0 px-0 lg:hidden"
                    aria-label="Voltar para a lista"
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
                    {(() => {
                      const handoff = handoffStatus({
                        ...conversation,
                        viewerOwns: iOwnIt,
                      });
                      /** Uma linha operacional forte — sem repetir status em badge/botão. */
                      const statusLine = (() => {
                        if (handoff.kind === "ai") return "IA atendendo";
                        if (handoff.kind === "pending") return "Aguardando atendimento";
                        if (handoff.kind === "paused") return "Atendimento humano · Você";
                        if (handoff.kind === "human" && conversation.assignedTo?.name) {
                          return `Atendimento humano · ${conversation.assignedTo.name.split(" ")[0]}`;
                        }
                        if (handoff.kind === "closed") {
                          const reason = conversation.closeReason
                            ? CLOSE_REASON_LABEL[conversation.closeReason] ||
                              conversation.closeReason
                            : null;
                          return reason
                            ? `${handoff.label} · ${reason}`
                            : handoff.label;
                        }
                        return handoff.label;
                      })();
                      return (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-muted dark:text-zinc-400">
                          <span>
                            {channelShort(
                              conversation.channel?.type,
                              conversation.channel?.name
                            )}
                          </span>
                          <span className="text-ink-faint" aria-hidden>
                            ·
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 font-semibold",
                              handoffToneClass(handoff.kind)
                            )}
                            title="Status do atendimento"
                          >
                            {handoff.kind === "ai" ? (
                              <Bot className="h-3 w-3" strokeWidth={1.75} />
                            ) : null}
                            {handoff.kind === "paused" || handoff.kind === "human" ? (
                              <User className="h-3 w-3" strokeWidth={1.75} />
                            ) : null}
                            {handoff.kind === "pending" ? (
                              <Hourglass className="h-3 w-3" strokeWidth={1.75} />
                            ) : null}
                            {statusLine}
                          </span>
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {primaryAction === "assume" && (
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
                          assignMutation.mutate({});
                        }
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {assignMutation.isPending ? "Assumindo…" : "Assumir atendimento"}
                    </button>
                  )}
                  {primaryAction === "resume_ai" && (
                    <button
                      type="button"
                      className="btn-primary h-8 text-xs"
                      disabled={resumeAiMutation.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            "Devolver atendimento para IA?\n\nA IA voltará a responder de acordo com as regras do agente."
                          )
                        ) {
                          resumeAiMutation.mutate();
                        }
                      }}
                    >
                      <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {resumeAiMutation.isPending ? "Devolvendo…" : "Devolver para IA"}
                    </button>
                  )}
                  {primaryAction === "reopen" && (
                    <button
                      type="button"
                      className="btn-primary h-8 text-xs"
                      disabled={actionMutation.isPending}
                      onClick={confirmReopen}
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Reabrir
                    </button>
                  )}
                  {!isClosed && hasHuman && !iOwnIt && conversation.assignedTo?.name ? (
                    <span className="hidden h-8 max-w-[10rem] items-center truncate rounded-lg border border-black/[0.06] px-2.5 text-[11px] font-medium text-ink-secondary dark:border-white/[0.08] dark:text-zinc-300 sm:inline-flex">
                      {conversation.assignedTo.name}
                    </span>
                  ) : null}

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
                                  "Devolver atendimento para IA?\n\nA IA voltará a responder de acordo com as regras do agente."
                                )
                              ) {
                                resumeAiMutation.mutate();
                              }
                            }}
                          >
                            <Bot className="h-3.5 w-3.5" />
                            Devolver para IA
                          </DropdownItem>
                        )}
                        {iOwnIt && (
                          <DropdownItem
                            onClick={() => {
                              setTransferUserId("");
                              setTransferNote("");
                              setTransferOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            Transferir…
                          </DropdownItem>
                        )}
                        {!iOwnIt && hasHuman && (
                          <DropdownItem
                            onClick={() => {
                              if (
                                confirm(
                                  "Assumir este atendimento de outro atendente?\n\nVocê passará a ser o responsável."
                                )
                              ) {
                                assignMutation.mutate({});
                              }
                            }}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assumir mesmo assim
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

              {/* Banner handoff de primeira classe */}
              {!isClosed &&
                (() => {
                  const handoff = handoffStatus({
                    ...conversation,
                    viewerOwns: iOwnIt,
                  });
                  if (handoff.kind !== "pending") return null;
                  const wait = waitDuration(conversation.lastMessageAt);
                  return (
                    <div className="shrink-0 border-b border-amber-500/25 bg-amber-500/[0.08] px-3 py-2.5 dark:bg-amber-500/[0.1] sm:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-amber-950 dark:text-amber-100">
                            Aguardando atendimento
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-amber-900/80 dark:text-amber-100/75">
                            Handoff humano
                            {wait ? ` · há ${wait.label}` : ""}
                            {" · "}a IA está pausada nesta conversa
                          </p>
                        </div>
                        {!iOwnIt ? (
                          <button
                            type="button"
                            className="btn-primary h-8 shrink-0 text-xs"
                            disabled={assignMutation.isPending}
                            onClick={() => assignMutation.mutate({})}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            {assignMutation.isPending ? "Assumindo…" : "Assumir"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

              {isClosed && (
                <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-100/80 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12.5px] font-medium text-ink-secondary dark:text-zinc-300">
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
                  if (!lastSug || currentTimestamp === null) return null;
                  const age =
                    currentTimestamp - new Date(lastSug.createdAt).getTime() < 12 * 3600_000;
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
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto bg-[#F4F5F7] px-3 py-4 dark:bg-[#0a0c10] sm:px-5">
                {timeline.length === 0 ? (
                  <div className="flex h-full items-center justify-center pb-8">
                    <QuietEmpty
                      title="Sem mensagens ainda"
                      description="A conversa começa quando o cliente ou a equipe envia algo."
                      compact
                    />
                  </div>
                ) : null}
                {timeline.map((item) => {
                  if (item.kind === "day") {
                    return (
                      <div key={item.key} className="flex justify-center py-3">
                        <span className="rounded-full bg-black/[0.045] px-2.5 py-0.5 text-[10px] font-medium text-ink-muted dark:bg-white/[0.06] dark:text-zinc-500">
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
                      <div key={item.key} className="flex justify-center py-2">
                        <span
                          className="max-w-[min(92%,24rem)] px-2 text-center text-[11px] font-medium leading-snug text-ink-faint dark:text-zinc-500"
                          title={m.content}
                        >
                          {systemEventLabel(m)}
                          {time ? (
                            <span className="ml-1.5 tabular-nums opacity-80">· {time}</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  }

                  const isTeam = origin === "AI" || origin === "HUMAN" || origin === "INTERNAL_NOTE";
                  const agentName = origin === "AI" ? aiDisplayName(m) : "";
                  const humanName = m.author?.name || "Atendente";
                  const contactName = conversation?.contact.name || "Cliente";
                  const pendingAi =
                    origin === "AI" &&
                    m.aiApproved === false &&
                    Boolean(messageMeta(m).pendingApproval);

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
                        item.showLabel ? "mt-3.5" : "mt-0.5"
                      )}
                    >
                      <div
                        className={cn(
                          "flex min-w-0 max-w-[min(82%,30rem)] flex-col",
                          isTeam ? "items-end" : "items-start"
                        )}
                      >
                        {/* Identificação do remetente — só no 1º do grupo */}
                        {item.showLabel && origin === "CUSTOMER" && (
                          <p
                            className="mb-1 px-1 text-[11px] font-medium text-ink-secondary dark:text-zinc-400"
                            title={senderTooltip}
                          >
                            {contactName}
                          </p>
                        )}
                        {item.showLabel && origin === "AI" && (
                          <p
                            className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                            title={senderTooltip}
                          >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500/12 dark:bg-zinc-400/15">
                              <Bot className="h-3 w-3" strokeWidth={1.75} />
                            </span>
                            {agentName}
                            <span className="font-normal text-ink-faint">· IA</span>
                          </p>
                        )}
                        {item.showLabel && origin === "HUMAN" && (
                          <p
                            className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-ink-secondary dark:text-zinc-400"
                            title={senderTooltip}
                          >
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 text-[9px] font-bold text-ink dark:bg-white/[0.12] dark:text-zinc-200">
                              {initials(humanName)}
                            </span>
                            {humanName}
                          </p>
                        )}
                        {item.showLabel && origin === "INTERNAL_NOTE" && (
                          <p
                            className="mb-1 flex items-center gap-1 px-1 text-[11px] font-medium text-amber-800 dark:text-amber-200"
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
                            "px-3 py-2 text-[13.5px] leading-[1.55]",
                            origin === "INTERNAL_NOTE"
                              ? "rounded-2xl border border-dashed border-amber-500/35 bg-amber-50/90 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/[0.09] dark:text-amber-50"
                              : pendingAi
                                ? "rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] text-ink dark:border-amber-400/25 dark:bg-amber-500/[0.09] dark:text-zinc-100"
                                : origin === "AI"
                                  ? "rounded-2xl border border-zinc-300/70 bg-zinc-100/90 text-ink dark:border-white/[0.08] dark:bg-[#161a22] dark:text-zinc-100"
                                  : origin === "HUMAN"
                                    ? "rounded-2xl bg-[#1c1f28] text-white dark:bg-zinc-100 dark:text-[#12141a]"
                                    : "rounded-2xl border border-black/[0.05] bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/[0.07] dark:bg-[#141820] dark:text-zinc-100 dark:shadow-none"
                          )}
                          title={!item.showLabel ? senderTooltip : undefined}
                        >
                          {pendingAi ? (
                            <p className="mb-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                              Aguardando aprovação
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p
                            className={cn(
                              "mt-1 text-right text-[10px] tabular-nums",
                              origin === "HUMAN"
                                ? "text-white/50 dark:text-ink/45"
                                : "text-ink-faint dark:text-zinc-500"
                            )}
                          >
                            {time}
                          </p>
                          {pendingAi ? (
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
                                  const edited = window.prompt(
                                    "Editar antes de enviar",
                                    m.content
                                  );
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
                <div className="shrink-0 border-t border-line bg-white px-3 py-3 dark:border-[#262b36] dark:bg-[#12151c] sm:px-4">
                  {ai && (
                    <div className="mb-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink dark:text-zinc-200">
                          <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                          Sugestão de resposta
                        </p>
                        <button
                          type="button"
                          className="text-[11px] text-ink-faint hover:text-ink dark:hover:text-zinc-300"
                          onClick={() => setAi(null)}
                        >
                          Fechar
                        </button>
                      </div>
                      {ai.nextAction ? (
                        <p className="mt-0.5 text-[11px] text-ink-muted dark:text-zinc-500">
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

                  {quickReplies.data && quickReplies.data.length > 0 && !internal && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {quickReplies.data.slice(0, 6).map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-ink-secondary hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-zinc-300"
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

                  <div
                    className="mb-2 max-w-[18rem] rounded-lg shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                    role="presentation"
                  >
                    <Segmented
                      value={internal ? "note" : "reply"}
                      onChange={(v) => setInternal(v === "note")}
                      ariaLabel="Modo de envio"
                      size="md"
                      options={[
                        {
                          value: "reply",
                          label: "Responder",
                          hint: "Mensagem enviada ao cliente",
                        },
                        {
                          value: "note",
                          label: "Nota interna",
                          hint: "Só a equipe vê",
                        },
                      ]}
                    />
                  </div>

                  <form onSubmit={onSend}>
                    <div
                      className={cn(
                        "rounded-xl border px-2.5 pb-2 pt-2 transition-colors",
                        internal
                          ? "border-amber-500/35 bg-amber-50/90 dark:border-amber-400/25 dark:bg-amber-500/[0.07]"
                          : "border-black/[0.08] bg-white/90 focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/12 dark:border-white/[0.08] dark:bg-[#0c0e13] dark:focus-within:border-sky-400/35"
                      )}
                    >
                      {internal ? (
                        <p className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-medium text-amber-800/90 dark:text-amber-200/90">
                          <StickyNote className="h-3 w-3" strokeWidth={1.75} />
                          Visível somente para a equipe
                        </p>
                      ) : null}
                      <textarea
                        ref={textareaRef}
                        className="max-h-36 min-h-[52px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint dark:text-zinc-100"
                        placeholder={
                          internal
                            ? "Escreva uma nota para a equipe…"
                            : "Escreva a resposta…"
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
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium text-sky-800 hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-400/10"
                          onClick={() => void requestAi()}
                          disabled={aiLoading || internal}
                          title={
                            internal
                              ? "Disponível no modo Responder"
                              : "Gerar sugestão de resposta com IA"
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {aiLoading ? "Gerando…" : "Sugerir resposta"}
                        </button>
                        <button
                          type="submit"
                          className={cn(
                            "h-8 min-w-[5.75rem] px-3 text-xs",
                            internal
                              ? "btn-secondary"
                              : "btn-primary"
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
                <div className="shrink-0 border-t border-line px-4 py-3 text-center text-[12.5px] text-ink-muted dark:border-[#262b36] dark:text-zinc-500">
                  Atendimento encerrado. Reabra para enviar mensagens.
                </div>
              )}
            </>
          )}
        </main>

        {/* ═══ CONTEXTO (desktop) — só com conversa selecionada ═══ */}
        {showContextPanel && (
          <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-sky-500/10 bg-[var(--surface-raised)] dark:border-teal-400/15 dark:bg-transparent lg:flex">
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
              <p className="text-sm font-semibold text-ink dark:text-white">Contexto</p>
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
  const handoff = handoffStatus({ ...conversation, viewerOwns: false });
  const hasInsights = Boolean(
    conversation.aiSummary ||
      conversation.contact.memory?.summary ||
      conversation.aiIntent ||
      conversation.aiSentiment ||
      ai
  );

  return (
    <div className="space-y-6 p-4">
      {/* Contato */}
      <Section title="Contato" context>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[12px] font-semibold text-sky-900 dark:bg-sky-400/10 dark:text-sky-100">
            {initials(conversation.contact.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-semibold text-ink dark:text-white">
              {conversation.contact.name}
            </p>
            <p className="truncate text-[12px] text-ink-muted dark:text-zinc-500">
              {conversation.contact.phone || "Sem telefone"}
            </p>
            {conversation.contact.email ? (
              <p className="truncate text-[12px] text-ink-muted dark:text-zinc-500">
                {conversation.contact.email}
              </p>
            ) : null}
          </div>
        </div>
        {conversation.contact.tags && conversation.contact.tags.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1">
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
        ) : null}
      </Section>

      {/* Atendimento — uma linha por dado, sem card-em-card repetindo status */}
      <Section title="Atendimento" context>
        <div className="space-y-2.5">
          <MetaRow
            label="Estado"
            value={
              <span className={cn("font-medium", handoffToneClass(handoff.kind))}>
                {handoff.label}
              </span>
            }
          />
          <MetaRow label="Responsável" value={handoff.ownerLine} />
          <MetaRow
            label="Canal"
            value={channelShort(conversation.channel?.type, conversation.channel?.name)}
          />
          <MetaRow
            label="Registro"
            value={statusLabel[conversation.status] || conversation.status}
          />
          {conversation.lastMessageAt ? (
            <MetaRow
              label="Última msg"
              value={formatDate(conversation.lastMessageAt)}
            />
          ) : null}
          {conversation.closeReason ? (
            <MetaRow
              label="Encerramento"
              value={
                CLOSE_REASON_LABEL[conversation.closeReason] || conversation.closeReason
              }
            />
          ) : null}
        </div>
        {conversation.notes?.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-[11.5px] font-medium text-ink-muted dark:text-zinc-500">
              Notas da equipe
            </p>
            {conversation.notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-amber-500/[0.15] bg-amber-500/[0.06] px-2.5 py-2 text-[12px] dark:bg-amber-500/[0.08]"
              >
                <p className="leading-snug text-ink-secondary dark:text-zinc-200">{n.content}</p>
                <p className="mt-1 text-[10px] text-ink-faint">
                  {n.author.name} · {formatDate(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {/* Comercial */}
      <Section title="Comercial" context>
        <div className="space-y-2 rounded-xl border border-teal-500/10 bg-teal-500/[0.03] px-3 py-2.5 dark:border-sky-400/12 dark:bg-sky-500/[0.04]">
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
              <span className="text-ink-muted dark:text-zinc-500">Score</span>
              <span className="font-medium tabular-nums text-ink dark:text-zinc-100">
                {score}/100
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 transition-[width]"
                style={{ width: `${scorePct}%` }}
              />
            </div>
            {breakdown.length > 0 ? (
              <button
                type="button"
                className="mt-1.5 text-[11px] font-medium text-sky-800 dark:text-sky-300"
                onClick={() => setScoreOpen(!scoreOpen)}
              >
                {scoreOpen ? "Ocultar detalhes" : "Detalhes do score"}
              </button>
            ) : null}
            {scoreOpen && breakdown.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[11px] text-ink-muted dark:text-zinc-500">
                {breakdown.map((r, i) => (
                  <li key={i} className="leading-snug">
                    {r.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {conversation.contact.nextAction ? (
          <div className="mt-2 rounded-xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
            <p className="text-[11.5px] font-medium text-ink-muted dark:text-zinc-500">
              Próxima ação
            </p>
            <p className="mt-1 text-[13px] font-medium leading-snug text-ink dark:text-white">
              {conversation.contact.nextAction}
            </p>
          </div>
        ) : null}
      </Section>

      {/* Insights IA */}
      {hasInsights ? (
        <Section
          title="Insights"
          context
          action={
            <button
              type="button"
              className="text-ink-faint"
              onClick={() => setInsightsOpen(!insightsOpen)}
              aria-label={insightsOpen ? "Recolher insights" : "Expandir insights"}
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
          {insightsOpen ? (
            <div className="space-y-3">
              {(conversation.aiIntent ||
                conversation.aiSentiment ||
                conversation.aiSummary ||
                conversation.contact.memory?.summary) && (
                <div className="space-y-2 rounded-xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
                  {conversation.aiIntent ? (
                    <MetaRow label="Intenção" value={conversation.aiIntent} />
                  ) : null}
                  {conversation.aiSentiment ? (
                    <MetaRow label="Tom" value={conversation.aiSentiment} />
                  ) : null}
                  {(conversation.aiSummary || conversation.contact.memory?.summary) && (
                    <div>
                      <p className="text-[11.5px] text-ink-muted dark:text-zinc-500">Resumo</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary dark:text-zinc-300">
                        {conversation.aiSummary || conversation.contact.memory?.summary}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {ai ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink dark:text-zinc-200">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                    Sugestão de resposta
                  </p>
                  {ai.summary ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-500">
                      {ai.summary}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink dark:text-zinc-100">
                    {ai.reply}
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
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
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
