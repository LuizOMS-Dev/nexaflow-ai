import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listUsers,
  getUsersKpis,
  getUserDetail,
  updateUserStatus,
  revokeUserSessions,
  resetUserMfa,
  updateUserPlatformRole,
} from "../../services/platform-admin/users";

export async function adminUsersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  app.get("/admin/users/stats", async () => {
    return getUsersKpis();
  });

  app.get("/admin/users", async (request) => {
    const query = z
      .object({
        search: z.string().trim().max(200).optional(),
        scope: z.enum(["all", "companies", "platform"]).default("all"),
        status: z
          .enum(["ALL", "ACTIVE", "INVITED", "SUSPENDED", "DISABLED", "PENDING_VERIFICATION"])
          .optional(),
        role: z.enum(["ALL", "ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).optional(),
        tenantId: z.string().cuid().optional(),
        mfa: z.enum(["all", "enabled", "disabled"]).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(30),
      })
      .parse(request.query || {});

    return listUsers(query);
  });

  app.get("/admin/users/:id", async (request) => {
    const { id } = request.params as { id: string };
    return getUserDetail(id);
  });

  app.patch("/admin/users/:id/status", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]),
        reason: z.string().max(500).optional(),
      })
      .parse(request.body);

    return updateUserStatus(id, body, { sub: request.user.sub, ip: request.ip });
  });

  app.post("/admin/users/:id/revoke-sessions", async (request) => {
    const { id } = request.params as { id: string };
    return revokeUserSessions(id, { sub: request.user.sub, ip: request.ip });
  });

  app.post("/admin/users/:id/reset-mfa", async (request) => {
    const { id } = request.params as { id: string };
    return resetUserMfa(id, { sub: request.user.sub, ip: request.ip });
  });

  app.patch("/admin/users/:id/platform-role", async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        platformRole: z.enum(["SUPERADMIN"]).nullable(),
      })
      .parse(request.body);

    return updateUserPlatformRole(id, body, { sub: request.user.sub, ip: request.ip });
  });
}
