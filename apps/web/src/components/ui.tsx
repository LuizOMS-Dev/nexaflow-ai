"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Spinner ─── */

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-brand-600 dark:text-brand-400", className)}
      aria-hidden
    />
  );
}

/* ─── Skeleton ─── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function StatCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line-soft dark:divide-white/[0.04]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/* ─── Empty state ─── */

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "nf-empty flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-5 py-12",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-black/[0.05] bg-gradient-to-b from-black/[0.03] to-transparent text-ink-faint shadow-sm dark:border-white/[0.06] dark:from-white/[0.05] dark:text-gray-400">
          {icon}
        </div>
      ) : null}
      <p className="text-[14px] font-semibold tracking-tight text-ink dark:text-gray-200">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-faint">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ─── Page header ─── */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="nf-page-header mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ink-faint"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="select-none text-ink-faint/50">/</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="transition-colors hover:text-ink-secondary dark:hover:text-gray-300"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span
                    className={
                      i === breadcrumbs.length - 1
                        ? "text-ink-muted dark:text-gray-400"
                        : ""
                    }
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-[1.45rem] font-semibold leading-[1.15] tracking-[-0.035em] text-ink dark:text-white sm:text-[1.6rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pb-0.5">{actions}</div>
      )}
    </div>
  );
}

/* ─── Modal shell v2 — SaaS premium (portal no body) ─── */

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

/**
 * Padrões de composição (Design System NexaFlow):
 * - soft / default · Form Dialog
 * - contextual · formulário com zonas semânticas
 * - builder · Quando → Então
 * - sandbox · teste / chat
 * - confirm · confirmação
 * - danger · exclusão / ação irreversível (tom vermelho)
 * - quick · ajuste mínimo
 * - detail · visualização / auditoria
 */
export type ModalVariant =
  | "default"
  | "soft"
  | "contextual"
  | "confirm"
  | "danger"
  | "sandbox"
  | "builder"
  | "quick"
  | "detail";

