"use client";

import { Archive, ChevronDown, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  Select,
  SelectAvatar,
} from "@/components/ui";
import { commercialStatusLabel, leadPriorityLabel } from "@/lib/utils";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "../types";

type MemberOpt = { value: string; label: string; description?: string };

type Props = {
  selectionActive: boolean;
  selectedCount: number;
  total: number;
  pageSize: number;
  pageAllSelected: boolean;
  allMatching: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  archived: "0" | "1" | "all";
  qInput: string;
  onQInput: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  priority: string;
  onPriority: (v: string) => void;
  assignee: string;
  onAssignee: (v: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  members: MemberOpt[];
  busy?: boolean;
  onSelectMatching: () => void;
  onClearSelection: () => void;
  onBulkStatus: (status: string) => void;
  onBulkPriority: (priority: string) => void;
  onBulkResponsible: (userId: string | null) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

export function ContactsToolbar({
  selectionActive,
  selectedCount,
  total,
  pageSize,
  pageAllSelected,
  allMatching,
  canUpdate,
  canDelete,
  archived,
  qInput,
  onQInput,
  status,
  onStatus,
  priority,
  onPriority,
  assignee,
  onAssignee,
  filtersOpen,
  onToggleFilters,
  members,
  busy,
  onSelectMatching,
  onClearSelection,
  onBulkStatus,
  onBulkPriority,
  onBulkResponsible,
  onArchive,
  onRestore,
  onDelete,
}: Props) {
  const statusOpts = LEAD_STATUSES.map((s) => ({
    value: s,
    label: commercialStatusLabel[s] ?? s,
  }));
  const priOpts = LEAD_PRIORITIES.map((p) => ({
    value: p,
    label: leadPriorityLabel[p] ?? p,
  }));
  const memberOpts = members.map((m) => ({
    ...m,
    leading: <SelectAvatar name={m.label} />,
  }));

  if (selectionActive) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="Ações em lote"
        aria-controls="contacts-list"
      >
        <p className="text-[13px] font-medium text-ink dark:text-white">
          {selectedCount.toLocaleString("pt-BR")} selecionado
          {selectedCount === 1 ? "" : "s"}
        </p>
        {pageAllSelected && !allMatching && total > pageSize ? (
          <button
            type="button"
            className="text-[12.5px] font-medium text-brand-600 hover:underline dark:text-brand-300"
            onClick={onSelectMatching}
          >
            Selecionar os {total.toLocaleString("pt-BR")} resultados
          </button>
        ) : null}
        {allMatching ? (
          <span className="text-[12px] text-ink-muted">todos os resultados</span>
        ) : null}

        {canUpdate ? (
          <>
            <Select
              size="sm"
              value=""
              disabled={busy}
              aria-label="Definir responsável"
              placeholder="Responsável"
              onChange={(v) => {
                if (!v) return;
                onBulkResponsible(v === "__none__" ? null : v);
              }}
              options={[
                { value: "", label: "Responsável…" },
                { value: "__none__", label: "Sem responsável" },
                ...memberOpts,
              ]}
            />
            <Select
              size="sm"
              value=""
              disabled={busy}
              aria-label="Definir status"
              placeholder="Status"
              onChange={(v) => v && onBulkStatus(v)}
              options={[{ value: "", label: "Status…" }, ...statusOpts]}
            />
            <Select
              size="sm"
              value=""
              disabled={busy}
              aria-label="Definir prioridade"
              placeholder="Prioridade"
              onChange={(v) => v && onBulkPriority(v)}
              options={[{ value: "", label: "Prioridade…" }, ...priOpts]}
            />
            <Menu
              minWidth={190}
              trigger={
                <button
                  type="button"
                  className="btn-secondary h-9 px-3 text-[13px] gap-1.5"
                  disabled={busy}
                >
                  <span>Mais</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              }
            >
              {archived !== "1" ? (
                <MenuItem icon={Archive} onClick={onArchive}>
                  Arquivar
                </MenuItem>
              ) : null}
              {archived !== "0" ? (
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
          </>
        ) : null}

        <button
          type="button"
          className="btn-ghost ml-auto h-9 gap-1 px-2.5 text-[13px]"
          onClick={onClearSelection}
        >
          <X className="h-3.5 w-3.5" />
          Limpar
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Filtros de contatos"
      aria-controls="contacts-list"
    >
      <label className="relative min-w-0 flex-1 basis-[12rem]">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          className="input h-9 pl-8 text-[13px]"
          value={qInput}
          onChange={(e) => onQInput(e.target.value)}
          placeholder="Buscar nome, telefone, e-mail, empresa"
          aria-label="Buscar contatos"
        />
      </label>
      <Select
        size="sm"
        value={status}
        onChange={onStatus}
        aria-label="Filtrar status"
        placeholder="Status"
        options={[{ value: "", label: "Todos os status" }, ...statusOpts]}
      />
      <Select
        size="sm"
        value={priority}
        onChange={onPriority}
        aria-label="Filtrar prioridade"
        placeholder="Prioridade"
        options={[{ value: "", label: "Todas as prioridades" }, ...priOpts]}
      />
      <Select
        size="sm"
        value={assignee}
        onChange={onAssignee}
        aria-label="Filtrar responsável"
        placeholder="Responsável"
        options={[
          { value: "", label: "Todos os responsáveis" },
          { value: "none", label: "Sem responsável" },
          ...memberOpts,
        ]}
      />
      <button
        type="button"
        className="btn-secondary h-9 gap-1.5 px-2.5 text-[13px]"
        aria-expanded={filtersOpen}
        aria-controls="contacts-extra-filters"
        onClick={onToggleFilters}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
      </button>
      <span className="ml-auto text-[12px] tabular-nums text-ink-muted">
        {total.toLocaleString("pt-BR")} contato{total === 1 ? "" : "s"}
      </span>
    </div>
  );
}
