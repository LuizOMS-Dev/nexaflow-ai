"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { resolveWsUrl, type RealtimeMessage } from "@/lib/realtime";

/**
 * WebSocket autenticado com invalidação em lote (debounce).
 * Evita cascata de refetch a cada evento que trava a UI.
 */
export function useRealtime() {
  const token = useAuth((s) => s.token);
  const tenantId = useAuth((s) => s.tenant?.id);
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const pendingRef = useRef<{
    conversations: boolean;
    dashboard: boolean;
    humanQueue: boolean;
    conversationIds: Set<string>;
    allConversations: boolean;
  }>({
    conversations: false,
    dashboard: false,
    humanQueue: false,
    conversationIds: new Set(),
    allConversations: false,
  });
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    closedRef.current = false;
    if (!token) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function flush() {
      flushTimer.current = null;
      const p = pendingRef.current;
      if (p.conversations) {
        void qc.invalidateQueries({ queryKey: ["conversations"] });
      }
      if (p.dashboard) {
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      if (p.humanQueue) {
        void qc.invalidateQueries({ queryKey: ["human-queue-pending"] });
      }
      if (p.allConversations) {
        void qc.invalidateQueries({ queryKey: ["conversation"] });
      } else {
        for (const id of p.conversationIds) {
          void qc.invalidateQueries({ queryKey: ["conversation", id] });
        }
      }
      pendingRef.current = {
        conversations: false,
        dashboard: false,
        humanQueue: false,
        conversationIds: new Set(),
        allConversations: false,
      };
    }

    function scheduleFlush() {
      if (flushTimer.current) return;
      // Agrupa eventos WS em 350ms — evita dezenas de refetches por segundo
      flushTimer.current = setTimeout(flush, 350);
    }

    function handleEvent(msg: RealtimeMessage) {
      const event = msg.event;
      if (event === "connected" || event === "error" || event === "pong") return;

      const payload = (msg.payload || {}) as {
        conversationId?: string;
        id?: string;
        conversation?: { id?: string };
      };

      const conversationId =
        payload.conversationId ||
        payload.conversation?.id ||
        (event === "conversation.deleted" || event === "conversation.updated"
          ? payload.id
          : undefined);

      if (
        event === "message.created" ||
        event === "conversation.created" ||
        event === "conversation.updated" ||
        event === "conversation.deleted" ||
        event === "notification.created"
      ) {
        pendingRef.current.conversations = true;
        pendingRef.current.dashboard = true;
        pendingRef.current.humanQueue = true;
      }

      if (conversationId) {
        pendingRef.current.conversationIds.add(conversationId);
        if (event === "conversation.deleted") {
          qc.removeQueries({ queryKey: ["conversation", conversationId] });
        }
      } else if (event === "message.created") {
        pendingRef.current.allConversations = true;
      }

      // Dispara eventos DOM para o banner do topo (som + refetch imediato)
      if (typeof window !== "undefined") {
        if (event === "notification.created" || event === "conversation.updated") {
          try {
            window.dispatchEvent(
              new CustomEvent("nexaflow:notification", { detail: msg.payload })
            );
            window.dispatchEvent(
              new CustomEvent("nexaflow:conversation-updated", {
                detail: msg.payload,
              })
            );
          } catch {
            /* ignore */
          }
        }
        if (event === "platform.release.published" || event === "notification.created") {
          try {
            const p = (msg.payload || {}) as { type?: string; toast?: boolean };
            if (p.type === "PLATFORM_RELEASE" || event === "platform.release.published") {
              window.dispatchEvent(
                new CustomEvent("nexaflow:platform-release", { detail: msg.payload })
              );
              void qc.invalidateQueries({ queryKey: ["notifications"] });
              void qc.invalidateQueries({ queryKey: ["changelog-unseen"] });
              void qc.invalidateQueries({ queryKey: ["changelog"] });
            }
          } catch {
            /* ignore */
          }
        }
      }

      scheduleFlush();
    }

    function connect() {
      if (closedRef.current) return;
      // Evita múltiplos sockets abertos
      if (wsRef.current && wsRef.current.readyState <= 1) return;

      // O token é enviado somente depois que o socket abre; nunca entra na URL/logs.
      const url = resolveWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        try {
          ws.send(JSON.stringify({ type: "auth", token }));
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as RealtimeMessage;
          handleEvent(msg);
        } catch {
          /* ignore parse */
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedRef.current) return;
        const attempt = retryRef.current++;
        // Backoff mais gentil (até 20s)
        const delay = Math.min(20_000, 1500 * Math.pow(1.7, attempt));
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    }

    connect();

    function onVisible() {
      if (document.visibilityState === "visible") {
        if (!wsRef.current || wsRef.current.readyState > 1) {
          connect();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closedRef.current = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
    // tenantId intencional: reconnect ao trocar empresa (JWT/escopo muda)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qc estável via QueryClient
  }, [token, tenantId]);
}
