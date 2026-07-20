"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Header de página da Administração global.
 * Eyebrow = NexaFlow Platform · Superadministrador
 * Título = página específica (não "Administração")
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-7",
        className
      )}
    >
      <div className="min-w-0 max-w-2xl">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600/90 dark:text-violet-300/90">
            NexaFlow Platform
          </p>
          <span className="text-[10px] text-ink-faint/70" aria-hidden>
            ·
          </span>
          <span className="rounded-md border border-black/[0.05] bg-black/[0.02] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400">
            Superadministrador
          </span>
        </div>
        <h1 className="mt-2 font-display text-[1.4rem] font-semibold tracking-tight text-ink dark:text-white sm:text-[1.5rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5 sm:pt-6">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
