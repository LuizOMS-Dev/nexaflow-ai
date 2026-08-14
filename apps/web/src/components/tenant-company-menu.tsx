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
        "nf-tcm flex w-full min-w-0 max-w-full flex-col overflow-hidden",
        "rounded-[11px] border border-white/[0.08] bg-[#12141a]",
        "shadow-[0_12px_32px_-10px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          Empresas
        </p>
        <p className="text-[11px] tabular-nums text-zinc-600">
          {items.length} {items.length === 1 ? "conta" : "contas"}
        </p>
      </div>

      <div className="mx-2.5 h-px bg-white/[0.06]" aria-hidden />

      <div className="max-h-48 overflow-y-auto overscroll-contain p-1">
        {items.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-[12px] text-zinc-500">
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
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left transition-colors duration-100",
                "hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35",
                item.active && "bg-white/[0.04]"
              )}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                style={{
                  background:
                    item.color ||
                    "linear-gradient(145deg, #6366f1, #7c3aed)",
                }}
              >
                {initials(item.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-zinc-100">
                  {item.name}
                </span>
                {item.active ? (
                  <span className="mt-0.5 block text-[10.5px] text-zinc-500">Atual</span>
                ) : null}
              </span>
              {item.active ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-violet-400"
                  strokeWidth={2.25}
                  aria-hidden
                />
              ) : null}
            </button>
          ))
        )}
      </div>

      <div className="mx-2.5 h-px bg-white/[0.06]" aria-hidden />

      <div className="p-1">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35"
          onClick={onManage}
        >
          <Building2 className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.7} aria-hidden />
          <span>Gerenciar empresas</span>
        </button>

        {showBackToAdmin && onBackToAdmin ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium text-violet-200/90 transition-colors duration-100 hover:bg-violet-500/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/35"
            onClick={onBackToAdmin}
          >
            <Shield className="h-4 w-4 shrink-0 text-violet-400/80" strokeWidth={1.7} aria-hidden />
            <span>Voltar à Administração</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
