"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Painel principal da conta — estética moderna em cartão glassmorphism */
export function AccountPanel({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-black/[0.06] bg-white/80 shadow-xs backdrop-blur-md transition-shadow duration-200 dark:border-white/[0.07] dark:bg-zinc-900/70",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Título de seção compacto dentro do painel */
export function AccountPanelHead({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
      <div>
        <h2 className="text-[14px] font-bold tracking-tight text-ink dark:text-zinc-100">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Linha de ação (Segurança / lista densa) */
export function AccountActionRow({
  title,
  meta,
  action,
  className,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-5 py-4 transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between sm:gap-4 hover:bg-black/[0.015] dark:hover:bg-white/[0.015]",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink dark:text-zinc-100">{title}</p>
        {meta ? (
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Banner de alerta / status na conta */
export function AccountBanner({
  tone = "info",
  title,
  description,
  action,
}: {
  tone?: "info" | "warning" | "success";
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const tones = {
    info: "border-indigo-500/20 bg-indigo-500/[0.07] text-indigo-950 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200",
    warning: "border-amber-500/25 bg-amber-500/[0.08] text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200",
    success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        tones[tone]
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold leading-snug">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed opacity-90">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Linha de preferência (switch) */
export function AccountRow({
  title,
  description,
  control,
  className,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-black/[0.015] dark:hover:bg-white/[0.015]",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink dark:text-zinc-100">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** @deprecated use AccountPanel — mantido para imports legados */
export function AccountSection({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <AccountPanel id={id} className={className}>
      <div className="flex flex-col gap-1 border-b border-black/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold tracking-tight text-ink dark:text-zinc-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </AccountPanel>
  );
}
