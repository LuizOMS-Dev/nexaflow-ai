"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ContactsMobileRow, ContactsTableRow } from "./contacts-row";
import type { ContactListItem } from "../types";

type PageState = "none" | "some" | "all";

type Props = {
  items: ContactListItem[];
  total: number;
  page: number;
  limit: number;
  pageState: PageState;
  isSelected: (id: string) => boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onToggleRow: (id: string, shift: boolean) => void;
  onTogglePage: () => void;
  onOpen: (id: string) => void;
  onArchive: (c: ContactListItem) => void;
  onRestore: (c: ContactListItem) => void;
  onDelete: (c: ContactListItem) => void;
  onPage: (page: number) => void;
};

export function ContactsTable({
  items,
  total,
  page,
  limit,
  pageState,
  isSelected,
  canUpdate,
  canDelete,
  onToggleRow,
  onTogglePage,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onPage,
}: Props) {
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = pageState === "some";
  }, [pageState]);

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div id="contacts-list">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-black/[0.06] text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint dark:border-white/[0.07]">
              <th className="w-10 px-3 py-2">
                <input
                  ref={headRef}
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-black/20 accent-[var(--brand)]"
                  checked={pageState === "all"}
                  aria-checked={
                    pageState === "some" ? "mixed" : pageState === "all"
                  }
                  aria-label="Selecionar página"
                  disabled={!items.length}
                  onChange={onTogglePage}
                />
              </th>
              <th className="px-2 py-2 font-medium">Contato</th>
              <th className="w-[8.5rem] px-2 py-2 font-medium">Telefone</th>
              <th className="w-[8.5rem] px-2 py-2 font-medium">Status</th>
              <th className="w-[6.5rem] px-2 py-2 font-medium">Prioridade</th>
              <th className="w-14 px-2 py-2 font-medium">Score</th>
              <th className="w-[8.5rem] px-2 py-2 font-medium">Responsável</th>
              <th className="w-[9.5rem] px-2 py-2 font-medium">Próxima ação</th>
              <th className="w-[8.5rem] px-2 py-2 font-medium">Última interação</th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <ContactsTableRow
                key={c.id}
                contact={c}
                selected={isSelected(c.id)}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onOpen={() => onOpen(c.id)}
                onToggle={(shift) => onToggleRow(c.id, shift)}
                onArchive={() => onArchive(c)}
                onRestore={() => onRestore(c)}
                onDelete={() => onDelete(c)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        <div className="flex items-center gap-2 border-b border-black/[0.05] px-3 py-2 dark:border-white/[0.06]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-black/20 accent-[var(--brand)]"
            checked={pageState === "all"}
            aria-checked={pageState === "some" ? "mixed" : pageState === "all"}
            aria-label="Selecionar página"
            disabled={!items.length}
            ref={(el) => {
              if (el) el.indeterminate = pageState === "some";
            }}
            onChange={onTogglePage}
          />
          <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-faint">
            Contatos
          </span>
        </div>
        <ul>
          {items.map((c) => (
            <ContactsMobileRow
              key={c.id}
              contact={c}
              selected={isSelected(c.id)}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onOpen={() => onOpen(c.id)}
              onToggle={(shift) => onToggleRow(c.id, shift)}
              onArchive={() => onArchive(c)}
              onRestore={() => onRestore(c)}
              onDelete={() => onDelete(c)}
            />
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
        <p className="text-[12px] tabular-nums text-ink-muted">
          {from}–{to} de {total.toLocaleString("pt-BR")}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost h-8 w-8 px-0"
            disabled={page <= 1}
            aria-label="Página anterior"
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center text-[12px] tabular-nums text-ink-muted">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost h-8 w-8 px-0"
            disabled={page >= totalPages}
            aria-label="Próxima página"
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
