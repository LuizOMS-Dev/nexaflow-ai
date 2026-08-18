import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSystemDiagnostics } from "./platform-diagnostics";

describe("Platform Diagnostics Service (runSystemDiagnostics)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executa varredura de diagnóstico com 7 verificações estruturadas", async () => {
    const diag = await runSystemDiagnostics();

    expect(diag).toHaveProperty("overallStatus");
    expect(["OK", "WARNING", "FAILURE"]).toContain(diag.overallStatus);
    expect(diag).toHaveProperty("checkedAt");
    expect(diag).toHaveProperty("durationMs");
    expect(diag).toHaveProperty("summary");
    expect(diag).toHaveProperty("checks");

    expect(diag.checks.length).toBe(7);

    // Grupos esperados
    const groups = diag.checks.map((c) => c.group);
    expect(groups).toContain("core");
    expect(groups).toContain("database");
    expect(groups).toContain("cache");
    expect(groups).toContain("communications");
    expect(groups).toContain("ai");
    expect(groups).toContain("email");
    expect(groups).toContain("integrations");

    // Summary bate com as checagens
    expect(diag.summary.total).toBe(7);
    expect(
      diag.summary.ok +
        diag.summary.warning +
        diag.summary.failure +
        diag.summary.notConfigured
    ).toBe(7);
  });

  it("garante segurança estrita e zero vazamento de secrets nos detalhes", async () => {
    const diag = await runSystemDiagnostics();
    const stringified = JSON.stringify(diag);

    expect(stringified).not.toContain("password");
    expect(stringified).not.toContain("secret");
    expect(stringified).not.toContain("postgres://");
    expect(stringified).not.toContain("postgresql://");
    expect(stringified).not.toContain("redis://");
    expect(stringified).not.toMatch(/gsk_[a-zA-Z0-9_]{15,}/);
    expect(stringified).not.toMatch(/re_[a-zA-Z0-9_]{15,}/);
    expect(stringified).not.toMatch(/ghp_[a-zA-Z0-9_]{15,}/);
    expect(stringified).not.toContain("Bearer ");
  });

  it("valida integridade de status e normalização de erros", async () => {
    const diag = await runSystemDiagnostics();

    for (const check of diag.checks) {
      expect(check).toHaveProperty("id");
      expect(check).toHaveProperty("title");
      expect(check).toHaveProperty("status");
      expect(["OK", "WARNING", "FAILURE", "NOT_CONFIGURED", "NOT_APPLICABLE"]).toContain(
        check.status
      );
      expect(typeof check.summary).toBe("string");
      expect(check.summary.length).toBeGreaterThan(0);
    }
  });
});
