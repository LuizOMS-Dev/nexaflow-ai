"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ─── Superfície Principal de Cartão (Linear/Stripe Standard) ─── */

export function AccountCard({
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
        "relative rounded-2xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#0e1017]",
        "shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_16px_36px_-16px_rgba(0,0,0,0.7)]",
        "divide-y divide-black/[0.05] dark:divide-white/[0.06] overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ─── Cabeçalho de Seção com Título, Descrição e Ação Opcional ─── */

export function AccountCardHeader({
  title,
  description,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: ReactNode;
  className?: string;
}) {
  const desc = description || subtitle;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5.5",
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
          {desc ? (
            <p className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              {desc}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ─── Linha de Configuração com Ícone e Controle (Switch / Botão) ─── */

export function AccountRow({
  title,
  description,
  icon: Icon,
  control,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-7 sm:py-5.5 transition-colors",
        "hover:bg-black/[0.01] dark:hover:bg-white/[0.015]",
        className
      )}
    >
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        {Icon ? (
          <div className="mt-0.5 flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-black/[0.035] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300 shadow-xs">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink dark:text-zinc-200">{title}</p>
          {description ? (
            <div className="mt-0.5 text-xs text-ink-muted dark:text-zinc-400 leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 flex items-center">{control}</div>
    </div>
  );
}

/* ─── Bloco de Conteúdo Interno com Padding Padronizado ─── */

export function AccountBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("p-6 sm:p-7", className)}>
      {children}
    </div>
  );
}

/* ─── Aliases retrocompatíveis ─── */
export const AccountPanel = AccountCard;
export const AccountPanelHead = AccountCardHeader;
export const AccountActionRow = AccountRow;
export const AccountSection = AccountBody;
