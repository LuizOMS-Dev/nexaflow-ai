import { describe, expect, it } from "vitest";
import { qrSecondsLeft, WA_QR_TTL_SEC } from "./qr";

describe("qrSecondsLeft", () => {
  it("sem timestamp → 0", () => {
    expect(qrSecondsLeft(null)).toBe(0);
    expect(qrSecondsLeft(undefined)).toBe(0);
  });

  it("QR recém gerado ainda vale", () => {
    const now = new Date().toISOString();
    expect(qrSecondsLeft(now)).toBeGreaterThan(WA_QR_TTL_SEC - 2);
  });

  it("QR velho → 0", () => {
    expect(qrSecondsLeft(new Date(Date.now() - 60_000).toISOString())).toBe(0);
  });
});
