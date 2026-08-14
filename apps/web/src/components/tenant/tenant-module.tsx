"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Chrome de página da área da empresa.
 * Estrutura plana: header + children (SEM wrapper .nf-mod-body),
 * para não quebrar CSS que espera filhos diretos (.settings-layout, .crm-board-shell).
 */
export type TenantModuleKind =
  | "ops"
  | "inbox"
  | "crm"
  | "board"
  | "execute"
  | "broadcast"
  | "flow"
  | "agents"
  | "library"
  | "people"
  | "connect"
  | "analytics"
  | "settings";

export function TenantModule({
  kind,
  title,
  kicker,
  actions,
  children,
  className,
  fullBleed,
  hideHeader,
}: {
  kind: TenantModuleKind;
  title: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  fullBleed?: boolean;
  /** Páginas com chrome próprio (raro) */
  hideHeader?: boolean;
}) {
  return (
    <div
      data-tenant-module={kind}
      className={cn(
        "nf-mod",
        `nf-mod--${kind}`,
        fullBleed && "nf-mod--bleed",
        "min-w-0 w-full",
        className
      )}
    >
      {!hideHeader ? (
        <header className={cn("nf-mod-header", `nf-mod-header--${kind}`)}>
          <div className="min-w-0">
            {kicker ? <p className="nf-mod-kicker">{kicker}</p> : null}
            <h1 className="nf-mod-title">{title}</h1>
          </div>
          {actions ? <div className="nf-mod-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </div>
  );
}

/** Faixa de KPIs inline */
export function TenantStatStrip({
  items,
  className,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    tone?: "default" | "warn" | "ok" | "danger";
  }>;
  className?: string;
}) {
  return (
    <div className={cn("nf-stat-strip", className)} role="group" aria-label="Indicadores">
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "nf-stat-strip__item",
            it.tone === "warn" && "nf-stat-strip__item--warn",
            it.tone === "ok" && "nf-stat-strip__item--ok",
            it.tone === "danger" && "nf-stat-strip__item--danger"
          )}
        >
          <span className="nf-stat-strip__value">{it.value}</span>
          <span className="nf-stat-strip__label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
