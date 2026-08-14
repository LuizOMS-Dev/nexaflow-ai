"use client";

import { ChoiceChip, Select } from "@/components/ui";
import {
  CONTACT_SORT_OPTIONS,
  type ArchivedFilter,
  type ContactSort,
  type SortOrder,
} from "../types";

type Props = {
  archived: ArchivedFilter;
  onArchived: (v: ArchivedFilter) => void;
  sort: ContactSort;
  order: SortOrder;
  onSort: (sort: ContactSort, order?: SortOrder) => void;
};

const VIEWS: Array<{ value: ArchivedFilter; label: string }> = [
  { value: "0", label: "Ativos" },
  { value: "1", label: "Arquivados" },
  { value: "all", label: "Todos" },
];

export function ContactsFilters({ archived, onArchived, sort, order, onSort }: Props) {
  return (
    <div
      id="contacts-extra-filters"
      className="mt-2.5 flex flex-wrap items-end gap-3 border-t border-black/[0.05] pt-2.5 dark:border-white/[0.06]"
    >
      <div className="min-w-0">
        <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Visão</p>
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <ChoiceChip
              key={v.value}
              selected={archived === v.value}
              onClick={() => onArchived(v.value)}
            >
              {v.label}
            </ChoiceChip>
          ))}
        </div>
      </div>
      <div className="min-w-[10rem]">
        <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Ordenar</p>
        <Select
          size="sm"
          value={sort}
          onChange={(v) => onSort(v as ContactSort)}
          aria-label="Ordenar por"
          options={CONTACT_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
      <div className="min-w-[8rem]">
        <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Direção</p>
        <Select
          size="sm"
          value={order}
          onChange={(v) => onSort(sort, v as SortOrder)}
          aria-label="Direção da ordenação"
          options={[
            { value: "desc", label: "Decrescente" },
            { value: "asc", label: "Crescente" },
          ]}
        />
      </div>
    </div>
  );
}
