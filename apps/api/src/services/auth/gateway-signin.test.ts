import { describe, expect, it } from "vitest";
import { gatewayPublicState } from "./gateway-signin";

describe("auth gateway", () => {
  it("expõe estado público sem dados pessoais", () => {
    const s = gatewayPublicState();
    expect(s.product).toBe("NexaFlow");
    expect(typeof s.maintenance).toBe("boolean");
  });
});
