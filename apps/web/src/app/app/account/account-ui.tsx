"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Superfície única principal da conta — nível Linear / Stripe.
 * Contraste de superfície aprimorado, borda refinada e sombra suave.
 */
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
        "relative rounded-2xl border border-black/[0.07] bg-white dark:border-white/[0.08] dark:bg-[#0e1017]",
        "shadow-[0_1px_3px_rgba(0,0,0,0.05),0_10px_24px_-12px_rgba(0,0,0,0.08)]",
        "dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_16px_36px_-16px_rgba(0,0,0,0.7)]",
        "divide-y divide-black/[0.05] dark:divide-white/[0.06] overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Cabeçalho de seção dentro da superfície principal com acabamento sutil */
export function AccountPanelHead({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-5.5",
        "bg-black/[0.015] dark:bg-white/[0.015]",
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 shadow-xs">
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-ink dark:text-zinc-100">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 mt-2 sm:mt-0">{action}</div> : null}
    </div>
  );
}

/** Linha de ação/configuração com suporte a ícone e divisor */
export function AccountActionRow({
  title,
  meta,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  meta?: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 px-6 py-5.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-6 transition-colors",
        "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]",
        className
      )}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {Icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.035] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300 shadow-xs">
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">{title}</p>
          {meta ? (
            <div className="mt-1 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 flex items-center gap-2 mt-1 sm:mt-0">{action}</div> : null}
    </div>
  );
}

/** Linha de preferência simples com switch ou controle */
export function AccountRow({
  title,
  description,
  icon: Icon,
  control,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 px-6 py-5 sm:py-5.5 transition-colors",
        "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]",
        className
      )}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {Icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.035] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300 shadow-xs">
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">{title}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Seção estruturada dentro do painel unificado */
export function AccountSection({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={className}>
      {title ? (
        <div className="flex items-center justify-between gap-4 border-b border-black/[0.05] px-6 py-4 bg-black/[0.015] dark:border-white/[0.06] dark:bg-white/[0.015]">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-zinc-100">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="p-6">{children}</div>
    </div>
  );
}
