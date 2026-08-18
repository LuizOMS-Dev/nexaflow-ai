import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runSystemDiagnostics,
  formatAuditAction,
  formatSecurityEvent,
  getDiagnosticsOverview,
  getDiagnosticApi,
  getDiagnosticActivity,
  getDiagnosticSecurity,
} from "./platform-diagnostics";

describe("Platform Diagnostics Service & Formatter Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. mapeia ações de auditoria para títulos humanos em PT-BR sem fallbacks feios", () => {
    expect(formatAuditAction("deployment.started")).toBe("Implantação iniciada");
    expect(formatAuditAction("deployment.logs_cleared")).toBe("Histórico de implantações limpo");
    expect(formatAuditAction("github_updates.cleared")).toBe("Histórico recente do GitHub limpo");
    expect(formatAuditAction("github_updates.clear_requested")).toBe("Limpeza de atualizações do GitHub solicitada");
    expect(formatAuditAction("auth.login")).toBe("Login administrativo realizado");
    expect(formatAuditAction("admin.plan.create")).toBe("Plano comercial criado");
    expect(formatAuditAction("admin.cost.create")).toBe("Custo operacional registrado");
    expect(formatAuditAction("admin.subscription.cancel")).toBe("Assinatura de empresa cancelada");
    expect(formatAuditAction("admin.lead.convert")).toBe("Lead comercial convertido em empresa");
    expect(formatAuditAction("admin.impersonate")).toBe("Acesso como empresa iniciado");
    expect(formatAuditAction("admin.impersonate.stop")).toBe("Acesso como empresa finalizado");
    expect(formatAuditAction("tenant.create")).toBe("Empresa cadastrada");
    expect(formatAuditAction("custom_module.some_action")).toBe("Custom module › Some action");
  });

  it("2. mapeia eventos de segurança com rótulos e severidades precisas", () => {
    const loginSuccess = formatSecurityEvent("LOGIN_SUCCESS");
    expect(loginSuccess.label).toBe("Login realizado com sucesso");
    expect(loginSuccess.severity).toBe("INFO");

    const loginFail = formatSecurityEvent("LOGIN_FAILURE");
    expect(loginFail.label).toBe("Falha de autenticação");
    expect(loginFail.severity).toBe("WARNING");

    const loginFailed = formatSecurityEvent("LOGIN_FAILED");
    expect(loginFailed.label).toBe("Falha de autenticação");
    expect(loginFailed.severity).toBe("WARNING");

    const reuse = formatSecurityEvent("REFRESH_REUSE");
    expect(reuse.label).toBe("Reutilização indevida de refresh token");
    expect(reuse.severity).toBe("DANGER");

    const impersonationStart = formatSecurityEvent("IMPERSONATION_START");
    expect(impersonationStart.label).toBe("Acesso administrativo como empresa iniciado");
    expect(impersonationStart.severity).toBe("WARNING");

    const impersonationStop = formatSecurityEvent("IMPERSONATION_STOP");
    expect(impersonationStop.label).toBe("Acesso como empresa finalizado");
    expect(impersonationStop.severity).toBe("INFO");
  });

  it("3. executa varredura de diagnóstico com 7 verificações estruturadas e independentes", async () => {
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

  it("4. garante integridade e independência nas checagens de Deploy (GitHub + EasyPanel)", async () => {
    const diag = await runSystemDiagnostics();
    const deployCheck = diag.checks.find((c) => c.id === "deploy_integrations");
    expect(deployCheck).toBeDefined();
    if (deployCheck?.details) {
      expect(deployCheck.details).toHaveProperty("github");
      expect(deployCheck.details).toHaveProperty("easypanel");
    }
  });

  it("5. garante segurança estrita e zero vazamento de secrets nos detalhes", async () => {
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

  it("6. gera telemetria de 24h a partir de dados reais com definição de período móvel e persistência", async () => {
    const overview = await getDiagnosticsOverview();
    expect(overview).toHaveProperty("period", "24h");
    expect(overview).toHaveProperty("windowLabel", "Janela móvel das últimas 24 horas");
    expect(overview).toHaveProperty("generatedAt");
    expect(overview).toHaveProperty("metrics");
    expect(typeof overview.metrics.activityEvents).toBe("number");
    expect(typeof overview.metrics.webhookFailures).toBe("number");
    expect(typeof overview.metrics.webhookPending).toBe("number");
    expect(typeof overview.metrics.whatsappChannels).toBe("number");
    expect(typeof overview.metrics.aiExecutions).toBe("number");
    expect(typeof overview.metrics.securityEvents).toBe("number");
  });

  it("7. retorna dados reais de runtime da API com métricas de Heap V8 e RSS sem mocks", async () => {
    const apiDiag = await getDiagnosticApi({ take: 10 });
    expect(apiDiag).toHaveProperty("runtime");
    expect(apiDiag.runtime?.readiness).toBe("OPERATIONAL");
    expect(typeof apiDiag.runtime?.uptimeSeconds).toBe("number");
    expect(typeof apiDiag.runtime?.heapUsedMb).toBe("number");
    expect(typeof apiDiag.runtime?.heapTotalMb).toBe("number");
    expect(typeof apiDiag.runtime?.heapLimitMb).toBe("number");
    expect(typeof apiDiag.runtime?.rssMb).toBe("number");
    expect(apiDiag).toHaveProperty("telemetry");
    expect(apiDiag).toHaveProperty("items");
  });

  it("8. retorna atividade e segurança com sanitização e metadados estruturados", async () => {
    const activity = await getDiagnosticActivity({ take: 10 });
    expect(activity).toHaveProperty("items");
    for (const item of activity.items) {
      expect(item).toHaveProperty("eventLabel");
      expect(item).toHaveProperty("actor");
      expect(item).toHaveProperty("tenantName");
      expect(item).toHaveProperty("ip");
    }

    const security = await getDiagnosticSecurity({ take: 10 });
    expect(security).toHaveProperty("items");
    for (const item of security.items) {
      expect(item).toHaveProperty("eventLabel");
      expect(["INFO", "WARNING", "DANGER"]).toContain(item.severity);
    }
  });
});
