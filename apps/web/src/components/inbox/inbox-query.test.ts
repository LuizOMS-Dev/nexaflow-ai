import { describe, expect, it } from "vitest";
import { buildConversationParams, type OpsNav } from "./inbox-query";

describe("buildConversationParams", () => {
  const base = {
    search: "",
    userId: "u1",
    unreadOnly: false,
    needsApproval: false,
    archived: false,
  };

  it.each([
    ["inbox", "status=OPEN"],
    ["mine", "assignedToId=u1"],
    ["waiting", "status=PENDING&unassigned=1"],
    ["ai", "status=OPEN&unassigned=1"],
    ["closed", "status=CLOSED"],
  ] as Array<[OpsNav, string]>)("mapeia %s", (opsNav, expected) => {
    expect(buildConversationParams({ ...base, opsNav }).toString()).toBe(expected);
  });

  it("normaliza busca e combina filtros", () => {
    expect(
      buildConversationParams({
        ...base,
        opsNav: "inbox",
        search: "  Maria  ",
        unreadOnly: true,
        needsApproval: true,
      }).toString()
    ).toBe("search=Maria&unread=1&pendingApproval=1&status=OPEN");
  });

  it("abre o arquivo de encerradas sem alterar as demais filas", () => {
    expect(
      buildConversationParams({ ...base, opsNav: "closed", archived: true }).get("status")
    ).toBe("ARCHIVED");
  });
});
