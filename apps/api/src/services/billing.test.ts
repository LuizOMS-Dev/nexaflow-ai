import { describe, expect, it } from "vitest";
import {
  advancePeriodAfterPayment,
  calendarDaysBetween,
  clampDayOfMonth,
  computeBillingSnapshot,
  computeNextDueDate,
  FINANCIAL_STATUS_LABEL,
} from "./billing";

describe("billing helpers", () => {
  it("clamps day for short months", () => {
    // Feb 2026 has 28 days
    expect(clampDayOfMonth(2026, 1, 31)).toBe(28);
    expect(clampDayOfMonth(2026, 0, 31)).toBe(31);
  });

  it("computes next due after payment to next month", () => {
    const paidAt = new Date(Date.UTC(2026, 6, 10)); // 10 Jul 2026
    const next = advancePeriodAfterPayment({
      billingDueDay: 10,
      currentPeriodEnd: paidAt,
      paidAt,
    });
    expect(next.getUTCFullYear()).toBe(2026);
    expect(next.getUTCMonth()).toBe(7); // Aug
    expect(next.getUTCDate()).toBe(10);
  });

  it("marks overdue with real days", () => {
    const now = new Date(Date.UTC(2026, 7, 18)); // 18 Aug
    const snap = computeBillingSnapshot({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      billingDueDay: 10,
      currentPeriodEnd: new Date(Date.UTC(2026, 7, 10)),
      now,
    });
    expect(snap.financialStatus).toBe("OVERDUE");
    expect(snap.daysOverdue).toBe(8);
    expect(snap.financialStatusLabel).toBe(FINANCIAL_STATUS_LABEL.OVERDUE);
  });

  it("marks in good standing when due is far", () => {
    const now = new Date(Date.UTC(2026, 7, 1));
    const snap = computeBillingSnapshot({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      billingDueDay: 10,
      currentPeriodEnd: new Date(Date.UTC(2026, 7, 20)),
      now,
    });
    expect(snap.financialStatus).toBe("IN_GOOD_STANDING");
    expect(snap.daysOverdue).toBeNull();
  });

  it("does not invent overdue without dates", () => {
    const snap = computeBillingSnapshot({
      tenantStatus: "ACTIVE",
      billingStatus: "ACTIVE",
      now: new Date(Date.UTC(2026, 7, 15)),
    });
    expect(snap.financialStatus).toBe("UNKNOWN");
    expect(snap.daysOverdue).toBeNull();
  });

  it("calendar days between", () => {
    const a = new Date(Date.UTC(2026, 7, 10));
    const b = new Date(Date.UTC(2026, 7, 18));
    expect(calendarDaysBetween(a, b)).toBe(8);
  });

  it("computeNextDueDate after today rolls to next month", () => {
    const from = new Date(Date.UTC(2026, 7, 15));
    const next = computeNextDueDate(10, from);
    expect(next.getUTCMonth()).toBe(8); // Sep
    expect(next.getUTCDate()).toBe(10);
  });
});
