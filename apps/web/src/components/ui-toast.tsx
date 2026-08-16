"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "warning" | "info" | "loading";

export type ToastOptions = {
  id?: string;
  key?: string;
  kind?: ToastKind;
  title: string;
  description?: ReactNode;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export type ToastFunction = {
  (opts: ToastOptions | string): string;
  success: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) => string;
  error: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) => string;
  warning: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) => string;
  info: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) => string;
  loading: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) => string;
  dismiss: (id?: string) => void;
  update: (id: string, opts: Partial<ToastOptions>) => void;
};

export type ToastContextValue = {
  toast: ToastFunction;
  dismiss: (id?: string) => void;
};

type ActiveToast = {
  id: string;
  key: string;
  kind: ToastKind;
  title: string;
  description?: ReactNode;
  duration: number; // 0 means persistent
  createdAt: number;
  exiting?: boolean;
  refreshCount: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

const DEFAULT_DURATIONS: Record<ToastKind, number> = {
  success: 3800,
  info: 4000,
  warning: 5000,
  error: 6000,
  loading: 0,
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    const fallbackFn = ((opts: ToastOptions | string) => {
      const title = typeof opts === "string" ? opts : opts.title;
      const kind = typeof opts === "object" ? opts.kind || "info" : "info";
      if (typeof window !== "undefined") {
        console.info(`[toast:${kind}]`, title);
      }
      return "fallback-id";
    }) as ToastFunction;

    fallbackFn.success = (t) => {
      console.info("[toast:success]", t);
      return "fallback-id";
    };
    fallbackFn.error = (t) => {
      console.info("[toast:error]", t);
      return "fallback-id";
    };
    fallbackFn.warning = (t) => {
      console.info("[toast:warning]", t);
      return "fallback-id";
    };
    fallbackFn.info = (t) => {
      console.info("[toast:info]", t);
      return "fallback-id";
    };
    fallbackFn.loading = (t) => {
      console.info("[toast:loading]", t);
      return "fallback-id";
    };
    fallbackFn.dismiss = () => {};
    fallbackFn.update = () => {};

    return { toast: fallbackFn, dismiss: () => {} };
  }
  return ctx;
}

const statusConfig: Record<
  ToastKind,
  {
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    badgeClass: string;
    progressClass: string;
  }
