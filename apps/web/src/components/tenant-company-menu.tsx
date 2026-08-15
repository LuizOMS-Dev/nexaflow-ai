"use client";

import { Building2, Check, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type TenantCompanyItem = {
  tenantId: string;
  name: string;
  active: boolean;
  /** Cor do badge (opcional) */
  color?: string | null;
};

/**
 * Menu de empresas — área da empresa.
 * Compacto, grafite, sem cards internos.
 */
export function TenantCompanyMenu({
  items,
  onSelect,
  onManage,
  onBackToAdmin,
  showBackToAdmin,
  className,
}: {
  items: TenantCompanyItem[];
  onSelect: (tenantId: string) => void;
  onManage: () => void;
  onBackToAdmin?: () => void;
  showBackToAdmin?: boolean;
  className?: string;
}) {
  function initials(name: string) {
    return (name || "E")
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div
      role="listbox"
      aria-label="Empresas"
      className={cn(
        "nf-tcm flex w-full min-w-[240px] max-w-[280px] flex-col overflow-hidden",
        "rounded-2xl border border-black/[0.08] bg-white p-1.5 dark:border-white/[0.09] dark:bg-[#12141c]",
        "shadow-2xl shadow-black/15 dark:shadow-black/70 backdrop-blur-md",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted dark:text-zinc-400">
          Empresas
        </p>
        <p className="text-[10.5px] tabular-nums text-ink-faint dark:text-zinc-500">
          {items.length} {items.length === 1 ? "conta" : "contas"}
        </p>
      </div>

      <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" aria-hidden />

      <div className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain py-0.5">
        {items.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-xs text-ink-muted dark:text-zinc-500">
            Nenhuma empresa
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.tenantId}
              type="button"
              role="option"
              aria-selected={item.active}
              title={item.name}
              onClick={() => onSelect(item.tenantId)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40",
                item.active
                  ? "bg-violet-500/[0.08] text-violet-700 dark:bg-violet-500/15 dark:text-violet-200 font-semibold"
                  : "text-ink-secondary hover:bg-violet-500/[0.06] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.12] dark:hover:text-white"
              )}
            >
              <span
                className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white shadow-xs"
                style={{
                  background:
                    item.color ||
                    "linear-gradient(145deg, #6366f1, #7c3aed)",
                }}
              >
                {initials(item.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium leading-tight">
                  {item.name}
                </span>
                {item.active ? (
                  <span className="mt-0.5 block text-[10px] opacity-75">Atual</span>
                ) : null}
              </span>
              {item.active ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400"
                  strokeWidth={2.25}
                  aria-hidden
                />
              ) : null}
            </button>
          ))
        )}
      </div>

      <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" aria-hidden />

      <div className="space-y-0.5 pt-0.5">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-ink-secondary transition-colors hover:bg-violet-500/[0.06] hover:text-ink dark:text-zinc-300 dark:hover:bg-violet-500/[0.12] dark:hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
          onClick={onManage}
        >
          <Building2 className="h-4 w-4 shrink-0 text-ink-muted dark:text-zinc-400" strokeWidth={1.75} aria-hidden />
          <span>Gerenciar empresas</span>
        </button>

        {showBackToAdmin && onBackToAdmin ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/[0.1] dark:text-violet-300 dark:hover:bg-violet-500/[0.15] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40"
            onClick={onBackToAdmin}
          >
            <Shield className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={1.75} aria-hidden />
            <span>Voltar à Administração</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
