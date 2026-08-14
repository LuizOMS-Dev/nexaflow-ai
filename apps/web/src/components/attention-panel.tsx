"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AttentionTone = "warning" | "danger" | "info" | "neutral";

export type AttentionItem = {
  id: string;
  title: string;
  detail?: string;
  href?: string;
  actionLabel?: string;
  tone?: AttentionTone;
  /** Ícone custom; se omitido, usa o tom */
  icon?: ReactNode;
  /** Ações secundárias (Resolver / Ignorar etc.) */
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    muted?: boolean;
  }>;
};

const toneStyles: Record<
  AttentionTone,
  {
    bar: string;
    iconWrap: string;
    icon: typeof AlertCircle;
    badge: string;
  }
> = {
  danger: {
    bar: "from-rose-500 to-rose-400",
    iconWrap:
      "bg-rose-500/[0.12] text-rose-600 ring-rose-500/[0.15] dark:text-rose-300 dark:ring-rose-400/20",
    icon: AlertTriangle,
    badge: "bg-rose-500/[0.12] text-rose-700 dark:text-rose-200",
  },
  warning: {
    bar: "from-amber-500 to-amber-400",
    iconWrap:
      "bg-amber-500/[0.12] text-amber-700 ring-amber-500/[0.15] dark:text-amber-200 dark:ring-amber-400/20",
    icon: AlertCircle,
    badge: "bg-amber-500/[0.12] text-amber-800 dark:text-amber-100",
  },
  info: {
    bar: "from-brand-500 to-violet-400",
    iconWrap:
      "bg-brand-500/[0.12] text-brand-600 ring-brand-500/[0.15] dark:text-brand-300 dark:ring-brand-400/20",
    icon: Info,
    badge: "bg-brand-500/[0.12] text-brand-700 dark:text-brand-200",
  },
  neutral: {
    bar: "from-slate-400 to-slate-300 dark:from-slate-500 dark:to-slate-600",
    iconWrap:
      "bg-black/[0.04] text-ink-secondary ring-black/[0.06] dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.08]",
    icon: Sparkles,
    badge: "bg-black/[0.04] text-ink-secondary dark:bg-white/[0.06] dark:text-gray-300",
  },
};

function DefaultIcon({ tone }: { tone: AttentionTone }) {
  const Icon = toneStyles[tone].icon;
  return <Icon className="h-4 w-4" strokeWidth={1.75} />;
}

export type AttentionPanelProps = {
  title?: string;
  /** Só use se agregar informação real */
  subtitle?: string;
  items: AttentionItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * default — home do app (lista rica)
   * compact — admin / espaços densos
   * cards — grade de cards (mobile-first)
   */
  variant?: "default" | "compact" | "cards";
  className?: string;
  /** Esconde o bloco inteiro se vazio (útil no admin) */
  hideWhenEmpty?: boolean;
  /** Label do contador (ex.: “3 itens”) */
  countLabel?: (n: number) => string;
};

