"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useCallback,
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
  ArrowDown,
  Clock,
  Inbox,
  ListTodo,
  Hourglass,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import {
  AudioVoiceRecorder,
  ImageLightboxModal,
  AttachmentPreviewModal,
  MediaBubble,
} from "@/components/inbox/media-components";
import { InboxComposer } from "@/components/inbox/inbox-composer";
import { InboxContextPanel } from "@/components/inbox/inbox-context-panel";
import { InboxConversationItem } from "@/components/inbox/inbox-conversation-item";
import { WhatsAppFormattedText } from "@/lib/whatsapp-format";
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
  Checkbox,
  Dropdown,
  DropdownItem,
  FormField,
  FormSection,
  Modal,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { Popover } from "@/components/ui-menu";
import { useAuth } from "@/store/auth";
import {
  getContactDisplayName,
  getContactSecondaryText,
  formatPhone,
} from "@/lib/format-contact";

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
  sources?: Array<{ title?: string; documentId?: string; score?: number; chunkIndex?: number }>;
  deliveryError?: string;
  sendError?: string;
  deliveryStatus?: string;
  source?: string;
  externalDevice?: boolean;
  [key: string]: unknown;
};

type ConversationMessage = {
  id: string;
  content: string;
  direction: string;
  type?: string;
  mediaUrl?: string | null;
  isAiGenerated?: boolean;
  aiApproved?: boolean | null;
  createdAt: string;
  metadata?: MessageMeta | null;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
};

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
    label: "Aguardando",
    hint: "Fila humana — handoff da IA",
    icon: Hourglass,
  },
  { id: "ai", label: "IA", hint: "IA atendendo", icon: Bot },
  { id: "closed", label: "Encerradas", hint: "Finalizadas", icon: CheckCircle2 },
];

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

function handoffStatus(c: {
  assignedTo?: { id: string; name: string } | null;
  status?: string;
  viewerOwns?: boolean;
}): {
  label: string;
  kind: HandoffKind;
  short: string;
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

function resolveMessageOrigin(m: ConversationMessage): MessageOrigin {
  const meta = messageMeta(m);
  if (
    m.type === "SYSTEM" ||
    (m.direction === "INTERNAL" &&
      (meta.systemNotice ||
        meta.systemEvent ||
        meta.eventKind === "attendance_closed" ||
        meta.eventKind === "attendance_reopened" ||
        meta.eventKind === "close_suggestion"))
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
  if (meta.noticeKind === "human_takeover" || meta.assumedByHuman) {
    return who ? `${who} assumiu o atendimento` : "Atendente humano assumiu";
  }
  if (meta.noticeKind === "ai_resumed_by_human" || meta.noticeKind === "ai_resumed_customer_return") {
    return who ? `${who} devolveu o atendimento para a IA` : "IA reassumiu o atendimento";
  }
  if (meta.eventKind === "attendance_closed" || meta.noticeKind === "attendance_closed") {
    const reason = meta.closeReason ? CLOSE_REASON_LABEL[meta.closeReason] || meta.closeReason : null;
    return reason ? `Atendimento finalizado (${reason})` : "Atendimento finalizado";
  }
  if (meta.eventKind === "attendance_reopened") {
    return "Atendimento reaberto";
  }
  return m.content || "Atualização de sistema";
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-8">
          <Spinner />
        </div>
      }
    >
      <InboxPageContent />
    </Suspense>
  );
}

function InboxPageContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");
  const qc = useQueryClient();
  const { toast } = useToast();
  const user = useAuth((s) => s.user);
  const tenant = useAuth((s) => s.tenant);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [opsNav, setOpsNav] = useState<OpsNav>("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [archivedView, setArchivedView] = useState(false);

  const [draftsByConv, setDraftsByConv] = useState<Record<string, { reply?: string; internal?: string }>>({});
  const [internal, setInternal] = useState(false);

  const currentMessage = selectedId
    ? internal
      ? draftsByConv[selectedId]?.internal || ""
      : draftsByConv[selectedId]?.reply || ""
    : "";

  const setCurrentMessage = useCallback(
    (text: string) => {
      if (!selectedId) return;
      setDraftsByConv((prev) => ({
        ...prev,
        [selectedId]: {
          ...prev[selectedId],
          [internal ? "internal" : "reply"]: text,
        },
      }));
    },
    [selectedId, internal]
  );
  const [contextOpen, setContextOpen] = useState(true);
  const [mobileContext, setMobileContext] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("COMPLETED");
  const [closeNote, setCloseNote] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesCountRef = useRef(0);

  const canHardDelete =
    user?.platformRole === "SUPERADMIN" ||
    tenant?.role === "ADMIN" ||
    tenant?.role === "SUPERVISOR";

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listParamsKey = useMemo(
    () =>
      buildConversationParams({
        opsNav,
        search,
        userId: user?.id,
        unreadOnly,
        needsApproval,
        archived: opsNav === "closed" && archivedView,
      }).toString(),
    [opsNav, search, user?.id, unreadOnly, needsApproval, archivedView]
  );

  const listQuery = useQuery({
    queryKey: ["conversations", listParamsKey, user?.id],
    queryFn: () => {
      const p = buildConversationParams({
        opsNav,
        search,
        userId: user?.id,
        unreadOnly,
        needsApproval,
        archived: opsNav === "closed" && archivedView,
      });
      p.set("limit", "40");
      p.set("page", "1");
      return api<{ items: ConversationListItem[]; total: number }>(
        `/conversations?${p.toString()}`
      );
    },
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });

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
    staleTime: 3_000,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });

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
    if (selectedId && messageCount > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    }
  }, [selectedId]);

  const sendMutation = useMutation({
    mutationFn: (payload: {
      content: string;
      isInternal?: boolean;
      type?: string;
      mediaUrl?: string;
      metadata?: Record<string, unknown>;
    }) =>
      api<{ deliveryError?: string }>(`/conversations/${selectedId}/messages`, {
        method: "POST",
        json: payload,
      }),
    onSuccess: (res, variables) => {
      if (selectedId) {
        setDraftsByConv((prev) => ({
          ...prev,
          [selectedId]: {
            ...prev[selectedId],
            [variables.isInternal ? "internal" : "reply"]: "",
          },
        }));
      }
      qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (res.deliveryError) {
        toast({
          kind: "error",
          title: "Não enviado no WhatsApp",
          description: res.deliveryError,
        });
      }
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Não foi possível enviar", description: e.message }),
  });

  const handleUploadAndSendFile = async (file: File, caption?: string) => {
    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api<{
        url: string;
        filename: string;
        mimetype: string;
        sizeBytes: number;
        kind: string;
      }>("/media/upload", {
        method: "POST",
        body: formData,
      });

      const mediaType =
        res.kind === "PDF" || res.kind === "DOCUMENT"
          ? "DOCUMENT"
          : res.kind === "IMAGE"
            ? "IMAGE"
            : res.kind === "VOICE"
              ? "VOICE"
              : res.kind === "AUDIO"
                ? "AUDIO"
                : res.kind === "VIDEO"
                  ? "VIDEO"
                  : "FILE";

      await sendMutation.mutateAsync({
        content: caption || "",
        type: mediaType,
        mediaUrl: res.url,
        metadata: {
          filename: res.filename,
          originalName: file.name,
          mimetype: res.mimetype,
          sizeBytes: res.sizeBytes,
        },
      });

      setSelectedFile(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível enviar o arquivo";
      toast({
        kind: "error",
        title: "Falha no envio do arquivo",
        description: msg,
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSendVoice = async (blob: Blob, durationSecs: number) => {
    try {
      const file = new File([blob], `audio_${Date.now()}.ogg`, { type: blob.type });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isVoice", "true");

      const res = await api<{
        url: string;
        filename: string;
        mimetype: string;
        sizeBytes: number;
      }>("/media/upload", {
        method: "POST",
        body: formData,
      });

      await sendMutation.mutateAsync({
        content: "",
        type: "VOICE",
        mediaUrl: res.url,
        metadata: {
          filename: res.filename,
          mimetype: res.mimetype,
          sizeBytes: res.sizeBytes,
          isVoice: true,
          duration: durationSecs,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível enviar a gravação";
      toast({
        kind: "error",
        title: "Falha no envio do áudio",
        description: msg,
      });
    }
  };

  const retryMessageMutation = useMutation({
    mutationFn: (messageId: string) =>
      api<{ ok: boolean; error?: string }>(
        `/conversations/${selectedId}/messages/${messageId}/retry`,
        { method: "POST" }
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["conversation", selectedId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (res.ok) {
        toast({ kind: "success", title: "Mensagem reenviada", description: "Enviada com sucesso para o WhatsApp" });
      } else {
        toast({ kind: "error", title: "Falha no reenvio", description: res.error || "Gateway rejeitou o envio" });
      }
    },
    onError: (e: Error) =>
      toast({ kind: "error", title: "Erro ao reenviar", description: e.message }),
  });

  const actionMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<ConversationListItem & { status?: string }>(`/conversations/${selectedId}`, {
        method: "PATCH",
        json: payload,
      }),
    onSuccess: async (server, payload) => {
      const id = selectedId;
      if (id && server && typeof server === "object") {
        qc.setQueryData(["conversation", id], (old: ConversationDetail | undefined) =>
          old ? { ...old, ...server } : old
        );
      }
      await qc.refetchQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["conversation-nav-counts"] });
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
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Não foi possível retomar a IA.";
      window.alert(msg);
    },
  });

  async function requestAi() {
    if (!selectedId) return;
    const targetConvId = selectedId;
    setAiLoading(true);
    try {
      const result = await api<AiSuggestion>(`/conversations/${targetConvId}/ai-suggest`, {
        method: "POST",
        json: {},
      });
      setAi(result);
      if (result.reply) {
        setInternal(false);
        setDraftsByConv((prev) => ({
          ...prev,
          [targetConvId]: {
            ...prev[targetConvId],
            reply: result.reply,
          },
        }));
      }
      qc.invalidateQueries({ queryKey: ["conversation", targetConvId] });
    } finally {
      setAiLoading(false);
    }
  }

  const rawItems = listQuery.data?.items || [];
  const items =
    opsNav === "mine"
      ? rawItems.filter((c) => c.status === "OPEN" || c.status === "PENDING")
      : rawItems;
  const listTotal =
    opsNav === "mine" ? items.length : listQuery.data?.total ?? items.length;
  const conversation = detailQuery.data;
  const isClosed =
    conversation?.status === "CLOSED" || conversation?.status === "ARCHIVED";
  const iOwnIt = conversation?.assignedTo?.id === user?.id;
  const hasHuman = Boolean(conversation?.assignedTo);
  const navCounts = navCountsQuery.data;

  const secondaryFilterCount =
    (unreadOnly ? 1 : 0) +
    (needsApproval ? 1 : 0) +
    (opsNav === "closed" && archivedView ? 1 : 0);

  const showContextPanel = Boolean(selectedId) && contextOpen;

    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    setShowJumpToBottom(false);
  }, []);

  // Ao selecionar/trocar conversa, posiciona no fim
  useEffect(() => {
    if (selectedId && conversation?.id === selectedId) {
      scrollToBottom(false);
    }
  }, [selectedId, conversation?.id, scrollToBottom]);

  // Ao chegar novas mensagens, verifica se o usuário está próximo do final (<160px)
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const msgCount = conversation?.messages?.length ?? 0;
    if (msgCount > messagesCountRef.current) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (isNearBottom) {
        scrollToBottom(true);
      } else {
        setShowJumpToBottom(true);
      }
    }
    messagesCountRef.current = msgCount;
  }, [conversation?.messages?.length, scrollToBottom]);

  const handleTimelineScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom && showJumpToBottom) {
      setShowJumpToBottom(false);
    }
  };

  const timeline = useMemo(() => {
    if (!conversation?.messages) return [];
    const out: Array<
      | { kind: "day"; key: string; label: string }
      | {
          kind: "msg";
          key: string;
          msg: ConversationMessage;
          showLabel: boolean;
          origin: MessageOrigin;
          isFirstInGroup: boolean;
          isLastInGroup: boolean;
        }
    > = [];
    let lastDay = "";
    let lastSystemLabel = "";
    let lastSystemTime = 0;
    const msgs = conversation.messages;

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const dk = dayKey(m.createdAt);
      if (dk !== lastDay) {
        out.push({ kind: "day", key: `d-${dk}`, label: dayLabel(m.createdAt) });
        lastDay = dk;
      }
      const origin = resolveMessageOrigin(m);
      const bucket = messageGroupKey(m);
      const msgTime = new Date(m.createdAt).getTime();

      // Deduplica eventos de sistema idênticos consecutivos (tolerância de 5 segundos)
      if (origin === "SYSTEM") {
        const lbl = systemEventLabel(m);
        if (lbl === lastSystemLabel && Math.abs(msgTime - lastSystemTime) < 5000) {
          continue;
        }
        lastSystemLabel = lbl;
        lastSystemTime = msgTime;
      } else {
        lastSystemLabel = "";
      }

      const prevMsg = msgs[i - 1];
      const nextMsg = msgs[i + 1];

      const prevBucket = prevMsg ? messageGroupKey(prevMsg) : "";
      const prevTime = prevMsg ? new Date(prevMsg.createdAt).getTime() : 0;
      const isFirstInGroup =
        !prevMsg ||
        origin === "SYSTEM" ||
        prevBucket !== bucket ||
        msgTime - prevTime >= 5 * 60_000 ||
        dayKey(prevMsg.createdAt) !== dk;

      const nextBucket = nextMsg ? messageGroupKey(nextMsg) : "";
      const nextTimeVal = nextMsg ? new Date(nextMsg.createdAt).getTime() : 0;
      const isLastInGroup =
        !nextMsg ||
        origin === "SYSTEM" ||
        nextBucket !== bucket ||
        nextTimeVal - msgTime >= 5 * 60_000 ||
        dayKey(nextMsg.createdAt) !== dk;

      const showLabel = origin === "SYSTEM" ? true : isFirstInGroup;

      out.push({
        kind: "msg",
        key: m.id,
        msg: m,
        showLabel,
        origin,
        isFirstInGroup,
        isLastInGroup,
      });
    }
    return out;
  }, [conversation?.messages]);

  const score = conversation?.contact?.score ?? conversation?.aiScore ?? 0;
  const scorePct = Math.min(100, Math.max(0, score));

  return (
    <div className="nf-mod nf-mod--inbox nf-mod--bleed flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">

      {/* 2. Modais Operacionais */}
      <Modal
        open={closeOpen}
        onClose={() => !actionMutation.isPending && setCloseOpen(false)}
        title="Finalizar atendimento"
        description="O atendimento sairá da fila ativa e ficará registrado no histórico."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs"
              onClick={() => setCloseOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-3 text-xs"
              disabled={actionMutation.isPending}
              onClick={() => {
                actionMutation.mutate(
                  {
                    status: "CLOSED",
                    closeReason: closeReason || undefined,
                    closeNote: closeNote.trim() || undefined,
                  },
                  { onSuccess: () => setCloseOpen(false) }
                );
              }}
            >
              {actionMutation.isPending ? "Finalizando…" : "Finalizar atendimento"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label="Motivo de finalização">
            <Select
              value={closeReason}
              onChange={setCloseReason}
              options={CLOSE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </FormField>
          <FormField label="Observação (opcional)">
            <textarea
              className="input min-h-[64px] w-full resize-none text-xs"
              placeholder="Adicione um detalhe sobre o encerramento…"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => !assignMutation.isPending && setTransferOpen(false)}
        title="Transferir atendimento"
        description="Selecione um colega para assumir esta conversa."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary h-8 px-3 text-xs"
              onClick={() => setTransferOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary h-8 px-3 text-xs"
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
          </div>
        }
      >
        <div className="space-y-3">
          {teamQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {(teamQuery.data?.members || [])
                .filter((m) => m.user?.id && m.user.id !== user?.id && m.isActive !== false)
                .map((m) => {
                  const active = transferUserId === m.user.id;
                  return (
                    <button
                      key={m.user.id}
                      type="button"
                      onClick={() => setTransferUserId(m.user.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-violet-500/40 bg-violet-500/[0.08] dark:border-violet-400/35 dark:bg-violet-400/[0.1]"
                          : "border-black/[0.06] hover:bg-black/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.03]"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[11px] font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                        {initials(m.user.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink dark:text-zinc-100">
                          {m.user.name}
                        </p>
                        {m.user.email && (
                          <p className="truncate text-[10.5px] text-ink-faint dark:text-zinc-500">
                            {m.user.email}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
          <FormField label="Nota interna para o atendente (opcional)">
            <textarea
              className="input min-h-[56px] w-full resize-none text-xs"
              placeholder="Explique o contexto ao colega…"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      {/* 3. Layout Principal em 3 Colunas Redesenhado */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-xs dark:border-white/[0.06] dark:bg-[#0c0e14]">
        {/* COLUNA ESQUERDA: Lista de Conversas (280-310px) */}
        <aside
          className={cn(
            "flex w-full flex-col border-r border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#0c0e14] lg:w-[300px] xl:w-[310px] shrink-0",
            selectedId ? "hidden lg:flex" : "flex"
          )}
        >
          {/* Header da Lista */}
          <div className="shrink-0 space-y-2 border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-white">
                Conversas
              </h2>
              {listTotal > 0 && (
                <span className="tabular-nums text-[11px] font-medium text-ink-muted/80 dark:text-zinc-400">
                  {listTotal}
                </span>
              )}
            </div>

            {/* Busca Rápida */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted/70 dark:text-zinc-500" />
              <input
                className="h-8 w-full rounded-lg border border-black/[0.06] bg-black/[0.02] pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint focus:border-violet-500/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-500/20 dark:border-white/[0.06] dark:bg-white/[0.025] dark:text-zinc-100 dark:focus:border-violet-400/30 dark:focus:bg-[#121620]"
                placeholder="Buscar conversas…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchInput("");
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted/70 hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filas Operacionais */}
            <nav className="space-y-0.5" aria-label="Filas">
              {OPS_NAV_ITEMS.map((item) => {
                const active = opsNav === item.id;
                const count = navCounts?.[item.id];
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOpsNav(item.id);
                      if (item.id !== "closed") setArchivedView(false);
                    }}
                    className={cn(
                      "relative flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors text-xs",
                      active
                        ? "bg-black/[0.035] text-ink font-semibold dark:bg-white/[0.05] dark:text-white"
                        : "text-ink-secondary hover:bg-black/[0.02] dark:text-zinc-400 dark:hover:bg-white/[0.03] dark:hover:text-zinc-200 font-medium"
                    )}
                  >
                    {active && (
                      <span
                        className="absolute bottom-1 left-0 top-1 w-[2px] rounded-r-full bg-violet-600 dark:bg-violet-400"
                        aria-hidden
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-violet-600 dark:text-violet-400" : "text-ink-muted/70 dark:text-zinc-500"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span
                        className={cn(
                          "tabular-nums text-[10.5px] font-normal text-ink-muted/70 dark:text-zinc-500",
                          item.id === "waiting" && "text-amber-700 dark:text-amber-300 font-medium"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Filtros Secundários com Popover Flutuante */}
            <Popover
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              align="left"
              minWidth={220}
              maxWidth={280}
              triggerClassName="w-full"
              className="p-1.5 shadow-xl border-black/[0.08] dark:border-white/[0.08] dark:bg-[#12141c] rounded-xl"
              trigger={
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors",
                    secondaryFilterCount > 0 || filtersOpen
                      ? "border-violet-500/25 bg-violet-500/[0.04] text-violet-800 dark:border-violet-400/25 dark:bg-violet-500/[0.06] dark:text-violet-200"
                      : "border-black/[0.06] bg-black/[0.015] text-ink-secondary hover:bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-400 dark:hover:bg-white/[0.04]"
                  )}
                >
                  <Filter className="h-3 w-3" />
                  <span>{secondaryFilterCount > 0 ? `Filtros · ${secondaryFilterCount}` : "Filtros"}</span>
                </button>
              }
            >
              {() => (
                <div className="space-y-0.5 text-xs">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint dark:text-zinc-500">
                    Filtrar por
                  </div>

                  {/* Row 1: Não lidas */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={unreadOnly}
                    onClick={() => setUnreadOnly((v) => !v)}
                    className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-black/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.05]"
                  >
                    <Checkbox
                      checked={unreadOnly}
                      onCheckedChange={setUnreadOnly}
                      aria-label="Não lidas"
                      className="pointer-events-none"
                    />
                    <span className="flex-1">Não lidas</span>
                  </button>

                  {/* Row 2: Aguardando aprovação IA */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={needsApproval}
                    onClick={() => setNeedsApproval((v) => !v)}
                    className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-black/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.05]"
                  >
                    <Checkbox
                      checked={needsApproval}
                      onCheckedChange={setNeedsApproval}
                      aria-label="Aguardando aprovação IA"
                      className="pointer-events-none"
                    />
                    <span className="flex-1">Aguardando aprovação IA</span>
                  </button>

                  {/* Row 3 (se em Encerradas): Arquivadas */}
                  {opsNav === "closed" && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={archivedView}
                      onClick={() => setArchivedView((v) => !v)}
                      className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-black/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.05]"
                    >
                      <Checkbox
                        checked={archivedView}
                        onCheckedChange={setArchivedView}
                        aria-label="Arquivadas"
                        className="pointer-events-none"
                      />
                      <span className="flex-1">Arquivadas</span>
                    </button>
                  )}

                  {/* Limpar filtros */}
                  {secondaryFilterCount > 0 && (
                    <div className="pt-1 mt-1 border-t border-black/[0.06] dark:border-white/[0.06]">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] font-medium text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
                        onClick={() => {
                          setUnreadOnly(false);
                          setNeedsApproval(false);
                          setArchivedView(false);
                        }}
                      >
                        <span>Limpar filtros</span>
                        <span className="text-[10px] text-ink-faint dark:text-zinc-500">Resetar</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Popover>
          </div>

          {/* Lista com Scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="flex justify-center p-8">
                <Spinner />
              </div>
            )}
            {items.map((c) => (
              <InboxConversationItem
                key={c.id}
                conversation={c}
                selected={selectedId === c.id}
                userId={user?.id}
                onSelect={() => {
                  setSelectedId(c.id);
                  setAi(null);
                  setMobileContext(false);
                }}
              />
            ))}
            {items.length === 0 && !listQuery.isLoading && (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs">
                {secondaryFilterCount > 0 || search.trim() ? (
                  <>
                    <p className="text-ink-muted dark:text-zinc-400">Nenhuma conversa corresponde aos filtros.</p>
                    {secondaryFilterCount > 0 && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline cursor-pointer"
                        onClick={() => {
                          setUnreadOnly(false);
                          setNeedsApproval(false);
                          setArchivedView(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-ink-muted dark:text-zinc-500">Nenhuma conversa encontrada nesta fila.</p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* COLUNA CENTRAL: Hero Chat (1fr) */}
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col bg-[#F8F9FA] dark:bg-[#07090e]",
            selectedId ? "flex" : "hidden lg:flex"
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="mt-3 font-display text-[15px] font-semibold text-ink dark:text-white">
                Selecione uma conversa
              </h3>
              <p className="mt-1 max-w-xs text-xs text-ink-muted dark:text-zinc-400">
                Escolha uma conversa na fila à esquerda para iniciar o atendimento.
              </p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : conversation ? (
            <>
              {/* Header do Chat Minimalista */}
              <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white px-3.5 dark:border-white/[0.06] dark:bg-[#0e1117] sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-black/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 lg:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
                    {initials(getContactDisplayName(conversation.contact))}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-display text-[14px] font-semibold text-ink dark:text-white">
                        {getContactDisplayName(conversation.contact)}
                      </h2>
                      {getContactSecondaryText(conversation.contact) && (
                        <span className="hidden sm:inline text-xs text-ink-muted dark:text-zinc-400">
                          · {getContactSecondaryText(conversation.contact)}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] text-ink-muted dark:text-zinc-400">
                      <span>{conversation.channel?.name || "WhatsApp"}</span>
                      <span>·</span>
                      <span className={cn("font-medium", handoffToneClass(handoffStatus({ ...conversation, viewerOwns: iOwnIt }).kind))}>
                        {handoffStatus({ ...conversation, viewerOwns: iOwnIt }).label}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Ações Rápidas do Topo */}
                <div className="flex items-center gap-1.5">
                  {!isClosed && !hasHuman && (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-violet-600 px-2.5 text-xs font-medium text-white hover:bg-violet-700 shadow-sm transition-colors"
                      disabled={assignMutation.isPending}
                      onClick={() => assignMutation.mutate({})}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>{assignMutation.isPending ? "Assumindo…" : "Assumir atendimento"}</span>
                    </button>
                  )}

                  {!isClosed && iOwnIt && (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-500/20 dark:text-violet-300 transition-colors"
                      disabled={resumeAiMutation.isPending}
                      onClick={() => resumeAiMutation.mutate()}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      <span>Devolver para IA</span>
                    </button>
                  )}

                  {isClosed && (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-violet-600 px-2.5 text-xs font-medium text-white hover:bg-violet-700 shadow-sm"
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ status: "OPEN" })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Reabrir</span>
                    </button>
                  )}

                  {/* Menu Contextual '...' */}
                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] text-ink-muted hover:bg-black/5 hover:text-ink dark:border-white/[0.08] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                  >
                    {!isClosed ? (
                      <>
                        <DropdownItem
                          onClick={() => actionMutation.mutate({ isFavorite: !conversation.isFavorite })}
                        >
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          <span>{conversation.isFavorite ? "Remover dos favoritos" : "Marcar como importante"}</span>
                        </DropdownItem>
                        {iOwnIt && (
                          <DropdownItem
                            onClick={() => {
                              setTransferUserId("");
                              setTransferNote("");
                              setTransferOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            <span>Transferir atendimento…</span>
                          </DropdownItem>
                        )}
                        <DropdownItem onClick={() => setCloseOpen(true)}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Finalizar atendimento</span>
                        </DropdownItem>
                        <DropdownItem onClick={() => actionMutation.mutate({ status: "ARCHIVED" })}>
                          <Archive className="h-3.5 w-3.5" />
                          <span>Arquivar conversa</span>
                        </DropdownItem>
                      </>
                    ) : (
                      <DropdownItem onClick={() => actionMutation.mutate({ status: "OPEN" })}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reabrir conversa</span>
                      </DropdownItem>
                    )}
                    {canHardDelete && (
                      <DropdownItem
                        danger
                        onClick={() => {
                          if (confirm("Excluir permanentemente este histórico de atendimento?")) {
                            deleteMutation.mutate();
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Excluir</span>
                      </DropdownItem>
                    )}
                  </Dropdown>

                  {/* Toggle do Painel de Contexto Direito */}
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] text-ink-muted hover:bg-black/5 hover:text-ink dark:border-white/[0.08] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors hidden lg:flex"
                    onClick={() => setContextOpen((v) => !v)}
                    title={contextOpen ? "Ocultar painel de contexto" : "Mostrar painel de contexto"}
                  >
                    {contextOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </button>

                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-black/[0.08] text-ink-muted hover:bg-black/5 hover:text-ink dark:border-white/[0.08] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 transition-colors lg:hidden"
                    onClick={() => setMobileContext(true)}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* Faixa de Handoff Humano (se PENDING) */}
              {conversation.status === "PENDING" && !conversation.assignedTo && (
                <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/[0.08] px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/[0.1] dark:text-amber-100">
                  <div className="flex items-center gap-1.5">
                    <Hourglass className="h-3.5 w-3.5 text-amber-600" />
                    <span>Aguardando atendimento humano (IA pausada)</span>
                  </div>
                  <button
                    type="button"
                    className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700"
                    onClick={() => assignMutation.mutate({})}
                  >
                    Atender agora
                  </button>
                </div>
              )}

              {/* TIMELINE DE MENSAGENS (O PROTAGONISTA) */}
              <div
                ref={messagesContainerRef}
                onScroll={handleTimelineScroll}
                className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto p-4 sm:p-5 overscroll-contain"
              >
                {timeline.map((item) => {
                  if (item.kind === "day") {
                    return (
                      <div key={item.key} className="flex justify-center py-2.5">
                        <span className="rounded-full bg-black/[0.04] px-3 py-0.5 text-[10.5px] font-medium text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400">
                          {item.label}
                        </span>
                      </div>
                    );
                  }

                  const m = item.msg;
                  const origin = item.origin;
                  const time = formatMsgTime(m.createdAt);

                  // Eventos de Sistema
                  if (origin === "SYSTEM") {
                    return (
                      <div key={item.key} className="flex justify-center py-1.5">
                        <span className="max-w-md rounded-lg px-2.5 py-1 text-center text-[11px] font-medium text-ink-faint dark:text-zinc-500">
                          {systemEventLabel(m)} {time ? `· ${time}` : ""}
                        </span>
                      </div>
                    );
                  }

                  const isTeam = origin === "AI" || origin === "HUMAN" || origin === "INTERNAL_NOTE";
                  const isDevice = messageMeta(m).source === "WHATSAPP_DEVICE" || messageMeta(m).externalDevice;
                  const senderName =
                    origin === "AI"
                      ? aiDisplayName(m)
                      : origin === "HUMAN"
                        ? m.author?.name || (isDevice ? "WhatsApp Celular" : "Atendente")
                        : origin === "INTERNAL_NOTE"
                          ? `Nota interna · ${m.author?.name || "Equipe"}`
                          : getContactDisplayName(conversation.contact);

                  const isFirst = item.isFirstInGroup;
                  const isLast = item.isLastInGroup;

                  const bubbleRadius = isTeam
                    ? isFirst && isLast
                      ? "rounded-2xl"
                      : isFirst
                        ? "rounded-2xl rounded-br-sm"
                        : isLast
                          ? "rounded-2xl rounded-tr-sm"
                          : "rounded-l-2xl rounded-r-sm"
                    : isFirst && isLast
                      ? "rounded-2xl"
                      : isFirst
                        ? "rounded-2xl rounded-bl-sm"
                        : isLast
                          ? "rounded-2xl rounded-tl-sm"
                          : "rounded-r-2xl rounded-l-sm";

                  return (
                    <div
                      key={item.key}
                      className={cn(
                        "flex",
                        isTeam ? "justify-end" : "justify-start",
                        isFirst ? "mt-3" : "mt-0.5"
                      )}
                    >
                      <div className={cn("flex max-w-[min(68%,34rem)] flex-col", isTeam ? "items-end" : "items-start")}>
                        {/* Rótulo do Remetente */}
                        {item.showLabel && (
                          <span
                            className={cn(
                              "mb-1 px-1 text-[11px] font-medium select-none",
                              origin === "INTERNAL_NOTE"
                                ? "text-amber-700 dark:text-amber-300"
                                : origin === "AI"
                                  ? "text-violet-700 dark:text-violet-300"
                                  : "text-ink-secondary dark:text-zinc-400"
                            )}
                          >
                            {senderName}
                          </span>
                        )}

                        {/* Balão de Mensagem */}
                        <div
                          className={cn(
                            "w-fit max-w-full px-3.5 py-2 text-[13px] leading-relaxed transition-colors",
                            bubbleRadius,
                            origin === "INTERNAL_NOTE"
                              ? "border border-dashed border-amber-500/35 bg-amber-500/[0.08] text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/[0.1] dark:text-amber-100"
                              : origin === "HUMAN"
                                ? "bg-[#181a20] text-white dark:bg-[#1a1f2c] dark:text-zinc-100 dark:border dark:border-white/[0.08] shadow-xs"
                                : origin === "AI"
                                  ? "border border-violet-500/20 bg-violet-500/[0.06] text-ink dark:border-violet-400/20 dark:bg-violet-950/40 dark:text-zinc-100"
                                  : "border border-black/[0.05] bg-white text-ink shadow-xs dark:border-white/[0.06] dark:bg-[#121620] dark:text-zinc-100"
                          )}
                        >
                          {/* Renderização de Mídia */}
                          {(m.mediaUrl ||
                            (m.type && m.type !== "TEXT" && m.type !== "NOTE") ||
                            /^\[(?:mídia|midia|imagem|áudio|audio|vídeo|video|documento|sticker|figurinha)(?::\s*[^\]]+)?\]$/i.test(
                              m.content?.trim() || ""
                            )) && (
                            <MediaBubble
                              type={m.type || "FILE"}
                              mediaUrl={m.mediaUrl}
                              metadata={messageMeta(m)}
                              isOutbound={origin === "HUMAN"}
                              content={m.content}
                              onOpenLightbox={(url) => setLightboxSrc(url)}
                            />
                          )}

                          {/* Conteúdo de Texto com formatação rica do WhatsApp */}
                          {m.content &&
                            !/^\[(?:mídia|midia|imagem|áudio|audio|vídeo|video|documento|sticker|figurinha|mensagem)(?::\s*[^|\]]+)?\]$/i.test(
                              m.content.trim()
                            ) && (
                              <WhatsAppFormattedText content={m.content} />
                            )}

                          {/* Metadados e Status de Entrega */}
                          <div
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums",
                              origin === "HUMAN"
                                ? "text-white/65 dark:text-zinc-400"
                                : "text-ink-faint dark:text-zinc-400"
                            )}
                          >
                            <span>{time}</span>
                            {origin === "HUMAN" && (
                              <span className="inline-flex items-center ml-0.5">
                                {messageMeta(m).deliveryStatus === "READ" ? (
                                  <CheckCheck className="h-3 w-3 text-sky-400 dark:text-sky-400" />
                                ) : messageMeta(m).deliveryStatus === "DELIVERED" ? (
                                  <CheckCheck className="h-3 w-3 opacity-75" />
                                ) : messageMeta(m).deliveryStatus === "FAILED" || messageMeta(m).deliveryError ? (
                                  <AlertCircle className="h-3 w-3 text-rose-500" />
                                ) : messageMeta(m).deliveryStatus === "SENDING" || messageMeta(m).deliveryStatus === "UPLOADING" ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin opacity-75" />
                                ) : (
                                  <Check className="h-3 w-3 opacity-75" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />

                {/* Botão Flutuante de Novas Mensagens / Ir para o fim */}
                {showJumpToBottom && (
                  <div className="sticky bottom-2 flex justify-center pointer-events-none z-20">
                    <button
                      type="button"
                      onClick={() => scrollToBottom(true)}
                      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-violet-700 active:scale-95 transition-all"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      <span>Novas mensagens</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. COMPOSER UNIFICADO E INTEGRADO */}
              {!isClosed ? (
                <InboxComposer
                  conversationId={selectedId}
                  message={currentMessage}
                  setMessage={setCurrentMessage}
                  internal={internal}
                  setInternal={setInternal}
                  isSending={sendMutation.isPending}
                  onSend={async (e) => {
                    e.preventDefault();
                    if (!currentMessage.trim() || !selectedId) return;
                    await sendMutation.mutateAsync({ content: currentMessage.trim(), isInternal: internal });
                  }}
                  onSendVoice={handleSendVoice}
                  onSelectFile={(f) => setSelectedFile(f)}
                  onRequestAi={requestAi}
                  aiLoading={aiLoading}
                />
              ) : (
                <div className="border-t border-black/[0.06] bg-white p-3 text-center text-xs text-ink-muted dark:border-white/[0.06] dark:bg-[#0e1117] dark:text-zinc-400">
                  Atendimento finalizado. Clique em Reabrir para enviar novas mensagens.
                </div>
              )}
            </>
          ) : null}
        </main>

        {/* COLUNA DIREITA: Contexto do Atendimento (300-330px Colapsável) */}
        {showContextPanel && conversation && (
          <aside className="hidden w-[300px] xl:w-[320px] shrink-0 border-l border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#0c0e14] lg:flex flex-col min-h-0">
            <InboxContextPanel
              conversation={conversation}
              score={score}
              scorePct={scorePct}
              ai={ai}
            />
          </aside>
        )}
      </div>

      {/* Drawer Contexto Mobile */}
      {mobileContext && conversation && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileContext(false)} />
          <div className="absolute bottom-0 right-0 top-0 w-[85%] max-w-sm bg-white shadow-2xl dark:bg-[#0c0e14]">
            <div className="flex items-center justify-between border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
              <span className="text-xs font-semibold text-ink dark:text-white">Detalhes do Contato</span>
              <button
                type="button"
                className="text-xs font-medium text-ink-muted hover:text-ink"
                onClick={() => setMobileContext(false)}
              >
                Fechar
              </button>
            </div>
            <InboxContextPanel
              conversation={conversation}
              score={score}
              scorePct={scorePct}
              ai={ai}
            />
          </div>
        </div>
      )}

      {/* Modal de Preview de Anexo Antes do Envio */}
      {selectedFile && (
        <AttachmentPreviewModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onSend={(caption) => handleUploadAndSendFile(selectedFile, caption)}
          isSending={isUploadingFile}
        />
      )}

      {/* Modal de Imagem Lightbox */}
      {lightboxSrc && (
        <ImageLightboxModal
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