> = {
  success: {
    Icon: CheckCircle2,
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    progressClass: "bg-emerald-500/80 dark:bg-emerald-400/90",
  },
  error: {
    Icon: AlertCircle,
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    progressClass: "bg-rose-500/80 dark:bg-rose-400/90",
  },
  warning: {
    Icon: AlertTriangle,
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    progressClass: "bg-amber-500/80 dark:bg-amber-400/90",
  },
  info: {
    Icon: Info,
    badgeClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    progressClass: "bg-violet-500/80 dark:bg-violet-400/90",
  },
  loading: {
    Icon: Loader2,
    badgeClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    progressClass: "bg-violet-500/80 dark:bg-violet-400/90",
  },
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ActiveToast;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef<number>(item.duration);
  const lastStartRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  const { Icon, badgeClass, progressClass } = statusConfig[item.kind] || statusConfig.info;
  const isAutoDismiss = item.duration > 0;

  // Gerencia o temporizador com suporte a pause/resume no hover
  useEffect(() => {
    if (!isAutoDismiss || item.exiting) return;

    if (!paused) {
      lastStartRef.current = Date.now();
      timerRef.current = window.setTimeout(() => {
        onDismiss(item.id);
      }, remainingRef.current);
    } else {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const elapsed = Date.now() - lastStartRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paused, isAutoDismiss, item.id, item.exiting, onDismiss, item.refreshCount]);

  // Se o toast for atualizado/reiniciado, reseta remainingRef
  useEffect(() => {
    remainingRef.current = item.duration;
    lastStartRef.current = Date.now();
  }, [item.refreshCount, item.duration]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      aria-live={item.kind === "error" ? "assertive" : "polite"}
      data-toast-id={item.id}
      data-toast-kind={item.kind}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "nf-toast-card group relative flex w-full max-w-[360px] items-start gap-3 rounded-2xl p-3.5 select-none",
        "border border-black/[0.08] bg-white/95 text-ink shadow-xl shadow-black/10 backdrop-blur-md",
        "dark:border-white/[0.08] dark:bg-[#12141c]/95 dark:text-zinc-100 dark:shadow-2xl dark:shadow-black/70",
        item.exiting ? "nf-toast-out" : "nf-toast-in"
      )}
    >
      {/* ── ÍCONE COM BADGE DEDICADO ── */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-colors",
          badgeClass
        )}
        aria-hidden
      >
        <Icon
          className={cn("h-4 w-4", item.kind === "loading" && "animate-spin")}
          strokeWidth={item.kind === "loading" ? 2 : 2.25}
        />
      </div>

      {/* ── CONTEÚDO PRINCIPAL (TÍTULO + DESCRIÇÃO OPCIONAL + AÇÃO) ── */}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] font-semibold leading-tight tracking-tight text-ink dark:text-zinc-100">
          {item.title}
        </p>

        {item.description ? (
          <div className="mt-1 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
            {item.description}
          </div>
        ) : null}

        {item.action ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                onDismiss(item.id);
              }}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline underline-offset-2"
            >
              {item.action.label}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── BOTÃO FECHAR DISCRETO ── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        aria-label="Fechar notificação"
        className="shrink-0 -mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-black/[0.04] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {/* ── BARRA DE PROGRESSO DO TEMPO RESTANTE ── */}
      {isAutoDismiss && !item.exiting ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[2.5px] overflow-hidden rounded-b-2xl bg-black/[0.04] dark:bg-white/[0.05]"
          aria-hidden
        >
          <div
            key={item.refreshCount}
            className={cn("h-full", progressClass)}
            style={{
              animation: `nf-toast-progress ${item.duration}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ActiveToast[]>([]);

  const dismiss = useCallback((id?: string) => {
    if (!id) {
      setItems((prev) => prev.map((t) => ({ ...t, exiting: true })));
      window.setTimeout(() => setItems([]), 160);
      return;
    }

    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 160);
  }, []);

  const update = useCallback((id: string, opts: Partial<ToastOptions>) => {
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const newKind = opts.kind || t.kind;
        const newDuration =
          opts.duration !== undefined
            ? opts.duration
            : opts.kind
            ? DEFAULT_DURATIONS[newKind]
            : t.duration;
        return {
          ...t,
          ...opts,
          kind: newKind,
          duration: newDuration,
          refreshCount: t.refreshCount + 1,
        };
      })
    );
  }, []);

  const pushToast = useCallback(
    (rawOpts: ToastOptions | string): string => {
      const opts: ToastOptions =
        typeof rawOpts === "string" ? { title: rawOpts } : rawOpts;

      const kind: ToastKind = opts.kind || "info";
      const title = opts.title.trim();
      const dedupKey = opts.key || `${kind}:${title}`;
      const duration =
        opts.duration !== undefined ? opts.duration : DEFAULT_DURATIONS[kind];

      let generatedId = opts.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setItems((prev) => {
        // 1. Deduplicação inteligente: se o mesmo toast já está ativo, atualiza e reseta o tempo
        const existingIdx = prev.findIndex(
          (t) => !t.exiting && t.key === dedupKey
        );

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          generatedId = existing.id;
          const updated = [...prev];
          updated[existingIdx] = {
            ...existing,
            title,
            description: opts.description ?? existing.description,
            duration,
            action: opts.action ?? existing.action,
            exiting: false,
            refreshCount: existing.refreshCount + 1,
          };
          return updated;
        }

        // 2. Novo toast: mantém no máximo 4 toasts simultâneos
        const newToast: ActiveToast = {
          id: generatedId,
          key: dedupKey,
          kind,
          title,
          description: opts.description,
          duration,
          createdAt: Date.now(),
          refreshCount: 0,
          action: opts.action,
        };

        const activeList = prev.filter((t) => !t.exiting);
        if (activeList.length >= 4) {
          return [...prev.slice(-3), newToast];
        }
        return [...prev, newToast];
      });

      return generatedId;
    },
    []
  );

  const toastObj: ToastFunction = Object.assign(
    (opts: ToastOptions | string) => pushToast(opts),
    {
      success: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) =>
        pushToast({ ...opts, kind: "success", title, description }),
      error: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) =>
        pushToast({ ...opts, kind: "error", title, description }),
      warning: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) =>
        pushToast({ ...opts, kind: "warning", title, description }),
      info: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) =>
        pushToast({ ...opts, kind: "info", title, description }),
      loading: (title: string, description?: ReactNode, opts?: Partial<ToastOptions>) =>
        pushToast({ ...opts, kind: "loading", title, description, duration: 0 }),
      dismiss: (id?: string) => dismiss(id),
      update: (id: string, opts: Partial<ToastOptions>) => update(id, opts),
    }
  );

  return (
    <ToastContext.Provider value={{ toast: toastObj, dismiss }}>
      {children}
      <div
        className="nf-toast-viewport pointer-events-none fixed z-[var(--z-toast,80)] flex flex-col gap-2.5"
        aria-label="Notificações"
      >
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
