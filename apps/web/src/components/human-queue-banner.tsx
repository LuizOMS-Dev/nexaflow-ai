"use client";

/**
 * Banner fixo no topo: chats na fila humana (aguardando alguém assumir).
 * Também toca aviso sonoro opcional quando a fila cresce.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { playNotificationSound } from "@/lib/notification-sound";

type WaitingHumanResponse = {
  count: number;
  items: Array<{
    id: string;
    contactName: string;
    preview?: string | null;
    lastMessageAt?: string | null;
  }>;
};

const DISMISS_KEY = "nexaflow_human_queue_dismissed";
const SOUND_PREF_KEY = "nexaflow_human_queue_sound";

export function HumanQueueBanner() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const tenant = useAuth((s) => s.tenant);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);

  const enabled = Boolean(user && token !== undefined && tenant?.id);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const prevCountRef = useRef<number | null>(null);
  const primedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      setDismissedAt(raw ? Number(raw) : null);
      const snd = localStorage.getItem(SOUND_PREF_KEY);
      if (snd === "0") setSoundOn(false);
      else if (snd === "1") setSoundOn(true);
    } catch {
      setDismissedAt(null);
    }
  }, [tenant?.id]);

  // Preferência da empresa (settings.attendance.aiHandoff.soundAlert) como default
  useEffect(() => {
    if (!enabled || !tenant?.id) return;
    let cancelled = false;
    void api<{ settings?: { attendance?: { aiHandoff?: { soundAlert?: boolean } } } }>(
      "/settings"
    )
      .then((s) => {
        if (cancelled) return;
        try {
          // Só aplica se o usuário ainda não escolheu no banner
          if (localStorage.getItem(SOUND_PREF_KEY) != null) return;
        } catch {
          /* ignore */
        }
        const companySound = s.settings?.attendance?.aiHandoff?.soundAlert;
        if (typeof companySound === "boolean") setSoundOn(companySound);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [enabled, tenant?.id]);

  // Atualiza contagem quando chega evento de conversa/notificação (WS + local)
  // Som de notificação é tocado no NotificationBell (sempre); aqui reforça se a fila sobe.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onEvt = (ev: Event) => {
      void qc.invalidateQueries({ queryKey: ["human-queue-pending", tenant?.id] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.refetchQueries({ queryKey: ["human-queue-pending", tenant?.id] });
      const detail = (ev as CustomEvent).detail as
        | { waitingHuman?: boolean; humanHandoff?: boolean; playSound?: boolean }
        | undefined;
      // Reforço sonoro em handoff (mesmo se o sino ainda não montou)
      if (detail?.waitingHuman || detail?.humanHandoff || detail?.playSound) {
        playNotificationSound({ force: true });
      }
    };
    window.addEventListener("nexaflow:conversation-updated", onEvt);
    window.addEventListener("nexaflow:notification", onEvt);
    return () => {
      window.removeEventListener("nexaflow:conversation-updated", onEvt);
      window.removeEventListener("nexaflow:notification", onEvt);
    };
  }, [enabled, tenant?.id, qc]);

  const { data, isError, isFetching } = useQuery({
    queryKey: ["human-queue-pending", tenant?.id],
    queryFn: () => api<WaitingHumanResponse>("/conversations/waiting-human"),
    enabled,
    staleTime: 3_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const count = data?.count ?? 0;
  const items = data?.items || [];

  // Som quando a fila sobe (após primeira carga) + tenta destravar AudioContext no clique
  useEffect(() => {
    if (!enabled) return;
    if (prevCountRef.current === null) {
      prevCountRef.current = count;
      primedRef.current = true;
      return;
    }
    if (soundOn && primedRef.current && count > prevCountRef.current) {
      playNotificationSound({ force: true });
      window.setTimeout(() => {
        if (soundOn) playNotificationSound({ force: true });
      }, 280);
    }
    prevCountRef.current = count;
  }, [count, enabled, soundOn]);

  // Esconde se não há fila, erro, ou usuário dispensou nesta sessão (e contagem não subiu)
  if (!enabled || isError || count < 1) return null;
  if (dismissedAt && count > 0) {
    const dismissedCount = (() => {
      try {
        return Number(sessionStorage.getItem(`${DISMISS_KEY}_count`) || 0);
      } catch {
        return 0;
      }
    })();
    if (count <= dismissedCount) return null;
  }

  const first = items[0];
  const title =
    count === 1
      ? first?.contactName
        ? `${first.contactName} aguarda um atendente`
        : "1 conversa aguarda um atendente"
      : `${count} conversas aguardam um atendente`;

  const body =
    count === 1
      ? "A IA pausou o atendimento. Abra a conversa e toque em Assumir para assumir a responsabilidade."
      : "Há chats na fila humana. Abra a fila, escolha um e toque em Assumir.";

  const href =
    count === 1 && first?.id
      ? `/app/inbox?status=PENDING&c=${first.id}`
      : "/app/inbox?status=PENDING";

  const onPendingInbox =
    pathname?.startsWith("/app/inbox") &&
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("status") === "PENDING"
      : false);

  // Banner só navega — não executa Assumir. Label honesto (leia §13).
  const ctaLabel = count === 1 ? "Abrir conversa" : "Ver atendimentos";

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
      sessionStorage.setItem(`${DISMISS_KEY}_count`, String(count));
    } catch {
      /* ignore */
    }
    setDismissedAt(Date.now());
  }

  function toggleSound() {
    setSoundOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div
      role="status"
      aria-live="assertive"
      data-tour="human-queue-banner"
      className={cn(
        "sticky top-0 z-40 mb-0 border-b px-3 py-2.5 sm:px-4",
        "border-amber-500/[0.35] bg-amber-50/[0.97] shadow-[0_4px_16px_-8px_rgba(180,83,9,0.25)] backdrop-blur-md",
        "dark:border-amber-400/30 dark:bg-amber-950/[0.92] dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]"
      )}
    >
      <div className="mx-auto flex w-full max-w-[var(--nf-page-max-width)] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-100">
            <Headphones className="h-4 w-4" strokeWidth={1.75} />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-ink dark:text-white">
              {title}
              {isFetching ? (
                <span className="ml-1.5 text-[10px] font-normal text-ink-faint">atualizando…</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-muted dark:text-gray-300">
              {body}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:self-center">
          <button
            type="button"
            className={cn(
              "btn-ghost h-8 w-8 px-0",
              soundOn ? "text-amber-800 dark:text-amber-200" : "text-ink-faint"
            )}
            aria-label={soundOn ? "Desativar som do aviso" : "Ativar som do aviso"}
            title={soundOn ? "Som ligado" : "Som desligado"}
            onClick={toggleSound}
          >
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          {!onPendingInbox ? (
            <Link href={href} className="btn-primary h-8 px-3 text-[12px]">
              {ctaLabel}
            </Link>
          ) : (
            <Link href={href} className="btn-secondary h-8 px-3 text-[12px]">
              Atualizar lista
            </Link>
          )}
          <button
            type="button"
            className="btn-ghost h-8 w-8 px-0 text-ink-faint"
            aria-label="Dispensar aviso"
            onClick={dismiss}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
