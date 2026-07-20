import { describe, expect, it } from "vitest";
import {
  defaultContinuousLearningConfig,
  parseContinuousLearningConfig,
} from "./agent-learning";

describe("continuous learning config", () => {
  it("default desativado — empresa precisa ativar conscientemente", () => {
    const cfg = defaultContinuousLearningConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.level).toBe(1);
  });

  it("enabled só com true explícito", () => {
    expect(parseContinuousLearningConfig(undefined).enabled).toBe(false);
    expect(parseContinuousLearningConfig({}).enabled).toBe(false);
    expect(parseContinuousLearningConfig({ enabled: false }).enabled).toBe(false);
    expect(parseContinuousLearningConfig({ enabled: "true" }).enabled).toBe(false);
    expect(parseContinuousLearningConfig({ enabled: true }).enabled).toBe(true);
  });

  it("nível inválido cai no supervisionado", () => {
    expect(parseContinuousLearningConfig({ enabled: true, level: 99 }).level).toBe(1);
    expect(parseContinuousLearningConfig({ enabled: true, level: 2 }).level).toBe(2);
  });

  it("fonte desligada explicitamente", () => {
    const cfg = parseContinuousLearningConfig({
      enabled: true,
      sources: { feedbacks: false, aiAttendance: true },
    });
    expect(cfg.sources.feedbacks).toBe(false);
    expect(cfg.sources.aiAttendance).toBe(true);
  });
});
