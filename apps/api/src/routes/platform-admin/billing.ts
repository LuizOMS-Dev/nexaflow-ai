import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getTenantBillingDetail,
  registerTenantPayment,
  cancelTenantSubscription,
} from "../../services/platform-admin/billing";

export async function adminBillingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  const billingHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = (tenantId || id) as string;
    return getTenantBillingDetail(tid);
  };

  app.get("/admin/tenants/:tenantId/billing", billingHandler);
  app.get("/admin/companies/:id/billing", billingHandler);

  const paymentHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = (tenantId || id) as string;
    const body = z
      .object({
        amount: z.number().positive("O valor deve ser positivo"),
        paidAt: z.string().datetime().optional(),
        referencePeriod: z.string().max(40).optional().nullable(),
        method: z.enum(["PIX", "TRANSFER", "BOLETO", "CARD", "CASH", "OTHER"]).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
        idempotencyKey: z.string().max(120).optional().nullable(),
        advanceDueDate: z.boolean().optional().default(true),
      })
      .parse(request.body);

    return registerTenantPayment(tid, body, { sub: request.user.sub, ip: request.ip });
  };

  app.post("/admin/tenants/:tenantId/payments", paymentHandler);
  app.post("/admin/companies/:id/payments", paymentHandler);

  const listPaymentsHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = (tenantId || id) as string;
    const data = await getTenantBillingDetail(tid);
    return { items: data.payments };
  };

  app.get("/admin/tenants/:tenantId/payments", listPaymentsHandler);
  app.get("/admin/companies/:id/payments", listPaymentsHandler);

  const cancelSubHandler = async (request: any) => {
    const { tenantId, id } = request.params as { tenantId?: string; id?: string };
    const tid = (tenantId || id) as string;
    const body = z
      .object({
        reason: z.string().max(500).optional(),
      })
      .parse(request.body || {});

    return cancelTenantSubscription(tid, body.reason, { sub: request.user.sub, ip: request.ip });
  };

  app.post("/admin/tenants/:tenantId/cancel-subscription", cancelSubHandler);
  app.post("/admin/companies/:id/cancel-subscription", cancelSubHandler);
}
