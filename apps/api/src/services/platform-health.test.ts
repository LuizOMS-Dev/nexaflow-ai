import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateOverallPlatformStatus,
  getPlatformHealth,
  type ServiceHealthResult,
} from "./platform-health";

describe("Platform Health Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateOverallPlatformStatus (Matriz de Status Global)", () => {
    it("1. retorna 'operational' quando todos os serviços críticos estão operacionais e opcionais estão degradados ou não configurados", () => {
      const services: ServiceHealthResult[] = [
        {
          id: "api",
          name: "API",
          criticality: "CRITICAL",
          status: "operational",
          impact: "Core",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "postgres",
          name: "PostgreSQL",
          criticality: "CRITICAL",
          status: "operational",
          impact: "DB",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "redis",
          name: "Redis",
          criticality: "CRITICAL",
          status: "operational",
          impact: "Cache",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "whatsapp",
          name: "WhatsApp Gateway",
          criticality: "OPTIONAL",
          status: "degraded",
          impact: "WA",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "ai",
          name: "Provider de IA",
          criticality: "OPTIONAL",
          status: "not_configured",
          impact: "AI",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "mail",
          name: "E-mail",
          criticality: "OPTIONAL",
          status: "not_configured",
          impact: "Mail",
          checkedAt: new Date().toISOString(),
        },
      ];

      const overall = calculateOverallPlatformStatus(services);
      expect(overall).toBe("operational");
    });

    it("2. retorna 'down' se qualquer serviço CRÍTICO estiver down", () => {
      const services: ServiceHealthResult[] = [
        {
          id: "api",
          name: "API",
          criticality: "CRITICAL",
          status: "operational",
          impact: "Core",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "postgres",
          name: "PostgreSQL",
          criticality: "CRITICAL",
          status: "down",
          impact: "DB",
          checkedAt: new Date().toISOString(),
        },
      ];

      const overall = calculateOverallPlatformStatus(services);
      expect(overall).toBe("down");
    });

    it("3. retorna 'degraded' se qualquer serviço CRÍTICO estiver degraded", () => {
      const services: ServiceHealthResult[] = [
        {
          id: "api",
          name: "API",
          criticality: "CRITICAL",
          status: "operational",
          impact: "Core",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "postgres",
          name: "PostgreSQL",
          criticality: "CRITICAL",
          status: "degraded",
          impact: "DB",
          checkedAt: new Date().toISOString(),
        },
      ];

      const overall = calculateOverallPlatformStatus(services);
      expect(overall).toBe("degraded");
    });

    it("4. serviços opcionais não configurados não degradam a plataforma", () => {
      const services: ServiceHealthResult[] = [
        {
          id: "api",
          name: "API",
          criticality: "CRITICAL",
          status: "operational",
          impact: "Core",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "postgres",
          name: "PostgreSQL",
          criticality: "CRITICAL",
          status: "operational",
          impact: "DB",
          checkedAt: new Date().toISOString(),
        },
        {
          id: "ai",
          name: "Provider de IA",
          criticality: "OPTIONAL",
          status: "not_configured",
          impact: "AI",
          checkedAt: new Date().toISOString(),
        },
      ];

      const overall = calculateOverallPlatformStatus(services);
      expect(overall).toBe("operational");
    });
  });

  describe("getPlatformHealth execution & DTO", () => {
    it("returns a complete and safe PlatformHealthDTO with 0 exposed secrets", async () => {
      const health = await getPlatformHealth();

      expect(health).toHaveProperty("overall");
      expect(["operational", "degraded", "down"]).toContain(health.overall);
      expect(health).toHaveProperty("checkedAt");
      expect(health).toHaveProperty("env");
      expect(health).toHaveProperty("summary");
      expect(health).toHaveProperty("services");
      expect(health).toHaveProperty("dependencies");

      expect(health.services.length).toBeGreaterThanOrEqual(5);

      // Verify no sensitive tokens or passwords leaked
      const stringified = JSON.stringify(health);
      expect(stringified).not.toContain("password");
      expect(stringified).not.toContain("secret");
      expect(stringified).not.toContain("postgres://");
      expect(stringified).not.toContain("postgresql://");
      expect(stringified).not.toContain("redis://");
      expect(stringified).not.toContain("gsk_");
      expect(stringified).not.toContain("re_");

      // Verify summary matches services
      const totalServices = health.services.length;
      expect(health.summary.total).toBe(totalServices);
      expect(
        health.summary.operational +
          health.summary.degraded +
          health.summary.down +
          health.summary.notConfigured
      ).toBe(totalServices);
    });
  });
});
