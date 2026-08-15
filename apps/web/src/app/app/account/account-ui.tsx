"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Superfície única principal da conta — sem cards dentro de cards.
 * Utiliza borda sutil e divisores internos.
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
        "rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.07] dark:bg-zinc-900/50",
        "divide-y divide-black/[0.05] dark:divide-white/[0.06] overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Cabeçalho de seção dentro da superfície principal */
export function AccountPanelHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4.5 sm:flex-row sm:items-center sm:justify-between bg-black/[0.015] dark:bg-white/[0.015]">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-zinc-100">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 mt-2 sm:mt-0">{action}</div> : null}
    </div>
  );
}

/** Linha de ação/configuração com divisor */
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
        "flex flex-col gap-3 px-6 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">{title}</p>
        {meta ? (
          <div className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Linha de preferência simples (ex: switch ou select) */
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
        "flex items-center justify-between gap-6 px-6 py-4 transition-colors",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Seção de conteúdo genérico dentro do painel */
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
