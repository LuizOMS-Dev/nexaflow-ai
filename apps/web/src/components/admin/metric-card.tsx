"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminMetric, AdminTone } from "./types";

const iconTone: Record<AdminTone, string> = {
  neutral: "bg-white/[0.05] text-gray-300 ring-white/[0.06]",
  brand: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/20",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
  success: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
  warning: "bg-amber-500/15 text-amber-200 ring-amber-400/20",
  danger: "bg-red-500/15 text-red-300 ring-red-400/20",
  info: "bg-sky-500/15 text-sky-300 ring-sky-400/20",
};

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
  trend,
  className,
  compact,
}: AdminMetric & { className?: string; compact?: boolean }) {
  const body = (
    <div
      className={cn(
        "admin-metric group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        "transition-colors duration-150",
        href && "hover:border-violet-400/25 hover:bg-white/[0.04]",
        compact ? "p-3.5" : "p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-gray-400">{label}</p>
          <p
            className={cn(
              "mt-1.5 font-semibold tabular-nums tracking-tight text-white",
              compact ? "text-xl" : "text-2xl leading-none"
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1.5 truncate text-[11.5px] leading-snug text-gray-500">{hint}</p>
          ) : null}
          {trend ? (
            <p
              className={cn(
                "mt-1.5 text-[11px] font-medium",
                trend.direction === "up" && "text-emerald-400/90",
                trend.direction === "down" && "text-red-400/90",
                (!trend.direction || trend.direction === "flat") && "text-gray-500"
              )}
            >
              {trend.label}
            </p>
          ) : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
              iconTone[tone]
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded-xl">
        {body}
      </Link>
    );
  }
  return body;
}

export function MetricGrid({
  children,
  className,
  cols = 4,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4 | 5 | 6;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 xl:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        cols === 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        cols === 6 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
