import { describe, expect, it } from "vitest";
import {
  conversationAccessWhere,
  conversationNavigationWhere,
} from "./conversation-access";

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

describe("conversationNavigationWhere", () => {
  const admin = { tenantId: "t1", role: "ADMIN", sub: "u1" };

  it.each([
    ["inbox", { status: "OPEN" }],
    ["waiting", { status: "PENDING", assignedToId: null }],
    ["ai", { status: "OPEN", assignedToId: null }],
    ["closed", { status: "CLOSED" }],
  ] as const)("mapeia a fila %s", (bucket, expected) => {
    expect(conversationNavigationWhere(admin, bucket)).toEqual({
      AND: [{ tenantId: "t1" }, expected],
    });
  });

  it("Minha fila conta somente atendimentos ativos atribuídos ao usuário", () => {
    expect(conversationNavigationWhere(admin, "mine")).toEqual({
      AND: [
        { tenantId: "t1" },
        { assignedToId: "u1", status: { in: ["OPEN", "PENDING"] } },
      ],
    });
  });

  it("preserva o escopo restrito do atendente", () => {
    expect(
      conversationNavigationWhere(
        { tenantId: "t1", role: "AGENT", sub: "u1" },
        "inbox"
      )
    ).toEqual({
      AND: [
        {
          tenantId: "t1",
          OR: [{ assignedToId: "u1" }, { assignedToId: null }],
        },
        { status: "OPEN" },
      ],
    });
  });
});