/** Lista de pendências com ação — copy curta, sem “voz de marketing”. */
export function AttentionPanel({
  title = "Pendências",
  subtitle,
  items,
  emptyTitle = "Nenhuma pendência",
  emptyDescription,
  variant = "default",
  className,
  hideWhenEmpty = false,
  countLabel = (n) => (n === 1 ? "1 item" : `${n} itens`),
}: AttentionPanelProps) {
  const count = items.length;
  const isEmpty = count === 0;

  if (isEmpty && hideWhenEmpty) return null;

  const isCompact = variant === "compact";
  const isCards = variant === "cards";

  return (
    <section
      className={cn(
        "nf-attention relative overflow-hidden rounded-2xl border",
        isEmpty
          ? "border-emerald-500/[0.15] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent shadow-sm dark:border-emerald-400/[0.12] dark:from-emerald-500/[0.09]"
          : "border-black/[0.055] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#12151c] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
      aria-label={title}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-start justify-between gap-3 border-b",
          isEmpty
            ? "border-emerald-500/10 dark:border-emerald-400/10"
            : "border-black/[0.04] dark:border-white/[0.05]",
          isCompact ? "px-3.5 py-2.5" : "px-4 py-3.5 sm:px-5"
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={cn(
                "font-display font-semibold tracking-tight text-ink dark:text-white",
                isCompact ? "text-[13px]" : "text-[15px]"
              )}
            >
              {title}
            </h2>
            {!isEmpty ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                  count > 0 && items.some((i) => i.tone === "danger")
                    ? toneStyles.danger.badge
                    : items.some((i) => i.tone === "warning")
                      ? toneStyles.warning.badge
                      : toneStyles.info.badge
                )}
              >
                {countLabel(count)}
              </span>
            ) : null}
          </div>
          {subtitle?.trim() ? (
            <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {/* Empty */}
      {isEmpty ? (
        <div
          className={cn(
            "flex items-center gap-3",
            isCompact ? "px-3.5 py-3" : "px-4 py-5 sm:px-5"
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/[0.12] text-emerald-600 ring-1 ring-inset ring-emerald-500/[0.15] dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ink dark:text-white">
              {emptyTitle}
            </p>
            {emptyDescription?.trim() ? (
              <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                {emptyDescription}
              </p>
            ) : null}
          </div>
        </div>
      ) : isCards ? (
        <ul className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
          {items.map((item) => (
            <AttentionCard key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <ul
          className={cn(
            "divide-y divide-black/[0.04] dark:divide-white/[0.05]",
            isCompact && "text-[12.5px]"
          )}
        >
          {items.map((item) => (
            <AttentionRow key={item.id} item={item} compact={isCompact} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionRow({
  item,
  compact,
}: {
  item: AttentionItem;
  compact?: boolean;
}) {
  const tone = item.tone || "info";
  const styles = toneStyles[tone];

  return (
    <li
      className={cn(
        "group relative flex flex-col gap-3 transition-colors",
        "hover:bg-black/[0.015] dark:hover:bg-white/[0.02]",
        compact ? "gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center" : "px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      )}
    >
      {/* Accent bar */}
      <span
        className={cn(
          "absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b opacity-80",
          styles.bar
        )}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 items-start gap-3 pl-1">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            styles.iconWrap,
            compact ? "h-8 w-8" : "h-9 w-9"
          )}
        >
          {item.icon || <DefaultIcon tone={tone} />}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            className={cn(
              "font-medium leading-snug text-ink dark:text-gray-100",
              compact ? "text-[12.5px]" : "text-[13.5px]"
            )}
          >
            {item.title}
          </p>
          {item.detail ? (
            <p
              className={cn(
                "mt-0.5 leading-relaxed text-ink-muted",
                compact ? "text-[11px] line-clamp-2" : "text-[12px] line-clamp-2 sm:line-clamp-none"
              )}
            >
              {item.detail}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5",
          compact ? "pl-11 sm:pl-0" : "pl-12 sm:pl-0"
        )}
      >
        {item.href && item.actionLabel ? (
          <Link
            href={item.href}
            className={cn(
              "btn-primary inline-flex items-center gap-1.5",
              compact ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]"
            )}
          >
            {item.actionLabel}
            <ArrowRight className="h-3 w-3 opacity-80" strokeWidth={2} />
          </Link>
        ) : null}
        {item.secondaryActions?.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={cn(
              "btn-ghost inline-flex items-center",
              compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-[12px]",
              a.muted && "text-ink-faint"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const tone = item.tone || "info";
  const styles = toneStyles[tone];
  const body = (
    <div className="flex h-full flex-col rounded-xl border border-black/[0.05] bg-black/[0.015] p-3.5 transition-all hover:border-black/[0.08] hover:bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.025] dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04]">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            styles.iconWrap
          )}
        >
          {item.icon || <DefaultIcon tone={tone} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-ink dark:text-white">
            {item.title}
          </p>
          {item.detail ? (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
              {item.detail}
            </p>
          ) : null}
        </div>
      </div>
      {(item.href && item.actionLabel) || item.secondaryActions?.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/[0.04] pt-2.5 dark:border-white/[0.05]">
          {item.href && item.actionLabel ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 dark:text-brand-400">
              {item.actionLabel}
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <li>
        <Link href={item.href} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500/[0.35] rounded-xl">
          {body}
        </Link>
      </li>
    );
  }
  return <li>{body}</li>;
}
