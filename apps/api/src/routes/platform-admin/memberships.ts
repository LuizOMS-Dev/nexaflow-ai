import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listTenantMembers,
  addTenantMember,
  updateTenantMemberRole,
  toggleTenantMemberStatus,
  removeTenantMember,
} from "../../services/platform-admin/memberships";

export async function adminMembershipsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  const listHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = tenantId || id;
    return listTenantMembers(tid as string);
  };

  app.get("/admin/tenants/:tenantId/members", listHandler);
  app.get("/admin/companies/:id/members", listHandler);

  const addHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = (tenantId || id) as string;
    const body = z
      .object({
        userId: z.string().optional(),
        email: z.string().email().optional(),
        name: z.string().trim().min(2).max(120).optional(),
        role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).optional(),
      })
      .parse(request.body);

    return addTenantMember(tid, body, { sub: request.user.sub, ip: request.ip });
  };

  app.post("/admin/tenants/:tenantId/members", addHandler);
  app.post("/admin/companies/:id/members", addHandler);

  const updateHandler = async (request: any) => {
    const { tenantId, id, membershipId } = request.params as {
      tenantId?: string;
      id?: string;
      membershipId: string;
    };
    const tid = (tenantId || id) as string;

    const body = z
      .object({
        role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).optional(),
        status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(request.body);

    if (body.role) {
      await updateTenantMemberRole(tid, membershipId, body.role, {
        sub: request.user.sub,
        ip: request.ip,
      });
    }

    if (body.status || body.isActive !== undefined) {
      const targetStatus = body.status || (body.isActive === false ? "SUSPENDED" : "ACTIVE");
      return toggleTenantMemberStatus(tid, membershipId, targetStatus, {
        sub: request.user.sub,
        ip: request.ip,
      });
    }

    // Retorna lista atualizada
    return listTenantMembers(tid);
  };

  app.patch("/admin/tenants/:tenantId/members/:membershipId", updateHandler);
  app.patch("/admin/companies/:id/members/:membershipId", updateHandler);

  const deleteHandler = async (request: any) => {
    const { tenantId, id, membershipId } = request.params as {
      tenantId?: string;
      id?: string;
      membershipId: string;
    };
    const tid = (tenantId || id) as string;

    return removeTenantMember(tid, membershipId, { sub: request.user.sub, ip: request.ip });
  };

  app.delete("/admin/tenants/:tenantId/members/:membershipId", deleteHandler);
  app.delete("/admin/companies/:id/members/:membershipId", deleteHandler);
}
