"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminSection({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** sem padding no corpo (tabelas full-bleed) */
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "admin-section overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]",
        className
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[13px] font-semibold tracking-tight text-white/90">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[12px] text-gray-500">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn(flush ? "" : "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function AdminSectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[12px] font-medium text-violet-300/90 transition-colors hover:text-violet-200"
    >
      {children}
    </Link>
  );
}
