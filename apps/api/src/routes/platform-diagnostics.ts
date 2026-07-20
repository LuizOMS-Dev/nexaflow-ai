/**
 * Logs / diagnóstico / saúde — somente Superadmin.
 * Reutiliza AuditLog, Webhooks, AI usage, API usage, Channels, /health checks.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getDiagnosticActivity,
  getDiagnosticAi,
  getDiagnosticApi,
  getDiagnosticSecurity,
  getDiagnosticsOverview,
  getDiagnosticWebhooks,
  getDiagnosticWhatsApp,
  getPlatformHealthDetailed,
} from "../services/platform-diagnostics";
export async function platformDiagnosticsRoutes(app: FastifyInstance) {
  app.get(
    "/admin/diagnostics/overview",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => getDiagnosticsOverview()
  );

  app.get(
    "/admin/diagnostics/activity",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(100).optional(),
          cursor: z.string().optional(),
          tenantId: z.string().optional(),
          q: z.string().max(120).optional(),
        })
        .parse(request.query || {});
      return getDiagnosticActivity(q);
    }
  );

  app.get(
    "/admin/diagnostics/webhooks",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(100).optional(),
          tenantId: z.string().optional(),
        })
        .parse(request.query || {});
      return getDiagnosticWebhooks(q);
    }
  );

  app.get(
    "/admin/diagnostics/whatsapp",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => getDiagnosticWhatsApp()
  );

  app.get(
    "/admin/diagnostics/ai",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(100).optional(),
          tenantId: z.string().optional(),
        })
        .parse(request.query || {});
      return getDiagnosticAi(q);
    }
  );

  /** Uso real Groq + telemetria agregada (probe opcional) */
  app.get(
    "/admin/diagnostics/ai/usage",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          probe: z
            .enum(["0", "1", "true", "false"])
            .optional()
            .transform((v) => v === "1" || v === "true"),
          take: z.coerce.number().int().min(1).max(100).optional(),
          tenantId: z.string().optional(),
        })
        .parse(request.query || {});
      const data = await getDiagnosticAi({ take: q.take ?? 50, tenantId: q.tenantId });
      if (q.probe === false) {
        return { ...data, groqLive: { ...data.groqLive, message: "Probe desligado (probe=0)." } };
      }
      return data;
    }
  );

  app.get(
    "/admin/diagnostics/api",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(100).optional(),
          tenantId: z.string().optional(),
        })
        .parse(request.query || {});
      return getDiagnosticApi(q);
    }
  );

  app.get(
    "/admin/diagnostics/security",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(100).optional(),
        })
        .parse(request.query || {});
      return getDiagnosticSecurity(q);
    }
  );

  app.get(
    "/admin/platform-health",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => getPlatformHealthDetailed()
  );
}
