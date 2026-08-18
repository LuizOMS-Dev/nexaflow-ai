import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listCompanies,
  getCompanyOverview,
  createCompany,
  updateCompanyProfile,
  updateTenantStatus,
  requestCompanyDeletion,
} from "../../services/platform-admin/companies";

export async function adminTenantsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  const listHandler = async (request: any) => {
    const query = z
      .object({
        search: z.string().trim().max(200).optional(),
        status: z.enum(["ALL", "ACTIVE", "TRIAL", "BLOCKED", "SUSPENDED", "CANCELLED", "PENDING_DELETION"]).optional(),
        financial: z
          .enum([
            "ALL",
            "IN_GOOD_STANDING",
            "DUE_TODAY",
            "DUE_SOON",
            "OVERDUE",
            "PAYMENT_PENDING",
            "TRIAL",
            "CANCELLED",
            "SUSPENDED",
            "NEEDS_ATTENTION",
          ])
          .optional(),
        planId: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(20),
      })
      .parse(request.query || {});

    return listCompanies(query as any);
  };

  app.get("/admin/tenants", listHandler);
  app.get("/admin/companies", listHandler);

  const createHandler = async (request: any) => {
    const body = z
      .object({
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(120),
        slug: z.string().optional(),
        planId: z.string().optional(),
        adminEmail: z.string().email("E-mail inválido"),
        adminName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        adminPassword: z.string().min(8, "Senha deve ter pelo menos 8 caracteres").optional(),
        forceSimilarName: z.boolean().optional(),
        legalName: z.string().max(160).optional(),
        tradeName: z.string().max(160).optional(),
        cnpj: z.string().max(30).optional(),
        phone: z.string().max(40).optional(),
        segment: z.string().max(80).optional(),
        city: z.string().max(80).optional(),
        state: z.string().max(40).optional(),
        website: z.string().max(200).optional(),
      })
      .parse(request.body);

    return createCompany(body, { sub: request.user.sub, ip: request.ip });
  };

  app.post("/admin/tenants", createHandler);
  app.post("/admin/companies", createHandler);

  const detailHandler = async (request: any) => {
    const { id } = request.params as { id: string };
    return getCompanyOverview(id);
  };

  app.get("/admin/tenants/:id", detailHandler);
  app.get("/admin/tenants/:id/overview", detailHandler);
  app.get("/admin/companies/:id", detailHandler);

  const profileHandler = async (request: any) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        legalName: z.string().max(160).optional().nullable(),
        tradeName: z.string().max(160).optional().nullable(),
        cnpj: z.string().max(30).optional().nullable(),
        email: z.string().email().optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        website: z.string().max(200).optional().nullable(),
        segment: z.string().max(80).optional().nullable(),
        city: z.string().max(80).optional().nullable(),
        state: z.string().max(40).optional().nullable(),
        timezone: z.string().max(60).optional().nullable(),
        language: z.string().max(20).optional().nullable(),
      })
      .parse(request.body);

    return updateCompanyProfile(id, body, { sub: request.user.sub, ip: request.ip });
  };

  app.patch("/admin/tenants/:id/profile", profileHandler);
  app.patch("/admin/companies/:id/profile", profileHandler);

  const statusHandler = async (request: any) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED"]),
        reason: z.string().max(500).optional(),
      })
      .parse(request.body);

    return updateTenantStatus(id, body, { sub: request.user.sub, ip: request.ip });
  };

  app.patch("/admin/tenants/:id/status", statusHandler);
  app.patch("/admin/companies/:id/status", statusHandler);

  const deletionHandler = async (request: any) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        confirmName: z.string().min(1, "Confirmação de nome obrigatória"),
        reason: z.string().max(500).optional(),
      })
      .parse(request.body);

    return requestCompanyDeletion(id, body, { sub: request.user.sub, ip: request.ip });
  };

  app.post("/admin/tenants/:id/request-deletion", deletionHandler);
  app.post("/admin/companies/:id/request-deletion", deletionHandler);

  // Backward compatibility DELETE endpoints -> direciona para requestCompanyDeletion
  app.delete("/admin/tenants/:id", deletionHandler);
  app.delete("/admin/companies/:id", deletionHandler);
}
