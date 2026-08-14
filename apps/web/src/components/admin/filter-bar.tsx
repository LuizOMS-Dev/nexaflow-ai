"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui-select";

export function AdminFilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 sm:flex-row sm:flex-wrap sm:items-end",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminSearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#0c0e14] pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-gray-600 focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/20"
      />
    </div>
  );
}

/**
 * Filtro select premium — usa Select com portal (não o <select> nativo do SO).
 */
export function AdminSelectFilter({
  value,
  onChange,
  options,
  label,
  className,
  placeholder = "Selecione…",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  label?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("inline-flex min-w-[148px] max-w-full flex-col gap-1", className)}>
      {label ? (
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
      ) : null}
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        size="sm"
        className="nf-select--admin w-full min-w-[148px]"
        triggerClassName="nf-select-trigger--admin"
        menuMinWidth={180}
        aria-label={label}
      />
    </div>
  );
}
