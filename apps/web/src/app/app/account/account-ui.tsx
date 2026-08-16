"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Título de seção dentro de uma aba da conta (opcional). */
export function AccountSectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="min-w-0 mb-1">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink dark:text-zinc-100">
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

/** Painel agrupado — superfície refinada alinhada ao design system NexaFlow. */
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
        "relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-xs transition-all duration-150",
        "dark:border-white/[0.07] dark:bg-[#11131a]/85 dark:shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {(title || description || action) && (
        <div className="flex flex-col gap-2 border-b border-black/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="text-[14px] font-semibold tracking-tight text-ink dark:text-zinc-100">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn(!flush && "p-5 sm:p-6")}>{children}</div>
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
        "flex flex-col gap-4 border-t border-black/[0.05] p-5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 dark:border-white/[0.06]",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        {Icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.03] text-zinc-600 dark:bg-white/[0.05] dark:text-zinc-300 shadow-xs">
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold tracking-tight text-ink dark:text-zinc-100">{title}</p>
          {description ? (
            <div className="mt-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        tone === "warn" && "bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        tone === "bad" && "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        tone === "muted" && "bg-black/[0.04] text-ink-muted dark:bg-white/[0.06] dark:text-zinc-400",
        tone === "brand" && "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "warn" && "bg-amber-500",
          tone === "bad" && "bg-rose-500",
          tone === "muted" && "bg-zinc-400 dark:bg-zinc-500",
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
  locked,
  badge,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  locked?: boolean;
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
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
            <Lock className="h-3 w-3 opacity-70" />
            Bloqueado
          </span>
        ) : (
          badge
        )}
      </div>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Barra de ações flutuante no rodapé quando há alterações não salvas. */
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
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-black/[0.08] bg-white/95 px-4.5 py-2.5 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-white/[0.09] dark:bg-[#151822]/95 dark:shadow-black/70 max-w-md w-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <p className="truncate text-[13px] font-semibold text-ink dark:text-zinc-100">
            Alterações não salvas
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="btn-secondary h-8 px-3 text-xs font-medium rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            disabled={saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
          <button
            type="button"
            className="btn-primary h-8 px-4 text-xs font-semibold bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white rounded-xl shadow-md shadow-violet-600/20 active:scale-[0.985] transition-all cursor-pointer"
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
        "flex flex-col gap-3 border-b border-black/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
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
            <p className="mt-0.5 text-[12.5px] text-ink-muted dark:text-zinc-400 leading-relaxed">
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

