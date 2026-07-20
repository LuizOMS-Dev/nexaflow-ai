import { describe, it, expect } from "vitest";
import { hasPermission, permissionsForRole } from "./permissions";

describe("RBAC permissions", () => {
  it("ADMIN tem contacts.delete", () => {
    expect(hasPermission("ADMIN", null, "contacts.delete")).toBe(true);
  });

  it("READONLY não cria contatos", () => {
    expect(hasPermission("READONLY", null, "contacts.create")).toBe(false);
  });

  it("AGENT não gerencia canais", () => {
    expect(hasPermission("AGENT", null, "channels.manage")).toBe(false);
  });

  it("SUPERADMIN bypassa permissões", () => {
    expect(hasPermission(null, "SUPERADMIN", "users.delete")).toBe(true);
  });

  it("SUPERADMIN em impersonação usa role do membership", () => {
    expect(
      hasPermission("READONLY", "SUPERADMIN", "contacts.create", { impersonating: true })
    ).toBe(false);
    expect(
      hasPermission("ADMIN", "SUPERADMIN", "contacts.create", { impersonating: true })
    ).toBe(true);
  });

  it("permissionsForRole READONLY só leitura", () => {
    const perms = permissionsForRole("READONLY");
    expect(perms.every((p) => p.endsWith(".read") || p === "settings.read")).toBe(true);
  });
});
