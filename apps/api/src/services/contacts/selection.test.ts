/**
 * Cobre apps/web/src/features/contacts/selection.ts sem inventar Vitest no web.
 * Import dinâmico: o arquivo vive fora de apps/api (rootDir).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type ContactSelection = {
  mode: "page" | "allMatching";
  ids: Set<string>;
  exclude: Set<string>;
};

type SelectionMod = {
  emptySelection: () => ContactSelection;
  selectedCount: (sel: ContactSelection, pageIds: string[], totalMatching: number) => number;
  isSelected: (sel: ContactSelection, id: string) => boolean;
  pageCheckboxState: (sel: ContactSelection, pageIds: string[]) => "none" | "some" | "all";
  toggleOne: (sel: ContactSelection, id: string) => ContactSelection;
  togglePage: (sel: ContactSelection, pageIds: string[], selectAll: boolean) => ContactSelection;
  selectRange: (
    sel: ContactSelection,
    pageIds: string[],
    fromId: string,
    toId: string
  ) => ContactSelection;
  selectAllMatching: () => ContactSelection;
  clearSelection: () => ContactSelection;
  toBulkTarget: (
    sel: ContactSelection,
    filters: Record<string, unknown>
  ) => {
    mode: "ids" | "allMatching";
    ids?: string[];
    excludeIds?: string[];
    filters?: Record<string, unknown>;
  };
};

const PAGE = ["a", "b", "c", "d"];

describe("FE selection.ts (Contatos 3.0)", () => {
  let S: SelectionMod;

  beforeAll(async () => {
    const file = path.resolve(__dirname, "../../../../web/src/features/contacts/selection.ts");
    S = (await import(pathToFileURL(file).href)) as SelectionMod;
  });

  it("emptySelection começa em modo page sem ids", () => {
    const sel = S.emptySelection();
    expect(sel.mode).toBe("page");
    expect(sel.ids.size).toBe(0);
    expect(S.selectedCount(sel, PAGE, 40)).toBe(0);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("none");
  });

  it("toggleOne / togglePage no modo page", () => {
    let sel = S.toggleOne(S.emptySelection(), "b");
    expect(S.isSelected(sel, "b")).toBe(true);
    expect(S.selectedCount(sel, PAGE, 40)).toBe(1);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("some");

    sel = S.togglePage(sel, PAGE, true);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("all");
    expect(S.selectedCount(sel, PAGE, 40)).toBe(4);

    sel = S.togglePage(sel, PAGE, false);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("none");
    expect(S.toBulkTarget(sel, { search: "x" })).toEqual({ mode: "ids", ids: [] });
  });

  it("selectRange (shift) marca o intervalo na ordem da página", () => {
    const sel = S.selectRange(S.emptySelection(), PAGE, "b", "d");
    expect([...sel.ids].sort()).toEqual(["b", "c", "d"]);
  });

  it("allMatching: selectedCount = total - exclude; toggleOne exclui", () => {
    let sel = S.selectAllMatching();
    expect(S.selectedCount(sel, PAGE, 40)).toBe(40);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("all");
    expect(S.isSelected(sel, "a")).toBe(true);

    sel = S.toggleOne(sel, "a");
    expect(S.isSelected(sel, "a")).toBe(false);
    expect(S.selectedCount(sel, PAGE, 40)).toBe(39);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("some");

    const payload = S.toBulkTarget(sel, { archived: "0", search: "ana" });
    expect(payload.mode).toBe("allMatching");
    expect(payload.excludeIds).toEqual(["a"]);
    expect(payload.filters).toEqual({ archived: "0", search: "ana" });
    expect(payload.ids).toBeUndefined();
  });

  it("togglePage em allMatching adiciona/remove exclusões da página", () => {
    let sel = S.selectAllMatching();
    sel = S.togglePage(sel, PAGE, false);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("none");
    expect(S.selectedCount(sel, PAGE, 40)).toBe(36);

    sel = S.togglePage(sel, PAGE, true);
    expect(S.pageCheckboxState(sel, PAGE)).toBe("all");
    expect(S.selectedCount(sel, PAGE, 40)).toBe(40);
  });

  it("clearSelection volta ao vazio", () => {
    const sel = S.clearSelection();
    expect(sel).toEqual(S.emptySelection());
  });
});
