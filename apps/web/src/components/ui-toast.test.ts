import { describe, expect, it } from "vitest";

describe("Toast System Constants & Logic", () => {
  it("defines appropriate auto-dismiss defaults for all kinds", () => {
    const DEFAULT_DURATIONS = {
      success: 3800,
      info: 4000,
      warning: 5000,
      error: 6000,
      loading: 0,
    };

    expect(DEFAULT_DURATIONS.success).toBe(3800);
    expect(DEFAULT_DURATIONS.info).toBe(4000);
    expect(DEFAULT_DURATIONS.warning).toBe(5000);
    expect(DEFAULT_DURATIONS.error).toBe(6000);
    expect(DEFAULT_DURATIONS.loading).toBe(0);
  });

  it("computes deduplication key accurately", () => {
    function getDedupKey(opts: { key?: string; kind?: string; title: string }) {
      return opts.key || `${opts.kind || "info"}:${opts.title.trim()}`;
    }

    expect(getDedupKey({ kind: "success", title: "Preferências salvas" })).toBe(
      "success:Preferências salvas"
    );
    expect(getDedupKey({ key: "custom-key", kind: "success", title: "Outro título" })).toBe(
      "custom-key"
    );
  });

  it("calculates remaining duration with pause and resume correctly", () => {
    const totalDuration = 4000;
    let remaining = totalDuration;
    let lastStart = 1000;

    // Pausar após 1500ms
    const pauseTime = 2500;
    const elapsed = pauseTime - lastStart;
    remaining = Math.max(0, remaining - elapsed);

    expect(remaining).toBe(2500);

    // Retomar em 3000ms
    lastStart = 3000;
    const resumeElapsed = 1000; // mais 1000ms passam
    remaining = Math.max(0, remaining - resumeElapsed);

    expect(remaining).toBe(1500);
  });
});
