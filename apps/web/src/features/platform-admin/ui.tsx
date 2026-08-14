"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { statusTone } from "./labels";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-white/40">
            {breadcrumbs.map((b, i) => (
              <span key={`${b.label}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? <span className="text-white/20">/</span> : null}
                {b.href ? (
                  <Link href={b.href} className="hover:text-white/70">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-white/55">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="font-display text-[1.35rem] font-semibold tracking-tight text-white">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/50">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ToneBadge({ code, children }: { code?: string; children: ReactNode }) {
  const tone = statusTone(code);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "ok" && "bg-emerald-500/15 text-emerald-200",
        tone === "warn" && "bg-amber-500/15 text-amber-200",
        tone === "danger" && "bg-red-500/15 text-red-200",
        tone === "info" && "bg-sky-500/15 text-sky-200",
        tone === "muted" && "bg-white/[0.06] text-white/55"
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "danger" | "ok";
}) {
  const ring =
    tone === "warn"
      ? "border-amber-400/20 bg-amber-500/[0.04]"
      : tone === "danger"
        ? "border-red-400/20 bg-red-500/[0.04]"
        : tone === "ok"
          ? "border-emerald-400/15 bg-emerald-500/[0.03]"
          : "border-white/[0.06] bg-white/[0.03]";
  const inner = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className="mt-1.5 font-display text-[1.45rem] font-semibold tabular-nums tracking-tight text-white">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[12px] leading-snug text-white/40">{hint}</p> : null}
    </>
  );
  const cls = cn(
    "rounded-xl border px-4 py-3.5 transition-colors",
    ring
  );
  if (href) {
    return (
      <Link href={href} className={cn(cls, "hover:border-white/[0.14] hover:bg-white/[0.05]")}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function Panel({
  title,
  action,
  children,
  flush,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]",
        className
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-white/85">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
      {children}
    </div>
  );
}

export function EmptyHint({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-4 py-10 text-center">
      {title ? <p className="text-[13px] font-medium text-white/70">{title}</p> : null}
      <p className={cn("text-[13px] text-white/40", title && "mt-1")}>{children}</p>
    </div>
  );
}

export function ErrorHint({
  title,
  onRetry,
}: {
  title: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-red-200">{title}</p>
      {onRetry ? (
        <button type="button" className="admin-btn-secondary mt-3" onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-white/55">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-white/35">{hint}</span> : null}
    </label>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  unit = "itens",
  onPage,
}: {
  page: number;
  totalPages: number;
  total?: number;
  unit?: string;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/45">
      <span>
        Página {page} de {totalPages}
        {total != null ? ` · ${total.toLocaleString("pt-BR")} ${unit}` : ""}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="admin-btn-secondary h-8"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="admin-btn-secondary h-8"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function DataTable({ children, minWidth = "720px" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-white/40",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(4, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-white/[0.1] bg-[#0c0d12] px-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/20 disabled:opacity-50";

export const selectClass = `${inputClass} appearance-none pr-8`;
