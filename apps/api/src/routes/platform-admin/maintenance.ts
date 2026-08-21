import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  getMaintenanceState,
  setGlobalMaintenanceState,
  setSectionMaintenanceState,
  getPublicMaintenanceStatus,
} from "../../services/maintenance";
import { ALL_SECTIONS, TenantSection } from "../../services/maintenance-sections";
import type { JwtUser } from "../../plugins/auth";

export async function adminMaintenanceRoutes(app: FastifyInstance) {
  // Leitura completa de manutenção (global + 14 seções) para o Superadmin
  app.get(
    "/admin/system/maintenance",
    { preHandler: [app.requireSuperadmin] },
    async () => {
      const state = await getMaintenanceState();
      return state;
    }
  );

  // Alteração do modo global pelo Superadmin
  app.post(
    "/admin/system/maintenance/global",
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

      const updated = await setGlobalMaintenanceState(body, user);
      return reply.send({ ok: true, state: updated });
    }
  );

  // Alteração de uma seção específica pelo Superadmin
  app.post(
    "/admin/system/maintenance/section",
    { preHandler: [app.requireSuperadmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodySchema = z.object({
        section: z.enum(ALL_SECTIONS as [TenantSection, ...TenantSection[]]),
        enabled: z.boolean(),
        title: z.string().min(1).max(200).optional(),
        message: z.string().min(1).max(2000).optional(),
        estimatedEnd: z.string().nullable().optional(),
        internalReason: z.string().max(2000).nullable().optional(),
      });

      const body = bodySchema.parse(request.body);
      const user = request.user as JwtUser;

      const updated = await setSectionMaintenanceState(
        body.section,
        {
          enabled: body.enabled,
          title: body.title,
          message: body.message,
          estimatedEnd: body.estimatedEnd,
          internalReason: body.internalReason,
        },
        user
      );
      return reply.send({ ok: true, state: updated });
    }
  );

  // Endpoint legado de compatibilidade
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

      const updated = await setGlobalMaintenanceState(body, user);
      return reply.send({ ok: true, state: updated });
    }
  );
}

export async function publicMaintenanceRoutes(app: FastifyInstance) {
  // Status público (global + seções, sem dados confidenciais)
  app.get("/system/maintenance/status", async () => {
    return getPublicMaintenanceStatus();
  });
}
