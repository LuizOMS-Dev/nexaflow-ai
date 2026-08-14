"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminEmptyState({
  title,
  description,
  action,
  icon,
  className,
  compact = true,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400">
          {icon}
        </div>
      ) : null}
      <p className="text-[13.5px] font-semibold text-white/85">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-gray-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
