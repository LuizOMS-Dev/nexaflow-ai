"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type TransitionEvent,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  X,
  Send,
  ThumbsUp,
  ThumbsDown,
  SquarePen,
  ExternalLink,
  Loader2,
  ChevronDown,
  History,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_OPEN_EVENT,
  sanitizeAssistantActions,
  type AssistantAction,
  type AssistantBootstrap,
  type AssistantMessage,
} from "@/lib/nexaflow-assistant";
import { useAuth } from "@/store/auth";
import { NiaMarkdown } from "./nia-markdown";

type ChatResponse = {
  threadId: string;
  messageId: string;
  content: string;
  actions: AssistantAction[];
};

function parseActions(raw: unknown): AssistantAction[] {
  return sanitizeAssistantActions(raw);
}

function draftKey(tenantId: string | undefined) {
  return tenantId ? `nexaflow_nia_draft_${tenantId}` : "nexaflow_nia_draft";
}

function softErrorMessage(raw: string): string {
  const t = (raw || "").toLowerCase();
  if (/rate|429|limit|quota|tpm|tokens per/i.test(t)) {
    return "Estou um pouco ocupada agora. Tente de novo em alguns instantes.";
  }
  if (/network|fetch|timeout|econn|offline|failed to fetch/i.test(t)) {
    return "Não consegui responder agora. Verifique sua conexão e tente novamente.";
  }
  if (/401|403|unauthorized|forbidden/i.test(t)) {
    return "Sua sessão pode ter expirado. Atualize a página e tente de novo.";
  }
  // Nunca repassar stack / códigos brutos longos
  if (raw.length > 140 || /at\s+\w+|stack|prisma|openai|groq|api[_-]?key/i.test(raw)) {
    return "Não consegui responder agora. Tente novamente em alguns instantes.";
  }
  return raw || "Não consegui responder agora. Tente novamente em alguns instantes.";
}

function StatusDot({
  kind,
}: {
  kind: "online" | "unstable" | "offline" | "loading";
}) {
  const label =
    kind === "online"
      ? "Online"
      : kind === "unstable"
        ? "Instável"
        : kind === "offline"
          ? "Offline"
          : "Carregando";
  return (
    <span
      className={cn("nf-nia-status-dot-only", `nf-nia-status-dot-only--${kind}`)}
      title={label}
      aria-label={label}
      role="status"
    />
  );
}

function firstNameFromUser(name?: string | null, email?: string | null) {
  const n = (name || "").trim();
  if (n) return n.split(/\s+/)[0];
  const e = (email || "").split("@")[0];
  return e || null;
}

