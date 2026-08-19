import { afterEach, describe, expect, it, vi } from "vitest";
import { probeWhatsAppGateway, resolveGatewayApiKey, wahaAuthHeaders } from "./gateway-probe";

describe("gateway-probe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WA_GATEWAY_API_KEY;
    delete process.env.WAHA_API_KEY;
    delete process.env.WAHA_API_KEY_PLAIN;
    delete process.env.EVOLUTION_API_KEY;
  });

  it("resolveGatewayApiKey ignora hash sha512 e dummy", () => {
    process.env.WAHA_API_KEY = "sha512:abc";
    expect(resolveGatewayApiKey()).toEqual({ key: "", missing: true, hashedOnly: true });
    process.env.WAHA_API_KEY = "nexaflow-evolution-key";
    expect(resolveGatewayApiKey().missing).toBe(true);
    process.env.WA_GATEWAY_API_KEY = "plain-secret";
    expect(resolveGatewayApiKey()).toEqual({
      key: "plain-secret",
      missing: false,
      hashedOnly: false,
    });
  });

  it("wahaAuthHeaders usa X-Api-Key e não o header Evolution apikey", () => {
    expect(wahaAuthHeaders("secret")).toEqual({
      Accept: "application/json",
      "X-Api-Key": "secret",
    });
    expect(wahaAuthHeaders("sha512:dead")).toEqual({ Accept: "application/json" });
  });

  it("probe WAHA autentica em /api/sessions com X-Api-Key", async () => {
    process.env.WA_GATEWAY_API_KEY = "prod-key";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Api-Key")).toBe("prod-key");
      expect(headers.get("apikey")).toBeNull();
      expect(String(url)).toContain("/api/sessions");
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeWhatsAppGateway({
      provider: "waha",
      baseUrl: "http://waha:3000",
    });
    expect(result.ok).toBe(true);
    expect(result.authFailed).toBe(false);
    expect(result.path).toBe("/api/sessions");
  });

  it("probe WAHA marca 401 como authFailed", async () => {
    process.env.WA_GATEWAY_API_KEY = "wrong";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"message":"Unauthorized"}', { status: 401 }))
    );
    const result = await probeWhatsAppGateway({
      provider: "waha",
      baseUrl: "http://waha:3000",
    });
    expect(result.ok).toBe(false);
    expect(result.reachable).toBe(true);
    expect(result.authFailed).toBe(true);
    expect(result.statusCode).toBe(401);
  });
});
