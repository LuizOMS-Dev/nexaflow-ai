import { describe, expect, it } from "vitest";
import { enrichTenantBilling, resolvePriceKind } from "./billing-view";

describe("price semantics", () => {
  it("enterprise without contracted price is ON_REQUEST not zero", () => {
    expect(
      resolvePriceKind({ planSlug: "enterprise", priceOnRequest: true, contractedPrice: null })
    ).toBe("ON_REQUEST");
    expect(
      resolvePriceKind({ planSlug: "enterprise", priceOnRequest: true, contractedPrice: 0 })
    ).toBe("CUSTOM_ZERO");
    expect(resolvePriceKind({ planSlug: "free", contractedPrice: 0 })).toBe("FREE");
    expect(resolvePriceKind({ planSlug: "pro", contractedPrice: 299 })).toBe("FIXED");
  });

  it("list and detail share due date for paid plans", () => {
    const billed = enrichTenantBilling(
      { id: "t1", status: "ACTIVE", plan: { id: "p", name: "Pro", priceMonthly: 299, priceOnRequest: false, slug: "pro" } },
      {
        id: "s1",
        tenantId: "t1",
        planId: "p",
        billingStatus: "ACTIVE",
        billingCycle: "MONTHLY",
        priceMonthly: 299,
        priceAnnual: null,
        billingDueDay: 10,
        currentPeriodEnd: new Date(Date.UTC(2026, 8, 10)),
        trialEndsAt: null,
        cancelAt: null,
      }
    );
    expect(billed.nextDueDate).toBe("2026-09-10");
    expect(billed.hasCharge).toBe(true);
    expect(billed.financialStatus).not.toBe("UNKNOWN");
  });

  it("enterprise on request is Sem cobrança not Pagamento em dia", () => {
    const billed = enrichTenantBilling(
      {
        id: "t1",
        status: "ACTIVE",
        plan: { id: "p", name: "Enterprise", priceMonthly: 0, priceOnRequest: true, slug: "enterprise" },
      },
      {
        id: "s1",
        tenantId: "t1",
        planId: "p",
        billingStatus: "ACTIVE",
        billingCycle: "MONTHLY",
        priceMonthly: null,
        priceAnnual: null,
        billingDueDay: 10,
        currentPeriodEnd: new Date(Date.UTC(2026, 8, 10)),
        trialEndsAt: null,
        cancelAt: null,
      }
    );
    expect(billed.priceKind).toBe("ON_REQUEST");
    expect(billed.hasCharge).toBe(false);
    expect(billed.contractedPrice).toBeNull();
    expect(billed.financialStatus).toBe("UNKNOWN");
    expect(billed.financialStatusLabel).toBe("Sem cobrança");
  });
});