export type ModalTone = "default" | "brand" | "warning" | "danger" | "success" | "violet";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  description,
  preventClose,
  icon,
  footer,
  size,
  variant = "soft",
  tone,
  headerExtra,
  mobileSheet = true,
  /**
   * first-field = foco no 1º input (padrão)
   * panel = painel do dialog (formulários longos — evita jank no open)
   * none = só trap de Tab, sem auto-focus
   */
  initialFocus = "first-field",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** @deprecated use size="lg" */
  wide?: boolean;
  description?: string;
  preventClose?: boolean;
  icon?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  variant?: ModalVariant;
  /** Força cor do ícone (danger/warning etc.) */
  tone?: ModalTone;
  /** Conteúdo extra no header (badge, status) */
  headerExtra?: ReactNode;
  /** Mobile: bottom sheet (padrão). false = centralizado também no mobile */
  mobileSheet?: boolean;
  initialFocus?: "first-field" | "panel" | "none";
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);
  const initialFocusRef = useRef(initialFocus);
  const [mounted, setMounted] = useState(false);
  initialFocusRef.current = initialFocus;

  const isConfirm = variant === "confirm" || variant === "danger";
  const isDanger = variant === "danger" || tone === "danger";
  const isQuick = variant === "quick";
  const isContextual = variant === "contextual";
  const isBuilder = variant === "builder";
  const isSandbox = variant === "sandbox";
  const isDetail = variant === "detail";

  const resolvedTone: ModalTone =
    tone ||
    (isDanger
      ? "danger"
      : isBuilder
        ? "violet"
        : isContextual
          ? "success"
          : isConfirm
            ? "warning"
            : "brand");

  const resolvedSize: ModalSize =
    size ||
    (wide
      ? "lg"
      : isConfirm || isQuick
        ? "sm"
        : isSandbox || isBuilder
          ? "lg"
          : "md");

  const sizeClass =
    resolvedSize === "sm"
      ? "sm:max-w-[24rem]"
      : resolvedSize === "lg"
        ? "sm:max-w-2xl"
        : resolvedSize === "xl"
          ? "sm:max-w-3xl"
          : resolvedSize === "full"
            ? "sm:max-w-[min(96vw,56rem)]"
            : "sm:max-w-[30rem]";

  const iconToneClass: Record<ModalTone, string> = {
    default:
      "bg-black/[0.04] text-ink-secondary ring-black/[0.06] dark:bg-white/[0.06] dark:text-gray-200 dark:ring-white/[0.08]",
    brand:
      "bg-brand-500/[0.12] text-brand-600 ring-brand-500/[0.15] dark:text-brand-300 dark:ring-brand-400/20",
    warning:
      "bg-amber-500/[0.12] text-amber-700 ring-amber-500/[0.15] dark:text-amber-200 dark:ring-amber-400/20",
    danger:
      "bg-rose-500/[0.12] text-rose-600 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-400/25",
    success:
      "bg-emerald-500/[0.12] text-emerald-700 ring-emerald-500/[0.15] dark:text-emerald-300 dark:ring-emerald-400/20",
    violet:
      "bg-violet-500/[0.14] text-violet-600 ring-violet-500/[0.15] dark:text-violet-300 dark:ring-violet-400/20",
  };

  useEffect(() => {
    onCloseRef.current = onClose;
    preventCloseRef.current = preventClose;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const prev = previouslyFocused.current;
        previouslyFocused.current = null;
        requestAnimationFrame(function restoreFocus() {
          if (prev && typeof prev.focus === "function" && document.contains(prev)) {
            prev.focus();
          }
        });
      }
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !preventCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sb > 0) document.body.style.paddingRight = `${sb}px`;

    let t: ReturnType<typeof setTimeout> | undefined;
    if (justOpened && initialFocusRef.current !== "none") {
      // rAF: deixa o layout do formulário assentar antes do focus (evita travar no open)
      t = setTimeout(() => {
        const root = panelRef.current;
        if (!root) return;
        if (root.contains(document.activeElement)) return;
        if (initialFocusRef.current === "panel") {
          if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
          root.focus({ preventScroll: true });
          return;
        }
        const first =
          root.querySelector<HTMLElement>(
            "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button.nf-select-trigger:not([disabled])"
          ) || root.querySelector<HTMLElement>("button:not([disabled])");
        first?.focus({ preventScroll: true });
      }, 16);
    }

    return () => {
      if (t !== undefined) clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const handleBackdrop = () => {
    if (!preventClose) onClose();
  };

  const compact = isQuick || isConfirm;

  return createPortal(
    <div
      className={cn(
        "nf-modal-root fixed inset-0 flex justify-center",
        mobileSheet ? "items-end sm:items-center" : "items-center",
        "p-0 sm:p-5 md:p-8"
      )}
      style={{ zIndex: "var(--z-modal-backdrop)" }}
      role="presentation"
    >
      <div
        className="nf-modal-backdrop absolute inset-0 bg-black/50 dark:bg-black/[0.65]"
        onClick={handleBackdrop}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={cn(
          "nf-modal-panel relative flex w-full flex-col overflow-hidden",
          /* Superfície sólida (sem translucidez) — evita flash branco no dark */
          "border border-black/[0.06] bg-white",
          "shadow-[0_24px_64px_-16px_rgba(15,23,42,0.28),0_0_0_1px_rgba(15,23,42,0.04)]",
          "dark:border-white/[0.08] dark:bg-[#151820]",
          "dark:shadow-[0_28px_70px_-18px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)]",
          mobileSheet
            ? "max-h-[min(92dvh,900px)] rounded-t-[1.5rem] sm:max-h-[min(88dvh,840px)] sm:rounded-[1.4rem]"
            : "max-h-[min(90dvh,880px)] rounded-[1.4rem]",
          isDanger && "dark:border-rose-500/[0.15]",
          sizeClass
        )}
        style={{ zIndex: "var(--z-modal)" }}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        data-variant={variant}
        data-tone={resolvedTone}
      >
        {/* Mobile sheet handle */}
        {mobileSheet ? (
          <div
            className="flex justify-center pb-0 pt-2.5 sm:hidden"
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-black/10 dark:bg-white/[0.15]" />
          </div>
        ) : null}

        {/* edge highlight */}
        <div
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-70 dark:via-white/20"
          aria-hidden
        />

        <header
          className={cn(
            "nf-modal-header relative flex shrink-0 items-start justify-between gap-3 px-5 sm:px-6",
            compact ? "pb-2 pt-3 sm:pt-5" : "pb-3 pt-4 sm:pt-6"
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3.5 pr-1">
            {icon || isConfirm ? (
              <div
                className={cn(
                  "mt-0.5 flex shrink-0 items-center justify-center ring-1 ring-inset",
                  compact ? "h-10 w-10 rounded-xl" : "h-11 w-11 rounded-2xl",
                  iconToneClass[resolvedTone]
                )}
              >
                {icon || (
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                )}
              </div>
            ) : null}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={titleId}
                  className={cn(
                    "font-display font-semibold leading-snug tracking-[-0.025em] text-ink dark:text-white",
                    compact ? "text-[1.02rem]" : "text-[1.2rem]"
                  )}
                >
                  {title}
                </h2>
                {headerExtra}
              </div>
              {description ? (
                <p
                  id={descId}
                  className={cn(
                    "max-w-prose leading-relaxed text-ink-muted",
                    compact ? "mt-1 text-[12.5px]" : "mt-1.5 text-[13px]"
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {!preventClose ? (
            <button
              type="button"
              className="btn-ghost -mr-1 -mt-0.5 h-9 w-9 shrink-0 rounded-xl px-0 text-ink-faint hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/[0.06]"
              onClick={() => onClose()}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </header>

        <div
          className={cn(
            "nf-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6",
            compact ? "py-2.5" : "py-1 pb-4",
            (isSandbox || isDetail) && "flex flex-col"
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer
            className={cn(
              /* Fundo só via .nf-dialog-footer no CSS (sólido light/dark) — evita footer branco no dark */
              "nf-dialog-footer flex shrink-0 flex-col-reverse gap-2 px-5 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5 sm:px-6",
              compact ? "py-3.5" : "py-4",
              isDanger && "nf-dialog-footer--danger"
            )}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** Resumo de entidade no topo de modais financeiros / admin */
export function EntitySummary({
  title,
  subtitle,
  meta,
  className,
}: {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "nf-entity-summary rounded-2xl border border-black/[0.05] px-4 py-3.5 dark:border-white/[0.06]",
        className
      )}
    >
      <p className="text-[14px] font-semibold tracking-tight text-ink dark:text-white">
        {title}
      </p>
      {subtitle ? (
        <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</p>
      ) : null}
      {meta && meta.length > 0 ? (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                {m.label}
              </dt>
              <dd className="truncate text-[12.5px] font-medium text-ink-secondary dark:text-gray-200">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Grid de campos 1/2 colunas */
export function FieldGrid({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 3
          ? "sm:grid-cols-3"
          : cols === 2
            ? "sm:grid-cols-2"
            : "grid-cols-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Cartão de escolha (Novo agente / Adicionar conhecimento) */
export function ChoiceCard({
  icon,
  title,
  description,
  onClick,
  disabled,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-3.5 rounded-2xl border border-black/[0.06] bg-white p-4 text-left transition-all duration-150",
        "hover:border-brand-500/30 hover:bg-brand-500/[0.03] hover:shadow-[0_8px_24px_-12px_rgba(79,70,229,0.25)]",
        "dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-brand-400/30 dark:hover:bg-brand-500/[0.06]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/[0.35]",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/10 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-ink dark:text-white">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Banner de consequência (danger / warning) */
export function ConsequenceBanner({
  children,
  tone = "warning",
  className,
}: {
  children: ReactNode;
  tone?: "warning" | "danger" | "info";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed",
        tone === "danger" &&
          "border-rose-500/20 bg-rose-500/[0.08] text-rose-900 dark:text-rose-100",
        tone === "warning" &&
          "border-amber-500/20 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100",
        tone === "info" &&
          "border-brand-500/[0.15] bg-brand-500/[0.06] text-ink-secondary dark:text-gray-200",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ─── Form layout helpers (Design System) ─── */

/**
 * Switch (chavinha) — padrão global de ativar/desativar.
 * Mesmo visual de Preferências: pill roxo quando ligado.
 * Use em formulários/modais no lugar de checkbox para on/off.
 */
export function Switch({
  checked,
  onChange,
  id,
  label,
  description,
  disabled,
  className,
  "aria-label": ariaLabel,
  size = "md",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  /** sm = listas densas; md = formulários */
  size?: "sm" | "md";
}) {
  const autoId = useId();
  const switchId = id || autoId;
  const isSm = size === "sm";

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || (label ? undefined : "Alternar")}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={cn(
        "nf-switch relative shrink-0 rounded-full transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#14171e]",
        isSm ? "mt-0.5 h-5 w-9" : "mt-0.5 h-6 w-11",
        checked ? "bg-brand-500" : "bg-black/[0.1] dark:bg-white/[0.12]",
        disabled && "cursor-not-allowed opacity-50",
        !label && className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full bg-white shadow-sm transition-transform duration-150",
          isSm ? "top-0.5 left-0.5 h-4 w-4" : "top-0.5 left-0.5 h-5 w-5",
          checked && (isSm ? "translate-x-4" : "translate-x-5")
        )}
      />
    </button>
  );

  if (!label) {
    return control;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        isSm ? "py-0.5" : "py-1",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={switchId}
          className={cn(
            "font-medium text-ink dark:text-white",
            isSm ? "text-[12.5px]" : "text-[13px]",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          )}
        >
          {label}
        </label>
        {description ? (
          <p
            className={cn(
              "leading-snug text-ink-faint",
              isSm ? "mt-0.5 text-[11px]" : "mt-0.5 text-[12px] leading-relaxed"
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Grid responsivo de formulário (ref. Nova empresa).
 * 1 col no mobile · 2 cols a partir de sm.
 */
export function FormGrid({
  children,
  className,
  cols = 2,
}: {
  children: ReactNode;
  className?: string;
  cols?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Empilhamento vertical padrão de campos em formulário de modal */
export function FormStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4 sm:space-y-5", className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
  /** surface = bloco com fundo sutil (Standard Form) */
  surface,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  surface?: boolean;
}) {
  return (
    <section
      className={cn(
        "space-y-3",
        surface &&
          "nf-form-section-surface rounded-2xl border border-black/[0.05] p-4 dark:border-white/[0.06]",
        className
      )}
    >
      {(title || description) && (
        <div className="space-y-0.5">
          {title ? (
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="text-[12px] leading-relaxed text-ink-muted">{description}</p>
          ) : null}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Zona semântica de Contextual Form — organiza por significado da tarefa,
 * não por “seção de formulário admin”.
 */
export function ContextZone({
  kicker,
  question,
  children,
  className,
  /** coluna de grid opcional (ex.: grid-cols-2) */
  fieldsClassName,
}: {
  kicker?: string;
  /** Pergunta de produto, ex.: "Com quem você está negociando?" */
  question?: string;
  children: ReactNode;
  className?: string;
  fieldsClassName?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(kicker || question) && (
        <header className="space-y-1">
          {kicker ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              {kicker}
            </p>
          ) : null}
          {question ? (
            <p className="text-[13.5px] font-medium leading-snug tracking-tight text-ink dark:text-white">
              {question}
            </p>
          ) : null}
        </header>
      )}
      <div className={cn("space-y-3", fieldsClassName)}>{children}</div>
    </section>
  );
}

/** Separador leve entre zonas (espaço + linha opcional, sem caixa pesada) */
export function ContextDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "my-0.5 h-px w-full bg-gradient-to-r from-transparent via-black/[0.07] to-transparent dark:via-white/[0.09]",
        className
      )}
      aria-hidden
    />
  );
}

/** Resumo vivo da ação (ex.: preview da negociação antes de criar) */
export function ContextSummary({
  items,
  className,
}: {
  items: Array<{ label: string; value: string; emphasize?: boolean }>;
  className?: string;
}) {
  const visible = items.filter((i) => i.value && i.value !== "—");
  if (visible.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.04] bg-gradient-to-br from-black/[0.02] to-transparent px-3.5 py-3 dark:border-white/[0.06] dark:from-white/[0.035] dark:to-transparent",
        className
      )}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        Resumo
      </p>
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        {visible.map((item) => (
          <div key={item.label} className="min-w-0 max-w-full">
            <dt className="text-[10px] font-medium text-ink-faint">{item.label}</dt>
            <dd
              className={cn(
                "mt-0.5 truncate text-[13px] font-medium text-ink dark:text-gray-100",
                item.emphasize && "text-emerald-700 dark:text-emerald-300"
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Chip de escolha (prioridade, papel, tom…) — visual unificado */
export function ChoiceChip({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-[background-color,border-color,color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        selected
          ? "border-brand-500/[0.35] bg-brand-500/[0.1] text-brand-800 shadow-[0_0_0_1px_rgba(99,102,241,0.08)] dark:border-brand-400/[0.35] dark:bg-brand-500/[0.15] dark:text-brand-200"
          : "border-black/[0.07] bg-white text-ink-muted hover:border-black/[0.12] hover:bg-[#F7F8FA] hover:text-ink dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.05] dark:hover:text-gray-200",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Card de escolha em menus de “como adicionar” (manual / importar / assistente).
 * Visual premium e consistente em toda a plataforma.
 */
export function ActionChoiceCard({
  icon,
  title,
  description,
  onClick,
  className,
  accent = "brand",
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  className?: string;
  accent?: "brand" | "emerald" | "violet" | "amber";
}) {
  const accentCls =
    accent === "emerald"
      ? "bg-emerald-500/[0.1] text-emerald-700 ring-emerald-500/10 dark:text-emerald-300"
      : accent === "violet"
        ? "bg-violet-500/[0.1] text-violet-700 ring-violet-500/10 dark:text-violet-300"
        : accent === "amber"
          ? "bg-amber-500/[0.1] text-amber-800 ring-amber-500/10 dark:text-amber-300"
          : "bg-brand-500/[0.1] text-brand-700 ring-brand-500/10 dark:text-brand-300";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-3.5 rounded-2xl border border-black/[0.06] bg-white px-4 py-3.5 text-left",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--nf-ease)]",
        "hover:border-brand-500/25 hover:bg-[#FCFCFE] hover:shadow-[0_4px_16px_-8px_rgba(79,70,229,0.2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-brand-400/30 dark:hover:bg-white/[0.045]",
        className
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset",
          accentCls
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[14px] font-semibold tracking-tight text-ink dark:text-white">
          {title}
        </span>
        {description ? (
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className="mt-2 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-brand-500 dark:group-hover:text-brand-400"
        aria-hidden
      >
        →
      </span>
    </button>
  );
}

/** Avatar de iniciais para opções de Select (contato rico) */
export function SelectAvatar({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/[0.12] text-[10px] font-semibold text-brand-700 dark:bg-brand-400/[0.15] dark:text-brand-200"
      aria-hidden
    >
      {letters || "?"}
    </span>
  );
}

/** Campo monetário BRL — `value` numérico string (API). Digitação com vírgula. */
export function MoneyInput({
  id,
  value,
  onChange,
  className,
  placeholder = "0,00",
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (numeric: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const display = useMemo(() => {
    if (focused) {
      // durante foco: mostra rascunho com vírgula
      if (value === "" || value == null) return "";
      return String(value).replace(".", ",");
    }
    const n = Number(value);
    if (!Number.isFinite(n) || value === "") return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [value, focused]);

  return (
    <div className={cn("nf-money-input relative", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-faint">
        R$
      </span>
      <input
        id={id}
        className="input pl-10 tabular-nums"
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={display}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const n = Number(value);
          if (Number.isFinite(n) && value !== "") onChange(String(Math.round(n * 100) / 100));
        }}
        onChange={(e) => {
          let raw = e.target.value.replace(/[^\d.,]/g, "");
          // só a última vírgula/ponto conta
          raw = raw.replace(/\./g, ",");
          const first = raw.indexOf(",");
          if (first !== -1) {
            raw =
              raw.slice(0, first + 1) +
              raw.slice(first + 1).replace(/,/g, "").slice(0, 2);
          }
          const numeric = raw.replace(",", ".");
          onChange(numeric === "." ? "0." : numeric);
        }}
      />
    </div>
  );
}

/** Alias semântico do Design System */
export const CurrencyInput = MoneyInput;

/**
 * Data (YYYY-MM-DD no value, visual BRL no browser nativo com skin do DS).
 * Evita o date input “quebrado” solto — mesma altura/borda dos inputs do modal.
 */
export function DateInput({
  id,
  value,
  onChange,
  className,
  disabled,
  min,
  max,
  required,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  "aria-label"?: string;
}) {
  return (
    <input
      id={id}
      type="date"
      className={cn(
        "input nf-date-input min-h-[2.5rem] appearance-none tabular-nums",
        "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
        "[&::-webkit-calendar-picker-indicator]:opacity-60",
        "dark:[&::-webkit-calendar-picker-indicator]:invert",
        className
      )}
      value={value}
      disabled={disabled}
      min={min}
      max={max}
      required={required}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Inteiro sem spinner nativo.
 * `value` é string numérica (ex.: "2000"); exibe milhares pt-BR fora do foco.
 */
export function NumberInput({
  id,
  value,
  onChange,
  className,
  placeholder,
  min,
  max,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (numeric: string) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [focused, setFocused] = useState(false);
  const display = useMemo(() => {
    if (focused) return value === "" || value == null ? "" : String(value);
    if (value === "" || value == null) return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return Math.trunc(n).toLocaleString("pt-BR");
  }, [value, focused]);

  function commitRaw(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits === "") {
      onChange("");
      return;
    }
    let n = Number(digits);
    if (!Number.isFinite(n)) {
      onChange("");
      return;
    }
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    onChange(String(Math.trunc(n)));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cn("input nf-number-input tabular-nums", className)}
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (value === "") return;
        commitRaw(value);
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits);
      }}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  required,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("nf-form-field space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required ? (
            <span className="ml-0.5 font-medium text-rose-500/90" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? (
        <p className="text-[11px] leading-relaxed text-ink-faint">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function InlineHelp({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-ink-faint">{children}</p>;
}

/** Passos de wizard — shell v2 */
export function WizardSteps({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol
      className={cn("mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2", className)}
      aria-label="Progresso"
    >
      {steps.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={label} className="flex items-center gap-1.5">
            {i > 0 ? (
              <span
                className="mx-0.5 h-px w-3 bg-black/10 dark:bg-white/10 sm:w-4"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                active && "bg-brand-500/[0.15] text-brand-700 dark:text-brand-300",
                done && "text-emerald-700 dark:text-emerald-400",
                !active && !done && "text-ink-faint"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  active && "bg-brand-500 text-white",
                  done && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                  !active && !done && "bg-black/[0.06] dark:bg-white/[0.08]"
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** @deprecated Prefer BuilderNode — mantido para compatibilidade */
export function FlowStep({
  label,
  children,
  isLast,
}: {
  label: string;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <BuilderNode step={0} title={label} isLast={isLast} hideStep>
      {children}
    </BuilderNode>
  );
}

/**
 * Nó de cadeia BUILDER — “Quando isso acontecer → Faça isso → Depois…”
 * Experiência de fluxo, não de formulário genérico.
 */
export function BuilderNode({
  step,
  title,
  hint,
  children,
  isLast,
  hideStep,
  accent = "default",
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
  isLast?: boolean;
  hideStep?: boolean;
  accent?: "default" | "trigger" | "action" | "meta";
}) {
  const accentRing =
    accent === "trigger"
      ? "border-violet-500/20 bg-violet-500/[0.04] dark:border-violet-400/20 dark:bg-violet-500/[0.06]"
      : accent === "action"
        ? "border-emerald-500/20 bg-emerald-500/[0.04] dark:border-emerald-400/[0.15] dark:bg-emerald-500/[0.05]"
        : accent === "meta"
          ? "border-black/[0.06] bg-black/[0.015] dark:border-white/[0.07] dark:bg-white/[0.02]"
          : "border-line-soft bg-surface-subtle/40 dark:border-white/[0.06] dark:bg-white/[0.025]";

  const stepTone =
    accent === "trigger"
      ? "bg-violet-500/[0.15] text-violet-700 dark:text-violet-300"
      : accent === "action"
        ? "bg-emerald-500/[0.15] text-emerald-700 dark:text-emerald-300"
        : "bg-black/[0.05] text-ink-secondary dark:bg-white/[0.08] dark:text-gray-300";

  return (
    <div className="relative">
      <div className={cn("rounded-2xl border p-3.5 sm:p-4", accentRing)}>
        <div className="mb-3 flex items-start gap-2.5">
          {!hideStep && step > 0 ? (
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                stepTone
              )}
            >
              {step}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-ink dark:text-white">
              {title}
            </p>
            {hint ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{hint}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
      {!isLast ? (
        <div className="flex flex-col items-center py-1.5" aria-hidden>
          <span className="h-3 w-px bg-black/10 dark:bg-white/[0.12]" />
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[11px] text-ink-faint dark:border-white/[0.08] dark:bg-[#151820]">
            ↓
          </span>
          <span className="h-1 w-px bg-black/10 dark:bg-white/[0.12]" />
        </div>
      ) : null}
    </div>
  );
}

/* ─── Stat card ─── */

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  /** Positive = up (green), negative = down (red). Only show when real data. */
  trend?: { value: number; label?: string } | null;
  className?: string;
}) {
  const trendUp = trend != null && trend.value > 0;
  const trendDown = trend != null && trend.value < 0;

  return (
    <div
      className={cn(
        "card nf-stat-card group min-w-0 p-4 transition-[border-color,box-shadow] duration-200",
        "hover:border-black/[0.09] hover:shadow-[0_4px_16px_-8px_rgba(16,24,40,0.12)]",
        "dark:hover:border-white/[0.1] dark:hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            {label}
          </p>
          <p className="mt-2.5 font-display text-[1.6rem] font-semibold leading-none tracking-[-0.03em] text-ink dark:text-white sm:text-[1.7rem]">
            {value}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {trend != null && trend.value !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                  trendUp &&
                    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/[0.15] dark:text-emerald-300",
                  trendDown &&
                    "bg-red-500/10 text-red-700 dark:bg-red-500/[0.15] dark:text-red-300"
                )}
              >
                {trendUp ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
                {trend.label ? (
                  <span className="ml-1 font-normal opacity-80">{trend.label}</span>
                ) : null}
              </span>
            )}
            {hint && <p className="text-[12px] text-ink-faint">{hint}</p>}
          </div>
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/[0.07] text-brand-600 ring-1 ring-inset ring-brand-500/10 transition-colors group-hover:bg-brand-500/[0.1] dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/[0.15]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Section card (dashboard modules) ─── */

export function SectionCard({
  title,
  action,
  children,
  className,
  icon,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "card nf-section-card flex min-w-0 flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] bg-black/[0.01] px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.015]">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-ink-secondary dark:bg-white/[0.05] dark:text-gray-300">
              {icon}
            </span>
          ) : null}
          <h2 className="font-display text-[13.5px] font-semibold tracking-tight text-ink dark:text-white">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/* ─── Tooltip ─── */

export function Tooltip({
  content,
  subtitle,
  children,
  side = "right",
  delay = 300,
  className,
}: {
  content: string;
  subtitle?: string;
  children: ReactNode;
  side?: "right" | "left" | "top" | "bottom";
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  function place() {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    if (side === "right") {
      setCoords({ top: r.top + r.height / 2, left: r.right + gap });
    } else if (side === "left") {
      setCoords({ top: r.top + r.height / 2, left: r.left - gap });
    } else if (side === "top") {
      setCoords({ top: r.top - gap, left: r.left + r.width / 2 });
    } else {
      setCoords({ top: r.bottom + gap, left: r.left + r.width / 2 });
    }
  }

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      place();
      setVisible(true);
    }, delay);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  /* Base de ancoragem + micro-slide de entrada */
  const transform =
    side === "right"
      ? "translateY(-50%) translateX(0)"
      : side === "left"
        ? "translate(-100%, -50%)"
        : side === "top"
          ? "translate(-50%, -100%)"
          : "translateX(-50%)";

  const enterFrom =
    side === "right"
      ? "translateY(-50%) translateX(-4px)"
      : side === "left"
        ? "translate(calc(-100% + 4px), -50%)"
        : side === "top"
          ? "translate(-50%, calc(-100% + 4px))"
          : "translate(-50%, -4px)";

  const tooltip =
    visible && content ? (
      <span
        role="tooltip"
        id={id}
        className="nf-tooltip"
        style={{
          position: "fixed",
          top: coords.top,
          left: coords.left,
          zIndex: 80,
          // CSS vars for keyframe-free enter via animation on custom property isn't needed —
          // use Web Animations-friendly dual keyframe via style + class
          ["--nf-tt-from" as string]: enterFrom,
          ["--nf-tt-to" as string]: transform,
          transform,
          animation: "nf-tooltip-portal-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <span className="block">{content}</span>
        {subtitle ? <span className="nf-tooltip-sub">{subtitle}</span> : null}
      </span>
    ) : null;

  return (
    <span
      ref={anchorRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {typeof document !== "undefined" && tooltip
        ? createPortal(tooltip, document.body)
        : null}
    </span>
  );
}

/* ─── Toast system ─── */

type ToastKind = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration?: number;
};

type ToastContextValue = {
  toast: (opts: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (opts: Omit<ToastItem, "id">) => {
        if (typeof window !== "undefined") {
          // fallback sem provider
          console.info(`[toast:${opts.kind}]`, opts.title, opts.description || "");
        }
      },
    };
  }
  return ctx;
}

const toastIcons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  info: <Info className="h-4 w-4 text-brand-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = { ...opts, id };
      setItems((prev) => [...prev.slice(-4), item]);
      const ms = opts.duration ?? (opts.kind === "error" ? 0 : 4000);
      if (ms > 0) {
        window.setTimeout(() => dismiss(id), ms);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="nf-toast-viewport" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={cn("nf-toast", `nf-toast-${t.kind}`)} role="status">
            <span className="mt-0.5 shrink-0">{toastIcons[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost h-7 w-7 shrink-0 px-0"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar notificação"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Dropdown (portal — não é cortado por overflow de cards/listas) ─── */

type DropdownPos = {
  top: number;
  left: number;
  minWidth: number;
  maxHeight: number;
  placement: "bottom" | "top";
};

const DROPDOWN_GAP = 6;
const DROPDOWN_MIN_W = 176;
const DROPDOWN_VIEW_PAD = 8;

export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerWrapRef.current;
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panel = panelRef.current;
    const panelH = panel?.offsetHeight || 220;
    const panelW = Math.max(DROPDOWN_MIN_W, panel?.offsetWidth || DROPDOWN_MIN_W);

    const spaceBelow = vh - r.bottom - DROPDOWN_GAP - DROPDOWN_VIEW_PAD;
    const spaceAbove = r.top - DROPDOWN_GAP - DROPDOWN_VIEW_PAD;
    const preferBottom = spaceBelow >= Math.min(panelH, 140) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(
      120,
      Math.min(320, preferBottom ? spaceBelow : spaceAbove)
    );

    let left =
      align === "right" ? r.right - panelW : r.left;
    if (left + panelW > vw - DROPDOWN_VIEW_PAD) {
      left = Math.max(DROPDOWN_VIEW_PAD, vw - panelW - DROPDOWN_VIEW_PAD);
    }
    if (left < DROPDOWN_VIEW_PAD) left = DROPDOWN_VIEW_PAD;

    if (preferBottom) {
      setPos({
        top: r.bottom + DROPDOWN_GAP,
        left,
        minWidth: panelW,
        maxHeight,
        placement: "bottom",
      });
    } else {
      const top = Math.max(
        DROPDOWN_VIEW_PAD,
        r.top - DROPDOWN_GAP - Math.min(panelH, maxHeight)
      );
      setPos({
        top,
        left,
        minWidth: panelW,
        maxHeight,
        placement: "top",
      });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    // segunda passagem após medir o painel real
    const t = window.requestAnimationFrame(() => updatePosition());
    const onWin = () => updatePosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.cancelAnimationFrame(t);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerWrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            role="menu"
            className={cn(
              "nf-dropdown-panel fixed min-w-[11rem] overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-panel",
              "dark:border-[#262b36] dark:bg-[#14171e]"
            )}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxHeight: pos?.maxHeight ?? 320,
              zIndex: "var(--z-dropdown)",
              visibility: pos ? "visible" : "hidden",
            }}
          >
            <div onClick={() => setOpen(false)}>{children}</div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-flex">
      <div
        ref={triggerWrapRef}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {trigger}
      </div>
      {menu}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          : "text-ink-secondary hover:bg-black/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.04]",
        disabled && "pointer-events-none opacity-45"
      )}
    >
      {children}
    </button>
  );
}

/* ─── Select (Design System — reexport) ─── */
export { Select } from "./ui-select";
export type { SelectOption, SelectProps } from "./ui-select";
