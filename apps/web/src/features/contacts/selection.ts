/**
 * Contatos 3.0 — estado de seleção (página / allMatching + exclusões).
 * Sem barra roxa: a toolbar principal alterna para modo seleção.
 */

export type SelectionMode = "page" | "allMatching";

export type ContactSelection = {
  mode: SelectionMode;
  /** ids selecionados no modo page; no allMatching = exclusões */
  ids: Set<string>;
  /** no allMatching, ids em `ids` são EXCLUSÕES */
  exclude: Set<string>;
};

export function emptySelection(): ContactSelection {
  return { mode: "page", ids: new Set(), exclude: new Set() };
}

export function selectedCount(
  sel: ContactSelection,
  pageIds: string[],
  totalMatching: number
): number {
  if (sel.mode === "page") return sel.ids.size;
  return Math.max(0, totalMatching - sel.exclude.size);
}

export function isSelected(sel: ContactSelection, id: string): boolean {
  if (sel.mode === "page") return sel.ids.has(id);
  return !sel.exclude.has(id);
}

export function pageCheckboxState(
  sel: ContactSelection,
  pageIds: string[]
): "none" | "some" | "all" {
  if (!pageIds.length) return "none";
  if (sel.mode === "allMatching") {
    const excludedOnPage = pageIds.filter((id) => sel.exclude.has(id)).length;
    if (excludedOnPage === 0) return "all";
    if (excludedOnPage === pageIds.length) return "none";
    return "some";
  }
  const n = pageIds.filter((id) => sel.ids.has(id)).length;
  if (n === 0) return "none";
  if (n === pageIds.length) return "all";
  return "some";
}

export function toggleOne(sel: ContactSelection, id: string): ContactSelection {
  if (sel.mode === "page") {
    const ids = new Set(sel.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ...sel, ids };
  }
  const exclude = new Set(sel.exclude);
  if (exclude.has(id)) exclude.delete(id);
  else exclude.add(id);
  return { ...sel, exclude };
}

export function togglePage(
  sel: ContactSelection,
  pageIds: string[],
  selectAll: boolean
): ContactSelection {
  if (sel.mode === "allMatching") {
    const exclude = new Set(sel.exclude);
    if (selectAll) {
      for (const id of pageIds) exclude.delete(id);
    } else {
      for (const id of pageIds) exclude.add(id);
    }
    return { ...sel, exclude };
  }
  const ids = new Set(sel.ids);
  if (selectAll) {
    for (const id of pageIds) ids.add(id);
  } else {
    for (const id of pageIds) ids.delete(id);
  }
  return { ...sel, ids };
}

/** Shift+click range on current page order */
export function selectRange(
  sel: ContactSelection,
  pageIds: string[],
  fromId: string,
  toId: string
): ContactSelection {
  const a = pageIds.indexOf(fromId);
  const b = pageIds.indexOf(toId);
  if (a < 0 || b < 0) return toggleOne(sel, toId);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const range = pageIds.slice(lo, hi + 1);
  if (sel.mode === "allMatching") {
    const exclude = new Set(sel.exclude);
    for (const id of range) exclude.delete(id);
    return { ...sel, exclude };
  }
  const ids = new Set(sel.ids);
  for (const id of range) ids.add(id);
  return { ...sel, ids };
}

export function selectAllMatching(): ContactSelection {
  return { mode: "allMatching", ids: new Set(), exclude: new Set() };
}

export function clearSelection(): ContactSelection {
  return emptySelection();
}

/** Payload para POST /contacts/bulk */
export function toBulkTarget(
  sel: ContactSelection,
  filters: Record<string, unknown>
): {
  mode: "ids" | "allMatching";
  ids?: string[];
  excludeIds?: string[];
  filters?: Record<string, unknown>;
} {
  if (sel.mode === "allMatching") {
    return {
      mode: "allMatching",
      excludeIds: [...sel.exclude],
      filters,
    };
  }
  return { mode: "ids", ids: [...sel.ids] };
}
