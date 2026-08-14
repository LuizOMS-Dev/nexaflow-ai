"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import type { AdminTone } from "./types";

export function AdminPageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  badge,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  badge?: { label: string; tone?: AdminTone };
  className?: string;
}) {
  return (
    <header
      className={cn(
        "admin-page-header mb-6 flex min-w-0 flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-3xl flex-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-gray-500"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? <span className="text-gray-600">/</span> : null}
                {c.href ? (
                  <Link
                    href={c.href}
                    className="transition-colors hover:text-gray-300"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className={i === breadcrumbs.length - 1 ? "text-gray-400" : ""}>
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.5rem]">
            {title}
          </h1>
          {badge ? <StatusBadge tone={badge.tone || "violet"}>{badge.label}</StatusBadge> : null}
        </div>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>
      ) : null}
    </header>
  );
}
