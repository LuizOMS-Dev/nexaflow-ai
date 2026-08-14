import { describe, expect, it } from "vitest";
import { buildContactWhere, contactListSelect } from "./query";

describe("buildContactWhere", () => {
  it("sempre ancora tenantId (nunca remove por perf)", () => {
    const w = buildContactWhere("ten-1", { search: "11988887777" });
    expect(w.tenantId).toBe("ten-1");
  });

  it("busca telefone com contains + variants (IN), sem segunda autoridade", () => {
    const w = buildContactWhere("ten-1", { search: "11988887777" });
    const and = (w.AND ?? []) as Array<{ OR?: unknown[] }>;
    const or = and.find((c) => (c.OR ?? []).some((x) => x && typeof x === "object" && "phone" in x))
      ?.OR ?? [];
    const phones = or.filter((c) => c && typeof c === "object" && "phone" in c) as Array<{
      phone: { contains?: string; in?: string[] };
    }>;
    expect(phones.some((p) => p.phone.contains === "11988887777")).toBe(true);
    const inn = phones.find((p) => Array.isArray(p.phone.in));
    expect(inn?.phone.in).toEqual(expect.arrayContaining(["11988887777", "5511988887777"]));
  });

  it("select da lista não inclui blobs (customData/scoreBreakdown/notes)", () => {
    expect(contactListSelect).not.toHaveProperty("customData");
    expect(contactListSelect).not.toHaveProperty("scoreBreakdown");
    expect(contactListSelect).not.toHaveProperty("notes");
    expect(contactListSelect.id).toBe(true);
    expect(contactListSelect.phone).toBe(true);
  });
});
