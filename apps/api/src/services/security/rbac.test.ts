import { describe, expect, it } from "vitest";
import {
  effectivePlatformRole,
  isTrueSuperadmin,
} from "./rbac";

describe("rbac effective roles", () => {
  it("isTrueSuperadmin false when impersonating", () => {
    expect(
      isTrueSuperadmin({ platformRole: "SUPERADMIN", imp: true })
    ).toBe(false);
  });

  it("isTrueSuperadmin true for real superadmin", () => {
    expect(
      isTrueSuperadmin({ platformRole: "SUPERADMIN", imp: false })
    ).toBe(true);
  });

  it("effectivePlatformRole null under imp", () => {
    expect(
      effectivePlatformRole({ platformRole: "SUPERADMIN", imp: true })
    ).toBeNull();
  });
});
