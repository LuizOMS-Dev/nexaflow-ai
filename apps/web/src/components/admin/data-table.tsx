"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AdminEmptyState } from "./empty-state";

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
};

export function AdminDataTable<T extends { id?: string }>({
  columns,
  rows,
  rowKey,
  emptyTitle = "Nenhum registro",
  emptyDescription,
  emptyAction,
  emptyIcon,
  onRowClick,
  className,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  if (!rows.length) {
    return (
      <AdminEmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        icon={emptyIcon}
      />
    );
  }

  return (
    <div className={cn("admin-table-wrap -mx-px overflow-x-auto", className)}>
      <table className="admin-table w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey?.(row, i) ?? (row.id as string) ?? String(i);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-white/[0.04] transition-colors last:border-0",
                  onRowClick && "cursor-pointer hover:bg-white/[0.03]"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 align-middle text-gray-300",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-[12px] text-gray-500",
        className
      )}
    >
      <p>
        {total === 0
          ? "0 itens"
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="admin-btn-ghost h-8 px-3 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <span className="tabular-nums text-gray-400">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="admin-btn-ghost h-8 px-3 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
