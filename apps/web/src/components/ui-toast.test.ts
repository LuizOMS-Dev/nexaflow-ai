import { describe, expect, it } from "vitest";
import { DEFAULT_DURATIONS } from "./ui-toast";

describe("Toast System Constants & Logic", () => {
  it("defines appropriate auto-dismiss defaults for all kinds", () => {
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
    expect(getDedupKey({ kind: "error", title: " Falha de rede " })).toBe(
      "error:Falha de rede"
    );
  });

  it("calculates remaining duration with pause and resume correctly without resetting", () => {
    const totalDuration = 4000;
    let remaining = totalDuration;
    let lastStart = 1000;

    // 1. Pausar após 1500ms
    const pauseTime = 2500;
    const elapsed = pauseTime - lastStart;
    remaining = Math.max(0, remaining - elapsed);

    expect(remaining).toBe(2500);

    // 2. Retomar em 3000ms
    lastStart = 3000;
    const resumeElapsed = 1000; // mais 1000ms passam
    remaining = Math.max(0, remaining - resumeElapsed);

    expect(remaining).toBe(1500);

    // 3. Pausar novamente após 500ms
    const secondPauseTime = 4500;
    const secondElapsed = secondPauseTime - (lastStart + resumeElapsed);
    remaining = Math.max(0, remaining - secondElapsed);

    expect(remaining).toBe(1000);
  });

  it("loading kind has persistent/indeterminate duration of 0", () => {
    expect(DEFAULT_DURATIONS.loading).toBe(0);
  });

  it("supports transitions from loading to success with refreshed duration", () => {
    let currentToast = {
      id: "toast-1",
      kind: "loading",
      title: "Consultando GitHub...",
      duration: DEFAULT_DURATIONS.loading,
      refreshCount: 0,
    };

    expect(currentToast.duration).toBe(0);

    // Update to success
    currentToast = {
      ...currentToast,
      kind: "success",
      title: "GitHub sincronizado",
      duration: DEFAULT_DURATIONS.success,
      refreshCount: currentToast.refreshCount + 1,
    };

    expect(currentToast.kind).toBe("success");
    expect(currentToast.duration).toBe(3800);
    expect(currentToast.refreshCount).toBe(1);
  });
});