export function NexaflowAssistantProvider({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { tenant, user } = useAuth();
  const isPlatformAdmin =
    user?.platformRole === "SUPERADMIN" && !tenant && pathname?.startsWith("/admin");

  const [open, setOpen] = useState(false);
  /** Mantém o drawer no DOM durante a animação de saída */
  const [present, setPresent] = useState(false);
  /** Classe visual aberta (transition CSS) */
  const [animOpen, setAnimOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  /** Welcome local após "Nova conversa" (primeiro nome da sessão) */
  const [welcomeOverride, setWelcomeOverride] = useState<string | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sendingLock = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const titleId = useId();
  const tenantId = tenant?.id;

  // Não no admin global (NIA é do tenant)
  const enabledUi = Boolean(tenant) && !isPlatformAdmin && !pathname?.startsWith("/admin");

  const openNia = useCallback(() => {
    if (!enabledUi) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
    setPresent(true);
    // 2 rAF: garante estado "fechado" pintado antes de animar para aberto
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setAnimOpen(true));
    });
  }, [enabledUi]);

  const closeNia = useCallback(() => {
    setOpen(false);
    setAnimOpen(false);
    setHistoryOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    // Fallback se transitionend não disparar
    closeTimerRef.current = window.setTimeout(() => {
      setPresent(false);
      closeTimerRef.current = null;
    }, 380);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bootstrap = useQuery({
    queryKey: ["assistant-bootstrap", tenantId, pathname],
    queryFn: () =>
      api<AssistantBootstrap>(
        `/assistant/bootstrap?path=${encodeURIComponent(pathname || "/app")}`
      ),
    enabled: enabledUi && open,
    staleTime: 30_000,
  });

  // Troca de empresa: limpar contexto da conversa (isolamento multi-tenant)
  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    setError(null);
    setLastFailed(null);
    setWelcomeOverride(null);
    setInput("");
    setShowJump(false);
    setStickToBottom(true);
    setHistoryOpen(false);
    void qc.removeQueries({ queryKey: ["assistant-bootstrap"] });
    void qc.removeQueries({ queryKey: ["assistant-threads"] });
  }, [tenantId, qc]);

  const threadsQuery = useQuery({
    queryKey: ["assistant-threads", tenantId],
    queryFn: () =>
      api<{
        items: Array<{
          id: string;
          title: string;
          updatedAt: string;
          preview?: string | null;
        }>;
        nextCursor: string | null;
      }>("/assistant/threads?take=20"),
    enabled: Boolean(enabledUi && open && historyOpen && tenantId),
    staleTime: 15_000,
  });

  // Rascunho da sessão (não sensível — só texto do composer)
  useEffect(() => {
    if (!open || !enabledUi) return;
    try {
      const saved = sessionStorage.getItem(draftKey(tenantId));
      if (saved && !input) setInput(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregar draft só ao abrir
  }, [open, tenantId, enabledUi]);

  useEffect(() => {
    if (!enabledUi) return;
    try {
      if (input.trim()) sessionStorage.setItem(draftKey(tenantId), input);
      else sessionStorage.removeItem(draftKey(tenantId));
    } catch {
      /* ignore */
    }
  }, [input, tenantId, enabledUi]);

  useEffect(() => {
    if (!bootstrap.data?.thread) return;
    setThreadId((prev) => prev || bootstrap.data!.thread!.id);
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      const mapped = bootstrap.data!.thread!.messages.map((m) => ({
        ...m,
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        actions: parseActions(m.actions),
      }));
      if (mapped.length > 0) setWelcomeOverride(null);
      return mapped;
    });
  }, [bootstrap.data?.thread?.id]);

  useEffect(() => {
    const onOpen = () => openNia();
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, [openNia]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Focus + ESC + lock scroll (enquanto present, inclusive na saída)
  useEffect(() => {
    if (!present) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      if (animOpen) inputRef.current?.focus();
    }, 220);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeNia();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [present, animOpen, closeNia]);

  // Scroll inteligente: auto-scroll só se colado no fim; "Novas mensagens" só se realmente longe
  useEffect(() => {
    if (!listRef.current || !open) return;
    const el = listRef.current;
    const near = () => el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight;
      setShowJump(false);
      return;
    }
    // Reavaliar após layout (altura mudou com nova bolha)
    const id = window.requestAnimationFrame(() => {
      if (!listRef.current) return;
      setShowJump(!near() && messages.length > 0);
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, sending, open, error, stickToBottom]);

  // Auto-resize do composer (até ~6 linhas)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input, open]);

  const runAction = useCallback(
    (action: AssistantAction) => {
      if (action.type === "navigate" || action.type === "docs") {
        if (!action.href) return;
        if (!action.href.startsWith("/")) return;
        closeNia();
        router.push(action.href);
        return;
      }
      if (action.type === "tour") {
        closeNia();
        window.dispatchEvent(new CustomEvent("nexaflow:start-platform-tour"));
        return;
      }
      if (action.type === "support") {
        if (action.href?.startsWith("mailto:")) {
          window.location.href = action.href;
        } else if (bootstrap.data?.support?.email) {
          window.location.href = `mailto:${bootstrap.data.support.email}`;
        }
      }
    },
    [router, bootstrap.data?.support?.email, closeNia]
  );

  async function sendMessage(text: string) {
    const msg = text.trim();
    if (!msg || sending || sendingLock.current) return;
    sendingLock.current = true;
    setError(null);
    setLastFailed(null);
    setSending(true);
    setStickToBottom(true);
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: msg }]);
    setInput("");
    try {
      sessionStorage.removeItem(draftKey(tenantId));
    } catch {
      /* ignore */
    }

    try {
      const res = await api<ChatResponse>("/assistant/chat", {
        method: "POST",
        json: {
          message: msg,
          threadId,
          path: pathname || "/app",
        },
      });
      setThreadId(res.threadId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: `u-${res.messageId}`, role: "user", content: msg },
        {
          id: res.messageId,
          role: "assistant",
          content: res.content,
          actions: res.actions || [],
        },
      ]);
      void qc.invalidateQueries({ queryKey: ["assistant-bootstrap"] });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setLastFailed(msg);
      const raw =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Não consegui responder agora.";
      setError(softErrorMessage(raw));
    } finally {
      setSending(false);
      sendingLock.current = false;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function onListScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Threshold generoso evita "Novas mensagens" quando já está no final
    const nearBottom = dist < 140;
    setStickToBottom(nearBottom);
    if (nearBottom) setShowJump(false);
    else if (messages.length > 0) setShowJump(true);
  }

  function jumpToBottom() {
    setStickToBottom(true);
    setShowJump(false);
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  async function feedback(messageId: string, value: "up" | "down") {
    try {
      await api("/assistant/feedback", {
        method: "POST",
        json: { messageId, feedback: value },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: value } : m))
      );
    } catch {
      /* silencioso */
    }
  }

  async function openThread(id: string) {
    try {
      const t = await api<{
        id: string;
        title?: string | null;
        messages: AssistantMessage[];
      }>(`/assistant/threads/${id}`);
      setThreadId(t.id);
      setMessages(
        (t.messages || []).map((m) => ({
          ...m,
          role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
          actions: parseActions(m.actions),
        }))
      );
      setWelcomeOverride(null);
      setError(null);
      setHistoryOpen(false);
      setStickToBottom(true);
      void qc.invalidateQueries({ queryKey: ["assistant-bootstrap"] });
    } catch (e) {
      setError(
        softErrorMessage(e instanceof Error ? e.message : "Não foi possível abrir a conversa.")
      );
    }
  }

  async function deleteThread(id: string) {
    try {
      await api(`/assistant/threads/${id}`, { method: "DELETE" });
      if (threadId === id) {
        setThreadId(null);
        setMessages([]);
        setWelcomeOverride(null);
      }
      void qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      void qc.invalidateQueries({ queryKey: ["assistant-bootstrap"] });
    } catch (e) {
      setError(
        softErrorMessage(e instanceof Error ? e.message : "Não foi possível excluir a conversa.")
      );
    }
  }

  async function deleteAllHistory() {
    if (
      !window.confirm(
        "Excluir todo o histórico da NIA nesta empresa? Esta ação não pode ser desfeita."
      )
    ) {
      return;
    }
    try {
      await api("/assistant/threads", { method: "DELETE" });
      setThreadId(null);
      setMessages([]);
      setWelcomeOverride(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      void qc.invalidateQueries({ queryKey: ["assistant-bootstrap"] });
    } catch (e) {
      setError(
        softErrorMessage(e instanceof Error ? e.message : "Não foi possível limpar o histórico.")
      );
    }
  }

  async function newConversation() {
    setMessages([]);
    setThreadId(null);
    setError(null);
    setLastFailed(null);
    setStickToBottom(true);
    setShowJump(false);
    setHistoryOpen(false);
    const fn =
      bootstrap.data?.user?.firstName ||
      firstNameFromUser(user?.name, user?.email);
    try {
      const res = await api<{
        ok: boolean;
        threadId?: string;
        welcome?: string;
        user?: { firstName?: string | null };
      }>("/assistant/new-thread", {
        method: "POST",
        json: {},
      });
      if (res.threadId) setThreadId(res.threadId);
      if (res.welcome) {
        setWelcomeOverride(res.welcome);
      } else if (res.user?.firstName || fn) {
        setWelcomeOverride(
          `Olá, ${res.user?.firstName || fn}! Como posso ajudar você hoje?`
        );
      } else {
        setWelcomeOverride("Olá! Como posso ajudar você hoje?");
      }
      void qc.invalidateQueries({ queryKey: ["assistant-bootstrap"] });
    } catch {
      setWelcomeOverride(
        fn ? `Olá, ${fn}! Como posso ajudar você hoje?` : "Olá! Como posso ajudar você hoje?"
      );
    }
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }

  if (!enabledUi) return children ?? null;

  const sessionFirst =
    bootstrap.data?.user?.firstName || firstNameFromUser(user?.name, user?.email);
  // 2–3 sugestões contextuais da rota (backend); sem genéricas se o bootstrap trouxe lista
  const suggestions = (bootstrap.data?.suggestions?.length
    ? bootstrap.data.suggestions
    : [
        "Como conecto meu WhatsApp?",
        "Como crio um agente?",
        "Como adiciono conhecimento?",
      ]
  )
    .filter(Boolean)
    .slice(0, 3);
  const disabled = bootstrap.data?.enabled === false;
  const bootLoading = open && bootstrap.isLoading && !bootstrap.data;
  const statusKind: "online" | "unstable" | "offline" | "loading" = bootLoading
    ? "loading"
    : bootstrap.data?.online
      ? "online"
      : bootstrap.data?.unstable
        ? "unstable"
        : bootstrap.data
          ? "offline"
          : "loading";

  /**
   * Welcome curto: header já diz "NIA · Assistente da NexaFlow".
   * Remove repetição do tipo "Eu sou a NIA…". firstName da sessão, nunca hardcode.
   */
  const welcomeLead = sessionFirst ? `Olá, ${sessionFirst}!` : "Olá!";
  let welcomeRest = "Como posso ajudar você hoje?";
  if (welcomeOverride) {
    const cleaned = welcomeOverride
      .replace(/\bEu sou a NIA[^.!?]*[.!?]?\s*/gi, "")
      .replace(/\bassistente da NexaFlow[^.!?]*[.!?]?\s*/gi, "")
      .trim();
    const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length >= 2) {
      welcomeRest = parts.slice(1).join(" ") || welcomeRest;
    } else if (parts[0] && !/^ol[aá]/i.test(parts[0])) {
      welcomeRest = parts[0];
    }
  }

  const hasConversation = messages.length > 0;

  function onDrawerTransitionEnd(e: TransitionEvent<HTMLElement>) {
    // Só reage ao fim da transição do painel (transform), não de filhos
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (!animOpen) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPresent(false);
    }
  }

  const drawer =
    present && mounted
      ? createPortal(
          <div
            className={cn("nf-nia-root", animOpen && "is-open")}
            role="presentation"
            data-open={animOpen ? "true" : "false"}
          >
            <button
              type="button"
              className="nf-nia-backdrop"
              aria-label="Fechar NIA"
              onClick={closeNia}
              tabIndex={animOpen ? 0 : -1}
            />
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="nf-nia-panel"
              onTransitionEnd={onDrawerTransitionEnd}
            >
              {/* HEADER */}
              <header className="nf-nia-header">
                <span
                  className={cn("nf-nia-avatar", sending && "is-thinking")}
                  aria-hidden
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <div className="nf-nia-header-text">
                  <div className="nf-nia-title-row">
                    <h2 id={titleId} className="nf-nia-title">
                      {bootstrap.data?.name || "NIA"}
                    </h2>
                    <StatusDot kind={statusKind} />
                  </div>
                  <p className="nf-nia-subtitle">
                    {bootstrap.data?.subtitle || "Assistente da NexaFlow"}
                  </p>
                </div>
                <div className="nf-nia-header-actions">
                  <button
                    type="button"
                    className="nf-nia-icon-btn"
                    onClick={() => void newConversation()}
                    aria-label="Nova conversa"
                    title="Nova conversa"
                    disabled={sending}
                  >
                    <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className={cn("nf-nia-icon-btn", historyOpen && "is-active")}
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-label="Histórico"
                    title="Histórico"
                    aria-expanded={historyOpen}
                  >
                    <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="nf-nia-icon-btn"
                    onClick={closeNia}
                    aria-label="Fechar NIA"
                    title="Fechar NIA"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </header>

              {historyOpen ? (
                <div className="nf-nia-history" role="region" aria-label="Conversas anteriores">
                  <div className="nf-nia-history-head">
                    <p className="nf-nia-history-title">Histórico</p>
                    {threadsQuery.data?.items?.length ? (
                      <div className="nf-nia-history-head-actions">
                        <button
                          type="button"
                          className="nf-nia-history-clear"
                          onClick={() => void deleteAllHistory()}
                          title="Excluir todo o histórico"
                        >
                          Limpar tudo
                        </button>
                        <button
                          type="button"
                          className="nf-nia-history-new"
                          onClick={() => void newConversation()}
                        >
                          Nova conversa
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {threadsQuery.isLoading ? (
                    <p className="nf-nia-history-empty">Carregando…</p>
                  ) : !threadsQuery.data?.items?.length ? (
                    <p className="nf-nia-history-empty">Nenhuma conversa anterior.</p>
                  ) : (
                    <ul className="nf-nia-history-list">
                      {threadsQuery.data.items.map((t) => (
                        <li key={t.id} className="nf-nia-history-row">
                          <button
                            type="button"
                            className={cn(
                              "nf-nia-history-item",
                              threadId === t.id && "is-current"
                            )}
                            onClick={() => void openThread(t.id)}
                          >
                            <span className="nf-nia-history-item-title">{t.title}</span>
                            <span className="nf-nia-history-item-meta">
                              {new Date(t.updatedAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="nf-nia-history-delete"
                            aria-label={`Excluir conversa: ${t.title}`}
                            title="Excluir conversa"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  "Excluir esta conversa do histórico da NIA?"
                                )
                              ) {
                                void deleteThread(t.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {/* CONVERSA */}
              <div
                ref={listRef}
                className="nf-nia-messages"
                aria-live="polite"
                onScroll={onListScroll}
              >
                {disabled ? (
                  <div className="nf-nia-banner nf-nia-banner--muted" role="status">
                    A NIA está temporariamente indisponível. Tente novamente em alguns
                    instantes.
                  </div>
                ) : null}

                {!disabled && bootstrap.data?.unstable ? (
                  <div className="nf-nia-banner nf-nia-banner--warn" role="status">
                    {bootstrap.data.statusMessage?.includes("instável")
                      ? "Posso estar um pouco lenta agora. Pode enviar a pergunta normalmente."
                      : bootstrap.data.statusMessage ||
                        "Posso estar um pouco lenta agora. Pode enviar a pergunta normalmente."}
                  </div>
                ) : null}

                {bootLoading ? (
                  <div className="nf-nia-empty nf-nia-empty--loading" aria-busy="true">
                    <div className="nf-nia-skeleton" />
                    <div className="nf-nia-skeleton nf-nia-skeleton--sm" />
                    <div className="nf-nia-chip-row mt-3">
                      <span className="nf-nia-skeleton nf-nia-skeleton--chip" />
                      <span className="nf-nia-skeleton nf-nia-skeleton--chip" />
                    </div>
                  </div>
                ) : null}

                {!bootLoading && !hasConversation && !disabled ? (
                  <div className="nf-nia-empty">
                    {/* Identidade visual só no header — sem segundo ícone aqui */}
                    <div className="nf-nia-empty-inner">
                      <div className="nf-nia-welcome-block">
                        <p className="nf-nia-welcome-lead">{welcomeLead}</p>
                        <p className="nf-nia-welcome-sub">{welcomeRest}</p>
                      </div>
                      {suggestions.length > 0 ? (
                        <div className="nf-nia-suggestions">
                          <p className="nf-nia-suggestions-label">Sugestões</p>
                          <div className="nf-nia-chip-row">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="nf-nia-chip"
                                disabled={sending || disabled}
                                onClick={() => void sendMessage(s)}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {messages.map((m, idx) => {
                  const prev = messages[idx - 1];
                  const next = messages[idx + 1];
                  const isFirstInGroup = !prev || prev.role !== m.role;
                  const isLastInGroup = !next || next.role !== m.role;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "nf-nia-msg",
                        m.role === "user" ? "nf-nia-msg--user" : "nf-nia-msg--assistant",
                        !isFirstInGroup && "nf-nia-msg--grouped",
                        isLastInGroup && "nf-nia-msg--group-end"
                      )}
                    >
                      <div className="nf-nia-msg-col">
                        <div className="nf-nia-bubble">
                          {m.role === "assistant" ? (
                            <NiaMarkdown content={m.content} className="nf-nia-bubble-text" />
                          ) : (
                            <p className="nf-nia-bubble-text">{m.content}</p>
                          )}
                        </div>
                        {m.role === "assistant" &&
                        isLastInGroup &&
                        parseActions(m.actions).length > 0 ? (
                          <div className="nf-nia-actions">
                            {parseActions(m.actions).map((a, i) => (
                              <button
                                key={`${m.id}-a-${i}`}
                                type="button"
                                className="nf-nia-action"
                                onClick={() => runAction(a)}
                              >
                                {a.label}
                                <ExternalLink
                                  className="h-3 w-3 opacity-65"
                                  strokeWidth={1.75}
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {m.role === "assistant" &&
                        isLastInGroup &&
                        !m.id.startsWith("tmp") ? (
                          <div className="nf-nia-feedback">
                            <button
                              type="button"
                              className={cn(
                                "nf-nia-feedback-btn",
                                m.feedback === "up" && "is-active is-up"
                              )}
                              aria-label="Útil"
                              aria-pressed={m.feedback === "up"}
                              onClick={() => void feedback(m.id, "up")}
                            >
                              <ThumbsUp className="h-3 w-3" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "nf-nia-feedback-btn",
                                m.feedback === "down" && "is-active is-down"
                              )}
                              aria-label="Não útil"
                              aria-pressed={m.feedback === "down"}
                              onClick={() => void feedback(m.id, "down")}
                            >
                              <ThumbsDown className="h-3 w-3" strokeWidth={1.75} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {sending ? (
                  <div
                    className="nf-nia-msg nf-nia-msg--assistant"
                    aria-label="NIA está analisando"
                  >
                    <div className="nf-nia-msg-col">
                      <div className="nf-nia-bubble nf-nia-bubble--typing">
                        <span className="nf-nia-typing" aria-hidden>
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="nf-nia-typing-label">NIA está analisando…</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="nf-nia-banner nf-nia-banner--error" role="alert">
                    <p>{error}</p>
                    <button
                      type="button"
                      className="nf-nia-retry"
                      onClick={() => {
                        const retry = lastFailed || input.trim();
                        setError(null);
                        if (retry) void sendMessage(retry);
                      }}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Jump to latest */}
              {showJump ? (
                <div className="nf-nia-jump-wrap">
                  <button
                    type="button"
                    className="nf-nia-jump"
                    onClick={jumpToBottom}
                    aria-label="Ir para novas mensagens"
                  >
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                    Novas mensagens
                  </button>
                </div>
              ) : null}

              {/* COMPOSER */}
              <form onSubmit={onSubmit} className="nf-nia-composer">
                <div
                  className={cn(
                    "nf-nia-composer-box",
                    (disabled || sending) && "is-disabled"
                  )}
                >
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Pergunte à NIA…"
                    disabled={disabled || sending}
                    maxLength={2000}
                    className="nf-nia-input"
                    aria-label="Pergunta à NIA"
                  />
                  <button
                    type="submit"
                    disabled={disabled || sending || !input.trim()}
                    className="nf-nia-send"
                    aria-label="Enviar"
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" strokeWidth={1.85} />
                    )}
                  </button>
                </div>
                <p className="nf-nia-composer-hint">
                  Enter para enviar · Shift+Enter para nova linha
                </p>
              </form>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {children}

      {/* Trigger FAB — monograma Sparkles (sem mascote) */}
      <button
        type="button"
        onClick={openNia}
        className={cn("nf-nia-fab", (open || present) && "is-hidden")}
        aria-label="NIA — Assistente da NexaFlow"
        title="NIA"
        data-tour="assistant-trigger"
        aria-hidden={open || present}
        tabIndex={open || present ? -1 : 0}
      >
        <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </button>

      {drawer}
    </>
  );
}
