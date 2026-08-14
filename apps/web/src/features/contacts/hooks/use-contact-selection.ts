"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSelection,
  emptySelection,
  isSelected,
  pageCheckboxState,
  selectAllMatching,
  selectedCount,
  selectRange,
  toBulkTarget,
  toggleOne,
  togglePage,
  type ContactSelection,
} from "../selection";

export function useContactSelection(opts: {
  pageIds: string[];
  total: number;
  filterKey: string;
}) {
  const { pageIds, total, filterKey } = opts;
  const [sel, setSel] = useState<ContactSelection>(emptySelection());
  const lastClicked = useRef<string | null>(null);

  useEffect(() => {
    setSel(clearSelection());
    lastClicked.current = null;
  }, [filterKey]);

  const count = useMemo(
    () => selectedCount(sel, pageIds, total),
    [sel, pageIds, total]
  );
  const pageState = useMemo(() => pageCheckboxState(sel, pageIds), [sel, pageIds]);
  const active = count > 0;

  const toggleRow = useCallback(
    (id: string, shift: boolean) => {
      if (shift && lastClicked.current) {
        const from = lastClicked.current;
        setSel((s) => selectRange(s, pageIds, from, id));
      } else {
        setSel((s) => toggleOne(s, id));
      }
      lastClicked.current = id;
    },
    [pageIds]
  );

  const toggleHeader = useCallback(() => {
    const selectAll = pageState !== "all";
    setSel((s) => togglePage(s, pageIds, selectAll));
  }, [pageIds, pageState]);

  const selectMatching = useCallback(() => {
    setSel(selectAllMatching());
  }, []);

  const clear = useCallback(() => {
    setSel(clearSelection());
    lastClicked.current = null;
  }, []);

  const rowSelected = useCallback((id: string) => isSelected(sel, id), [sel]);

  const bulkTarget = useCallback(
    (filters: Record<string, unknown>) => toBulkTarget(sel, filters),
    [sel]
  );

  return {
    sel,
    count,
    pageState,
    active,
    toggleRow,
    toggleHeader,
    selectMatching,
    clear,
    rowSelected,
    bulkTarget,
  };
}
