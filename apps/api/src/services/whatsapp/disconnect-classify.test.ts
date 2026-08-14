import { describe, expect, it } from "vitest";
import {
  classifyDisconnect,
  reconnectDelayMs,
  shouldInvalidateAuth,
  shouldReconnect,
} from "./disconnect-classify";

describe("classifyDisconnect", () => {
  it("logout real → LOGGED_OUT e invalida auth", () => {
    const k = classifyDisconnect(401);
    expect(k).toBe("LOGGED_OUT");
    expect(shouldInvalidateAuth(k)).toBe(true);
    expect(shouldReconnect(k)).toBe(false);
  });

  it("restartRequired → reconecta sem invalidar auth", () => {
    const k = classifyDisconnect(515);
    expect(k).toBe("RESTART_REQUIRED");
    expect(shouldInvalidateAuth(k)).toBe(false);
    expect(shouldReconnect(k)).toBe(true);
  });

  it("timeout / rede → transitório, reconecta, não apaga creds", () => {
    const k = classifyDisconnect(408);
    expect(k).toBe("TIMED_OUT");
    expect(shouldInvalidateAuth(k)).toBe(false);
    expect(shouldReconnect(k)).toBe(true);
  });

  it("código desconhecido de rede → não apaga creds", () => {
    const k = classifyDisconnect(1006);
    expect(shouldInvalidateAuth(k)).toBe(false);
    expect(shouldReconnect(k)).toBe(true);
  });
});

describe("reconnectDelayMs", () => {
  it("cresce com tentativas e respeita teto", () => {
    const d0 = reconnectDelayMs(0, { baseMs: 1000, maxMs: 60_000 });
    const d5 = reconnectDelayMs(5, { baseMs: 1000, maxMs: 60_000 });
    expect(d0).toBeGreaterThanOrEqual(1000);
    expect(d5).toBeGreaterThan(d0);
    expect(d5).toBeLessThanOrEqual(60_000 + 1000);
  });
});
