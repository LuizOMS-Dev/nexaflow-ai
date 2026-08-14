"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Painel leve da conta — uma superfície, sem card-em-card */
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
        "rounded-xl border border-black/[0.06] bg-[var(--surface-raised)] dark:border-white/[0.07]",
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
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-3.5 py-2.5 dark:border-white/[0.06]">
      <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
        {title}
      </h2>
      {action}
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
        "flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink dark:text-zinc-100">{title}</p>
        {meta ? (
          <div className="mt-0.5 text-[12px] leading-snug text-ink-muted dark:text-zinc-500">
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
    info: "border-violet-500/25 bg-violet-500/10 text-violet-950 dark:text-violet-100",
    warning: "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between",
        tones[tone]
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug">{title}</p>
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
        "flex items-center justify-between gap-4 px-3.5 py-3",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink dark:text-zinc-100">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-500">
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
      <div className="flex flex-col gap-1 border-b border-black/[0.05] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px] text-ink-muted dark:text-zinc-500">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="px-3.5 py-3.5">{children}</div>
    </AccountPanel>
  );
}
