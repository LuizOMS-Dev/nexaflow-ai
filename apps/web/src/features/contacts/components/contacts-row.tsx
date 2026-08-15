"use client";

import type { ChangeEvent } from "react";
import { Archive, ExternalLink, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui";
import {
  cn,
  commercialStatusLabel,
  formatDate,
  initials,
  leadPriorityLabel,
} from "@/lib/utils";
import {
  isArchivedStage,
  priorityBadgeClass,
  statusBadgeClass,
  type ContactListItem,
} from "../types";

function compactDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

export type ContactRowProps = {
  contact: ContactListItem;
  selected: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onToggle: (shift: boolean) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

function rowMeta(contact: ContactListItem) {
  return {
    archived: isArchivedStage(contact.stage),
    status: commercialStatusLabel[contact.commercialStatus] ?? contact.commercialStatus,
    priority: leadPriorityLabel[contact.priority] ?? contact.priority,
  };
}

function onCheckEvent(e: ChangeEvent<HTMLInputElement>, onToggle: (shift: boolean) => void) {
  const ev = e.nativeEvent;
  onToggle("shiftKey" in ev && ev.shiftKey === true);
}

export function ContactsRow(props: ContactRowProps) {
  return <ContactsTableRow {...props} />;
}

export function ContactsTableRow({
  contact,
  selected,
  canUpdate,
  canDelete,
  onOpen,
  onToggle,
  onArchive,
  onRestore,
  onDelete,
}: ContactRowProps) {
  const { archived, status, priority } = rowMeta(contact);

  return (
    <tr
      className={cn(
        "h-11 cursor-pointer border-b border-black/[0.04] text-[13px]",
        "dark:border-white/[0.05]",
        selected
          ? "bg-transparent shadow-[inset_2px_0_0_0_var(--brand)] dark:bg-white/[0.04]"
          : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      )}
      onClick={onOpen}
    >
      <td className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-black/20 accent-[var(--brand)]"
          checked={selected}
          onChange={(e) => onCheckEvent(e, onToggle)}
          aria-label={`Selecionar ${contact.name}`}
        />
      </td>
      <td className="min-w-0 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[10px] font-semibold text-ink-secondary dark:bg-white/[0.08] dark:text-gray-200"
            aria-hidden
          >
            {initials(contact.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink dark:text-white">
              {contact.name}
            </span>
            <span className="block truncate text-[12px] text-ink-muted">
              {contact.company || "—"}
            </span>
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 tabular-nums text-[12px] text-ink-secondary dark:text-gray-300">
        {contact.phone || "—"}
      </td>
      <td className="px-2">
        <span className={statusBadgeClass(contact.commercialStatus)}>{status}</span>
      </td>
      <td className="px-2">
        <span className={priorityBadgeClass(contact.priority)}>{priority}</span>
      </td>
      <td className="px-2 tabular-nums text-[12px] text-ink-secondary dark:text-gray-300">
        {contact.score}
      </td>
      <td className="max-w-[9rem] truncate px-2 text-[12px] text-ink-secondary dark:text-gray-300">
        {contact.responsibleUser?.name || "—"}
      </td>
      <td className="min-w-0 px-2 text-[12px] text-ink-secondary dark:text-gray-300">
        <span className="block truncate">{contact.nextAction || "—"}</span>
        {contact.nextActionDueAt ? (
          <span className="block text-[11px] tabular-nums text-ink-faint">
            {compactDate(contact.nextActionDueAt)}
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 text-[12px] tabular-nums text-ink-muted">
        {contact.lastInteractionAt ? formatDate(contact.lastInteractionAt) : "—"}
      </td>
      <td className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
        <RowMenu
          archived={archived}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onOpen={onOpen}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

export function ContactsMobileRow({
  contact,
  selected,
  onOpen,
  onToggle,
}: ContactRowProps) {
  const { status } = rowMeta(contact);

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-b border-black/[0.04] px-3 py-2.5",
        "dark:border-white/[0.05]",
        selected
          ? "shadow-[inset_2px_0_0_0_var(--brand)] dark:bg-white/[0.04]"
          : "active:bg-black/[0.02] dark:active:bg-white/[0.02]"
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-black/20 accent-[var(--brand)]"
        checked={selected}
        onChange={(e) => onCheckEvent(e, onToggle)}
        aria-label={`Selecionar ${contact.name}`}
      />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className="block truncate text-[13px] font-medium text-ink dark:text-white">
          {contact.name}
        </span>
        <span className="block truncate text-[12px] text-ink-muted">
          {contact.company || "—"}
        </span>
      </button>
      <span className={cn(statusBadgeClass(contact.commercialStatus), "shrink-0")}>
        {status}
      </span>
      <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-ink-secondary dark:text-gray-300">
        {contact.score}
      </span>
    </li>
  );
}

function RowMenu({
  archived,
  canUpdate,
  canDelete,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
}: {
  archived: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      minWidth={190}
      trigger={
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-black/[0.04] hover:text-ink dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
          aria-label="Ações do contato"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      }
    >
      <MenuItem icon={ExternalLink} onClick={onOpen}>
        Abrir detalhes
      </MenuItem>

      {canUpdate && !archived ? (
        <MenuItem icon={Archive} onClick={onArchive}>
          Arquivar
        </MenuItem>
      ) : null}

      {canUpdate && archived ? (
        <MenuItem icon={RotateCcw} onClick={onRestore}>
          Restaurar
        </MenuItem>
      ) : null}

      {canDelete ? (
        <>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={onDelete}>
            Excluir
          </MenuItem>
        </>
      ) : null}
    </Menu>
  );
}
