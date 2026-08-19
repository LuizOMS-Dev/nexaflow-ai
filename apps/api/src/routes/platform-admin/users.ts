import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRecentAuthentication } from "../../services/security/step-up";
import {
  listUsers,
  getUsersKpis,
  getUserDetail,
  updateUserStatus,
  revokeUserSessions,
  resetUserMfa,
  updateUserPlatformRole,
  provisionCompanyUser,
  provisionPlatformAdmin,
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

  app.post(
    "/admin/users",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request) => {
      const body = z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("company"),
            name: z.string().trim().min(2).max(120),
            email: z.string().email(),
            tenantId: z.string().cuid(),
            role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).optional(),
            accessMethod: z.enum(["invite", "temporary_password"]).optional().default("invite"),
            temporaryPassword: z.string().max(128).optional(),
          }),
          z.object({
            kind: z.literal("platform"),
            name: z.string().trim().min(2).max(120),
            email: z.string().email(),
            accessMethod: z.enum(["invite", "temporary_password"]).optional().default("invite"),
            temporaryPassword: z.string().max(128).optional(),
          }),
        ])
        .parse(request.body);

      const actor = { sub: request.user.sub, ip: request.ip };
      if (body.kind === "company") {
        return provisionCompanyUser(
          {
            name: body.name,
            email: body.email,
            tenantId: body.tenantId,
            role: body.role,
            accessMethod: body.accessMethod,
            temporaryPassword: body.temporaryPassword,
          },
          actor
        );
      }
      await requireRecentAuthentication(request.user, { action: "grant_superadmin" });
      return provisionPlatformAdmin(
        {
          name: body.name,
          email: body.email,
          accessMethod: body.accessMethod,
          temporaryPassword: body.temporaryPassword,
        },
        actor
      );
    }
  );

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
