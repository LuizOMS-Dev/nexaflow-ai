"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Chrome de página da área da empresa.
 * Hierarquia: eyebrow opcional · título · descrição · ações · corpo.
 * Cada módulo usa composição própria abaixo do chrome.
 */
export function TenantPage({
  title,
  description,
  actions,
  children,
  className,
  maxWidth = "default",
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** wide = dashboards/boards; default = listas; narrow = settings */
  maxWidth?: "narrow" | "default" | "wide" | "full";
  eyebrow?: string;
}) {
  const max =
    maxWidth === "narrow"
      ? "max-w-[720px]"
      : maxWidth === "wide"
        ? "max-w-[1480px]"
        : maxWidth === "full"
          ? "max-w-none"
          : "max-w-[1200px]";

  return (
    <div className={cn("nf-tenant-page mx-auto w-full min-w-0 space-y-5", max, className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint dark:text-zinc-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-[1.45rem] font-semibold leading-tight tracking-[-0.035em] text-ink dark:text-white sm:text-[1.55rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

export function TenantSection({
  title,
  action,
  children,
  className,
  flush,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)]",
        "dark:border-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

export function TenantMetric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-medium text-ink-faint dark:text-zinc-500">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold tracking-[-0.03em] text-ink dark:text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11.5px] text-ink-muted dark:text-zinc-500">{hint}</p>
      ) : null}
    </>
  );
  const cls =
    "block min-w-0 rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)] p-4 transition-colors dark:border-white/[0.07]";
  if (href) {
    return (
      <a href={href} className={cn(cls, "hover:border-violet-500/25")}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}
