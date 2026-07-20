import { describe, expect, it } from "vitest";
import {
  resolveFinancialAccess,
  isPathAllowedWhenRestricted,
  type AccessPolicy,
} from "./access-gate";

const basePolicy: Pick<AccessPolicy, "graceDays" | "autoSuspendNonpayment"> = {
  graceDays: 7,
  autoSuspendNonpayment: true,
};

describe("access-gate finance", () => {
  it("CURRENT quando em dia", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 20);
    const r = resolveFinancialAccess({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      currentPeriodEnd: future,
      graceDays: 7,
      autoSuspendNonpayment: true,
    });
    expect(r.code).toBe("CURRENT");
  });

  it("GRACE_PERIOD quando atraso dentro da tolerância", () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 3);
    const r = resolveFinancialAccess({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      currentPeriodEnd: past,
      ...basePolicy,
    });
    expect(r.code).toBe("GRACE_PERIOD");
    expect(r.daysOverdue).toBe(3);
  });

  it("SUSPENDED_FOR_NONPAYMENT após tolerância com autoSuspend", () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 10);
    const r = resolveFinancialAccess({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      currentPeriodEnd: past,
      graceDays: 7,
      autoSuspendNonpayment: true,
    });
    expect(r.code).toBe("SUSPENDED_FOR_NONPAYMENT");
  });

  it("não suspende automaticamente se autoSuspend desligado", () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 20);
    const r = resolveFinancialAccess({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      currentPeriodEnd: past,
      graceDays: 7,
      autoSuspendNonpayment: false,
    });
    // overdue > grace mas sem auto → OVERDUE (acesso com aviso)
    expect(r.code).toBe("OVERDUE");
  });

  it("billingStatus SUSPENDED + tenant ACTIVE = inadimplência", () => {
    const r = resolveFinancialAccess({
      tenantStatus: "ACTIVE",
      billingStatus: "SUSPENDED",
      currentPeriodEnd: new Date(),
      graceDays: 7,
      autoSuspendNonpayment: true,
    });
    expect(r.code).toBe("SUSPENDED_FOR_NONPAYMENT");
  });
});

describe("access-gate restricted paths", () => {
  it("permite leitura de settings e auth", () => {
    expect(isPathAllowedWhenRestricted("/settings", "GET")).toBe(true);
    expect(isPathAllowedWhenRestricted("/auth/access-state", "GET")).toBe(true);
    expect(isPathAllowedWhenRestricted("/usage", "GET")).toBe(true);
  });

  it("bloqueia mutações operacionais", () => {
    expect(isPathAllowedWhenRestricted("/contacts", "POST")).toBe(false);
    expect(isPathAllowedWhenRestricted("/campaigns", "POST")).toBe(false);
    expect(isPathAllowedWhenRestricted("/ai-agents", "PATCH")).toBe(false);
  });

  it("permite logout", () => {
    expect(isPathAllowedWhenRestricted("/auth/logout", "POST")).toBe(true);
  });
});
