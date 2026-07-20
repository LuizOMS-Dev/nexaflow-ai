"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { playNotificationSound, primeNotificationAudio } from "@/lib/notification-sound";

type Notif = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

type PanelPos = {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
};

type ClearPhase = "idle" | "animating" | "done";

function notifTypeLabel(type: string, title?: string): string {
  const t = (type || "").toUpperCase();
  if (t === "PLATFORM_RELEASE") return "Novidade";
  if (t === "CONVERSATION_ASSIGNED") {
    if (title && /assumir|ia pediu|fila/i.test(title)) return "Assumir";
    return "Atendimento";
  }
  if (t === "CHANNEL_DISCONNECTED") return "Canal";
  if (t === "SECURITY_EVENT") return "Segurança";
  if (t === "TASK_OVERDUE") return "Tarefa";
  if (t === "SYSTEM") return "Sistema";
  return type.replace(/_/g, " ").toLowerCase();
}

/**
 * Painel de notificações via Portal no document.body.
 * Nunca renderiza dentro da sidebar (overflow:hidden da rail).
 * Abre sempre à DIREITA do sino / rail — expandida ou recolhida.
 */
export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const [clearPhase, setClearPhase] = useState<ClearPhase>("idle");
  const [clearingItems, setClearingItems] = useState<Notif[] | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Notif[]; unread: number }>("/notifications"),
    enabled: Boolean(user && token !== undefined),
    /* Painel fechado: polling lento; aberto: ainda conservador */
    refetchInterval: open ? 30_000 : 90_000,
    staleTime: 20_000,
  });

  const readOne = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const clearAll = useMutation({
    mutationFn: () => api<{ ok: boolean; deleted: number }>("/notifications/clear", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(["notifications"], { items: [], unread: 0 });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => setMounted(true), []);

  // Destrava áudio no primeiro clique/tecla (política de autoplay dos browsers)
  useEffect(() => {
    const prime = () => primeNotificationAudio();
    window.addEventListener("pointerdown", prime, { once: true, passive: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  // Realtime: invalida sino + toca som sempre que chega notificação
  useEffect(() => {
    function onNotif(ev: Event) {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["changelog-unseen"] });
      void qc.invalidateQueries({ queryKey: ["changelog"] });
      // Sempre toca ao receber (handoff, assign, release, etc.)
      const detail = (ev as CustomEvent).detail as { playSound?: boolean } | undefined;
      playNotificationSound({ force: detail?.playSound === true });
    }
    window.addEventListener("nexaflow:notification", onNotif);
    window.addEventListener("nexaflow:platform-release", onNotif);
    return () => {
      window.removeEventListener("nexaflow:notification", onNotif);
      window.removeEventListener("nexaflow:platform-release", onNotif);
    };
  }, [qc]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  // Reset da animação ao fechar o painel
  useEffect(() => {
    if (!open) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setClearPhase("idle");
      setClearingItems(null);
    }
  }, [open]);

  const updatePosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;
    const isMobile = vw < 640;

    // Largura do painel (desktop ~380px)
    let width = Math.min(380, vw - 16);
    if (isMobile) width = Math.min(vw - 24, 400);

    // Preferir borda direita da sidebar rail (fonte de verdade da largura atual)
    const rail =
      btn.closest(".nf-sidebar-rail") ||
      document.querySelector(".nf-sidebar-rail");
    const railRight = rail
      ? (rail as HTMLElement).getBoundingClientRect().right
      : r.right;

    // Abre à direita da sidebar / sino
    let left = isMobile ? 12 : railRight + gap;
    // Se não couber à direita, ancora à esquerda da viewport com margem
    if (left + width > vw - 8) {
      left = Math.max(8, vw - width - 8);
    }

    // Alinha o fundo do painel com o fundo do botão (sino fica no rodapé)
    // bottom CSS = distância da borda inferior da viewport até a borda inferior do botão
    let bottom = Math.max(8, vh - r.bottom);
    const maxHeight = Math.min(vh - bottom - 12, vh - 24, 440);

    // Se o painel ficar alto demais e cortar o topo, sobe um pouco o bottom
    if (vh - bottom - maxHeight < 12) {
      bottom = Math.max(8, vh - maxHeight - 12);
    }

    setPos({ left, bottom, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();

    const onWin = () => updatePosition();
    window.addEventListener("resize", onWin);
    // scroll em qualquer container (sidebar, main)
    window.addEventListener("scroll", onWin, true);

    // sidebar muda de largura (expand/collapse)
    const rail = document.querySelector(".nf-sidebar-rail");
    const ro = rail ? new ResizeObserver(onWin) : null;
    if (rail && ro) ro.observe(rail);

    // observar data-collapsed no shell
    const shell = document.querySelector(".nf-app-shell");
    const mo =
      shell &&
      new MutationObserver(onWin);
    if (shell && mo) {
      mo.observe(shell, { attributes: true, attributeFilter: ["data-collapsed"] });
    }

    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [open, collapsed, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleClear = useCallback(() => {
    if (clearPhase !== "idle" || clearAll.isPending) return;
    const snapshot = data?.items || [];
    if (snapshot.length === 0) return;

    // Máx. 6 itens animados — lista longa some com o mesmo gesto, sem peso
    setClearingItems(snapshot.slice(0, 6));
    setClearPhase("animating");

    // API em paralelo com a animação
    clearAll.mutate();

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    // ~380ms anim + stagger leve → estado "limpo"
    clearTimerRef.current = setTimeout(() => {
      setClearPhase("done");
      clearTimerRef.current = setTimeout(() => {
        setClearPhase("idle");
        setClearingItems(null);
      }, 520);
    }, 400);
  }, [clearPhase, clearAll, data?.items]);

  if (!user) return null;

  const unread = data?.unread || 0;
  const liveItems = data?.items || [];
  const isClearing = clearPhase === "animating" || clearPhase === "done";
  // Durante a animação, mantém o snapshot para o visual "indo pra lixeira"
  const displayItems = isClearing && clearingItems ? clearingItems : liveItems;
  const showEmpty =
    !isClearing && displayItems.length === 0;
  const canClear = !isClearing && liveItems.length > 0 && clearPhase === "idle";

  const panel =
    open && mounted && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="nf-notif-panel"
            style={{
              position: "fixed",
              zIndex: "var(--z-dropdown)",
              left: pos.left,
              bottom: pos.bottom,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
            role="dialog"
            aria-label="Notificações"
            aria-modal="false"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 dark:border-white/[0.06]">
              <p className="text-sm font-semibold text-ink dark:text-white">Notificações</p>
              <div className="flex items-center gap-2.5">
                {unread > 0 && !isClearing && (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-brand-600 dark:text-brand-400"
                    onClick={() => readAll.mutate()}
                    disabled={readAll.isPending}
                  >
                    Marcar todas
                  </button>
                )}
                {canClear && (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-medium",
                      "text-ink-muted transition-colors hover:text-ink",
                      "dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                    onClick={handleClear}
                    disabled={clearAll.isPending}
                    aria-label="Limpar todas as notificações"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                    Limpar
                  </button>
                )}
              </div>
            </div>
            <div
              className={cn(
                "relative min-h-0 flex-1 overflow-y-auto overscroll-contain",
                clearPhase === "animating" && "nf-notif-list-clearing"
              )}
              style={{ maxHeight: `calc(${pos.maxHeight}px - 3rem)` }}
            >
              {showEmpty ? (
                <p className="px-4 py-8 text-center text-xs text-ink-muted">
                  Nenhuma notificação.
                </p>
              ) : clearPhase === "done" ? (
                <div className="nf-notif-trash-sink is-done" aria-live="polite">
                  <div className="nf-notif-trash-icon">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </div>
                  <p className="text-[12px] font-medium text-ink-muted dark:text-gray-400">
                    Tudo limpo
                  </p>
                </div>
              ) : (
                <>
                  {displayItems.map((n, i) => {
                    const url = n.actionUrl || n.href;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={cn(
                          "flex w-full flex-col gap-0.5 border-b border-line-soft px-3.5 py-3 text-left transition-colors last:border-0",
                          "hover:bg-black/[0.03] dark:border-white/[0.04] dark:hover:bg-white/[0.04]",
                          !n.readAt && "bg-brand-50/40 dark:bg-brand-500/[0.06]",
                          clearPhase === "animating" && "nf-notif-item-clearing"
                        )}
                        style={
                          clearPhase === "animating"
                            ? { animationDelay: `${Math.min(i, 5) * 32}ms` }
                            : undefined
                        }
                        disabled={isClearing}
                        onClick={() => {
                          if (isClearing) return;
                          if (!n.readAt) readOne.mutate(n.id);
                          setOpen(false);
                          // Release arquivada / URL inválida: fallback seguro
                          if (url && url.startsWith("/app")) {
                            router.push(url);
                          } else if (n.type === "PLATFORM_RELEASE") {
                            router.push("/app/whats-new");
                          }
                        }}
                      >
                        <span className="text-[13px] font-medium leading-snug text-ink dark:text-gray-100">
                          {n.title}
                        </span>
                        {n.body ? (
                          <span className="line-clamp-2 text-[11px] leading-relaxed text-ink-muted">
                            {n.body}
                          </span>
                        ) : null}
                        <span className="mt-0.5 text-[10px] text-ink-faint">
                          {notifTypeLabel(n.type, n.title)}
                        </span>
                      </button>
                    );
                  })}
                  {clearPhase === "animating" && (
                    <div className="nf-notif-trash-catch" aria-hidden>
                      <div className="nf-notif-trash-icon">
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("nf-notif-bell-wrap", collapsed && "flex justify-center")}>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors",
          "hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/[0.06] dark:hover:text-gray-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
          collapsed ? "h-9 w-9" : "h-8 w-8"
        )}
        aria-label={unread ? `${unread} notificações não lidas` : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Bell className="h-4 w-4" strokeWidth={1.5} />
        {unread > 0 && (
          <span
            className={cn(
              "pointer-events-none absolute flex h-[15px] min-w-[15px] items-center justify-center rounded-full",
              "bg-brand-600 px-[3px] text-[9px] font-semibold leading-none text-white",
              "ring-2 ring-[#FAFBFC] dark:ring-[#0E1016]",
              /* ancorado no canto do botão — não “solto” */
              "-right-0.5 -top-0.5"
            )}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
