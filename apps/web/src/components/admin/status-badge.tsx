"use client";

import { cn } from "@/lib/utils";
import type { AdminTone } from "./types";

const toneClass: Record<AdminTone, string> = {
  neutral:
    "border-white/[0.08] bg-white/[0.04] text-gray-300",
  brand:
    "border-indigo-400/25 bg-indigo-500/12 text-indigo-200",
  violet:
    "border-violet-400/25 bg-violet-500/12 text-violet-200",
  success:
    "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
  warning:
    "border-amber-400/25 bg-amber-500/12 text-amber-100",
  danger:
    "border-red-400/30 bg-red-500/12 text-red-200",
  info:
    "border-sky-400/25 bg-sky-500/12 text-sky-200",
};

/** Mapeia status de domínio para tom visual */
export function statusToTone(status: string): AdminTone {
  const s = (status || "").toUpperCase();
  if (
    ["ACTIVE", "OPERATIONAL", "OK", "PAID", "CONNECTED", "HEALTHY", "PUBLISHED", "WON"].includes(s)
  )
    return "success";
  if (
    [
      "TRIAL",
      "PENDING",
      "PAST_DUE",
      "DEGRADED",
      "WARNING",
      "DRAFT",
      "SCHEDULED",
      "CONTACTED",
      "QUALIFIED",
      "INVITED",
      "PENDING_VERIFICATION",
    ].includes(s)
  )
    return "warning";
  if (
    [
      "BLOCKED",
      "SUSPENDED",
      "CANCELLED",
      "DOWN",
      "ERROR",
      "FAILED",
      "UNAVAILABLE",
      "DANGER",
      "DISABLED",
      "SPAM",
    ].includes(s)
  )
    return "danger";
  if (["INFO", "UNKNOWN", "NOT_CONFIGURED", "NEW"].includes(s)) return "info";
  if (["SUPERADMIN"].includes(s)) return "violet";
  return "neutral";
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: AdminTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        toneClass[tone],
        className
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            tone === "success" && "bg-emerald-400",
            tone === "warning" && "bg-amber-400",
            tone === "danger" && "bg-red-400",
            tone === "brand" && "bg-indigo-400",
            tone === "violet" && "bg-violet-400",
            tone === "info" && "bg-sky-400",
            tone === "neutral" && "bg-gray-400"
          )}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
