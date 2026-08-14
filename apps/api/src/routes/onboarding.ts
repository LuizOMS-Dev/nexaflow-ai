import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors";
import { hasPermission } from "../services/security/permissions";
import {
  completeCompanyOnboarding,
  completeCompanySchema,
  getCompanyOnboarding,
} from "../services/onboarding/company-onboarding";

export async function onboardingRoutes(app: FastifyInstance) {
  app.get("/onboarding/company", { preHandler: [app.requireTenant] }, async (request) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) throw new AppError("Empresa não selecionada", 400, "TENANT_REQUIRED");
    const canComplete = hasPermission(
      request.user.role,
      request.user.platformRole,
      "onboarding.complete",
      { impersonating: Boolean((request.user as { imp?: boolean }).imp) }
    );
    return getCompanyOnboarding(tenantId, canComplete);
  });

  app.post(
    "/onboarding/company",
    {
      preHandler: [app.requireTenant, app.requirePermission("onboarding.complete")],
      config: { rateLimit: { max: 12, timeWindow: "10 minutes" } },
    },
    async (request) => {
      const tenantId = request.user.tenantId;
      if (!tenantId) throw new AppError("Empresa não selecionada", 400, "TENANT_REQUIRED");
      const input = completeCompanySchema.parse(request.body);
      return completeCompanyOnboarding({
        tenantId,
        userId: request.user.sub,
        input,
        ip: request.ip,
      });
    }
  );
}
