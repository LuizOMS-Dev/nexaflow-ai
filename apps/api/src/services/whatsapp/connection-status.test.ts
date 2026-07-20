import { describe, expect, it } from "vitest";
import { mapRuntimeToCanonical } from "./connection-status";

describe("mapRuntimeToCanonical — WhatsApp status", () => {
  it("CASO 1: sem canal → NOT_CONFIGURED", () => {
    expect(mapRuntimeToCanonical({ hasChannel: false })).toBe("NOT_CONFIGURED");
  });

  it("CASO 2: canal sem sessão / status vazio → DISCONNECTED (nunca CONNECTED)", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: null,
        liveOpen: false,
      })
    ).toBe("DISCONNECTED");
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "",
        liveOpen: false,
        persistedOpen: false,
      })
    ).toBe("DISCONNECTED");
  });

  it("CASO 3: connecting + QR → QR_REQUIRED", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "connecting",
        hasQr: true,
        liveOpen: false,
      })
    ).toBe("QR_REQUIRED");
  });

  it("CASO 3b: connecting sem QR → CONNECTING", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "connecting",
        hasQr: false,
        liveOpen: false,
      })
    ).toBe("CONNECTING");
  });

  it("CASO 4: sessão live open → CONNECTED", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "open",
        liveOpen: true,
      })
    ).toBe("CONNECTED");
  });

  it("CASO 4b: status open persistido sem live → DISCONNECTED (não falso positivo)", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "open",
        liveOpen: false,
        persistedOpen: true,
      })
    ).toBe("DISCONNECTED");
  });

  it("CASO 5: caiu / close → DISCONNECTED", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "close",
        liveOpen: false,
      })
    ).toBe("DISCONNECTED");
  });

  it("CASO 5b: close com open persistido → RECONNECTING", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "close",
        liveOpen: false,
        persistedOpen: true,
      })
    ).toBe("RECONNECTING");
  });

  it("CASO 6 / ERROR: lastError → ERROR", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: "unknown",
        lastError: "timeout",
        liveOpen: false,
      })
    ).toBe("ERROR");
  });

  it("Nunca trata isActive implícito: open persistido sem live → DISCONNECTED", () => {
    expect(
      mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState: null,
        liveOpen: false,
        persistedOpen: true,
      })
    ).toBe("DISCONNECTED");
  });
});
