import { describe, expect, it } from "vitest";
import { conversationAccessWhere } from "./conversation-access";

describe("conversationAccessWhere", () => {
  it("ADMIN vê o tenant inteiro", () => {
    expect(
      conversationAccessWhere({ tenantId: "t1", role: "ADMIN", sub: "u1" }, "c1")
    ).toEqual({ id: "c1", tenantId: "t1" });
  });

  it("AGENT só vê atribuídas a ele ou fila", () => {
    expect(
      conversationAccessWhere({ tenantId: "t1", role: "AGENT", sub: "u1" }, "c1")
    ).toEqual({
      id: "c1",
      tenantId: "t1",
      OR: [{ assignedToId: "u1" }, { assignedToId: null }],
    });
  });

  it("lista AGENT sem id aplica o mesmo escopo", () => {
    const where = conversationAccessWhere({ tenantId: "t1", role: "AGENT", sub: "u1" });
    expect(where).toMatchObject({
      tenantId: "t1",
      OR: [{ assignedToId: "u1" }, { assignedToId: null }],
    });
    expect(where).not.toHaveProperty("id");
  });
});
