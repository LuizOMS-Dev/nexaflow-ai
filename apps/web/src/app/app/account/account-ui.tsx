"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Título de seção dentro de uma aba da conta. */
export function AccountSectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="min-w-0">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink dark:text-zinc-100">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 max-w-prose text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
          {description}
        </p>
      ) : null}
    </header>
  );
}

/** Painel agrupado — alinhado ao Surface de Configurações. */
export function AccountSurface({
  title,
  description,
  children,
  className,
  action,
  flush,
  id,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "nf-form-section-surface overflow-hidden rounded-2xl border border-black/[0.06] bg-[var(--surface-raised)]",
        "dark:border-white/[0.07] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-zinc-100">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

/** Linha de configuração com controle à direita. */
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
        "flex flex-col gap-3 border-t border-black/[0.05] px-4 py-3.5 first:border-t-0 dark:border-white/[0.06]",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-300">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink dark:text-zinc-200">{title}</p>
          {description ? (
            <div className="mt-0.5 text-[12px] leading-relaxed text-ink-muted dark:text-zinc-400">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 sm:pl-2">{control}</div>
    </div>
  );
}

/** Badge de status compacto. */
export function AccountStatusBadge({
  tone,
  label,
  pulse,
}: {
  tone: "ok" | "warn" | "bad" | "muted" | "brand";
  label: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warn" && "bg-amber-500/[0.12] text-amber-800 dark:text-amber-300",
        tone === "bad" && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        tone === "muted" && "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06]",
        tone === "brand" && "bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "warn" && "bg-amber-500",
          tone === "bad" && "bg-rose-500",
          tone === "muted" && "bg-ink-faint",
          tone === "brand" && "bg-violet-500",
          pulse && "animate-pulse"
        )}
      />
      {label}
    </span>
  );
}

/** Campo de formulário padronizado. */
export function AccountField({
  label,
  htmlFor,
  hint,
  badge,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          className="text-[12px] font-medium text-ink-secondary dark:text-zinc-300"
          htmlFor={htmlFor}
        >
          {label}
        </label>
        {badge}
      </div>
      {children}
      {hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint dark:text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Barra de ações fixa no rodapé quando há alterações. */
export function AccountSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="account-save-bar">
      <div className="account-save-bar__inner">
        <p className="text-[12px] text-ink-muted dark:text-zinc-400">Alterações não salvas</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary h-8.5 px-3 text-xs"
            disabled={saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
          <button
            type="button"
            className="btn-primary h-8.5 px-4 text-xs"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const AccountCard = AccountSurface;
export const AccountPanel = AccountSurface;

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
        "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4",
        "bg-black/[0.015] border-b border-black/[0.05] dark:bg-white/[0.015] dark:border-white/[0.06]",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon ? (
          <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 shadow-xs">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold tracking-tight text-ink dark:text-zinc-100">
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

export function AccountBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5 sm:p-6", className)}>{children}</div>;
}

export const AccountPanelHead = AccountCardHeader;
export const AccountActionRow = AccountRow;
export const AccountSection = AccountBody;
