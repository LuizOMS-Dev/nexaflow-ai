import type { FastifyInstance } from "fastify";
import { adminUsersRoutes } from "./users";
import { adminTenantsRoutes } from "./tenants";
import { adminMembershipsRoutes } from "./memberships";
import { adminBillingRoutes } from "./billing";
import { adminImpersonationRoutes } from "./impersonation";

export async function platformAdminRoutes(app: FastifyInstance) {
  await app.register(adminUsersRoutes);
  await app.register(adminTenantsRoutes);
  await app.register(adminMembershipsRoutes);
  await app.register(adminBillingRoutes);
  await app.register(adminImpersonationRoutes);
}
