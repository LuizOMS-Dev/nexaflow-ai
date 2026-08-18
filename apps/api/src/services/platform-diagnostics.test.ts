import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runSystemDiagnostics,
  formatAuditAction,
  formatSecurityEvent,
  getDiagnosticsOverview,
} from "./platform-diagnostics";

describe("Platform Diagnostics Service & Formatter Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. mapeia ações de auditoria para títulos humanos em PT-BR", () => {
    expect(formatAuditAction("deployment.started")).toBe("Implantação iniciada");
    expect(formatAuditAction("auth.login")).toBe("Login administrativo realizado");
    expect(formatAuditAction("admin.plan.create")).toBe("Plano comercial criado");
    expect(formatAuditAction("admin.cost.create")).toBe("Custo operacional registrado");
    expect(formatAuditAction("admin.lead.convert")).toBe("Lead comercial convertido em empresa");
    expect(formatAuditAction("custom.event.name")).toBe("Custom › Event › Name");
  });

  it("2. mapeia eventos de segurança com severidades precisas", () => {
    const login = formatSecurityEvent("LOGIN_SUCCESS");
    expect(login.label).toBe("Login realizado com sucesso");
    expect(login.severity).toBe("INFO");

    const reuse = formatSecurityEvent("REFRESH_REUSE");
    expect(reuse.label).toBe("Reutilização indevida de refresh token");
    expect(reuse.severity).toBe("DANGER");

    const mfaFail = formatSecurityEvent("MFA_VERIFY_FAIL");
    expect(mfaFail.label).toBe("Falha na validação do código MFA");
    expect(mfaFail.severity).toBe("WARNING");

    const impersonation = formatSecurityEvent("IMPERSONATION_START");
    expect(impersonation.label).toBe("Acesso administrativo como empresa iniciado");
    expect(impersonation.severity).toBe("WARNING");
  });

  it("3. executa varredura de diagnóstico com 7 verificações estruturadas", async () => {
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

  it("4. garante segurança estrita e zero vazamento de secrets nos detalhes", async () => {
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

  it("5. valida integridade de status e normalização de erros", async () => {
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

  it("6. gera telemetria de 24h a partir de dados reais", async () => {
    const overview = await getDiagnosticsOverview();
    expect(overview).toHaveProperty("period", "24h");
    expect(overview).toHaveProperty("generatedAt");
    expect(overview).toHaveProperty("metrics");
    expect(typeof overview.metrics.activityEvents).toBe("number");
    expect(typeof overview.metrics.webhookFailures).toBe("number");
    expect(typeof overview.metrics.webhookPending).toBe("number");
    expect(typeof overview.metrics.whatsappChannels).toBe("number");
    expect(typeof overview.metrics.aiExecutions).toBe("number");
    expect(typeof overview.metrics.securityEvents).toBe("number");
    expect(typeof overview.metrics.apiCalls).toBe("number");
  });
});
