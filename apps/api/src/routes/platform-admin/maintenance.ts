import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  getMaintenanceState,
  setMaintenanceState,
  getPublicMaintenanceStatus,
} from "../../services/maintenance";
import type { JwtUser } from "../../plugins/auth";

export async function adminMaintenanceRoutes(app: FastifyInstance) {
  // Leitura completa de manutenção para o Superadmin
  app.get(
    "/admin/system/maintenance",
    { preHandler: [app.requireSuperadmin] },
    async () => {
      const state = await getMaintenanceState();
      return state;
    }
  );

  // Alteração do estado de manutenção pelo Superadmin
  app.post(
    "/admin/system/maintenance",
    { preHandler: [app.requireSuperadmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        enabled: z.boolean(),
        title: z.string().min(1).max(200).optional(),
        message: z.string().min(1).max(2000).optional(),
        estimatedEnd: z.string().nullable().optional(),
        internalReason: z.string().max(2000).nullable().optional(),
      });

      const body = bodySchema.parse(request.body);
      const user = request.user as JwtUser;

      const updated = await setMaintenanceState(body, user);
      return reply.send({ ok: true, state: updated });
    }
  );
}

export async function publicMaintenanceRoutes(app: FastifyInstance) {
  // Status público (sem dados sensíveis)
  app.get("/system/maintenance/status", async () => {
    return getPublicMaintenanceStatus();
  });
}
