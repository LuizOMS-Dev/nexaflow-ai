import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { sendMail } from "../services/security/mail";

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().default(""),
  companyName: z.string().trim().min(2).max(120),
  teamSize: z.enum(["1-2", "3-5", "6-15", "16-50", "51+"]).optional(),
  message: z.string().trim().max(1000).optional().default(""),
  // Honeypot: navegadores reais não preenchem este campo invisível.
  website: z.string().max(200).optional().default(""),
});

const salesLeadStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "SPAM"]),
});

function featureFlags(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function planHighlights(featuresValue: Prisma.JsonValue | null): string[] {
  const features = featureFlags(featuresValue);
  const items = ["Atendimento no WhatsApp", "CRM e contatos"];
  if (features.ai === true) items.push("Agentes de IA");
  if (features.automations === true) items.push("Automações");
  if (features.campaigns === true) items.push("Campanhas");
  if (features.reports === true) items.push("Relatórios");
  if (features.api === true) items.push("API");
  if (features.webhooks === true) items.push("Webhooks");
  return items.slice(0, 6);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[char] || char;
  });
}

export async function marketingRoutes(app: FastifyInstance) {
  app.get(
    "/public/plans",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
        select: {
          slug: true,
          name: true,
          description: true,
          priceMonthly: true,
          priceAnnual: true,
          priceOnRequest: true,
          maxUsers: true,
          maxChannels: true,
          maxContacts: true,
          maxAiMessages: true,
          badge: true,
          features: true,
        },
      });

      reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return {
        items: plans.map((plan) => ({
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          priceMonthly: Number(plan.priceMonthly),
          priceAnnual: plan.priceAnnual == null ? null : Number(plan.priceAnnual),
          priceOnRequest: plan.priceOnRequest,
          badge: plan.badge,
          limits: {
            users: plan.maxUsers,
            channels: plan.maxChannels,
            contacts: plan.maxContacts,
            aiMessages: plan.maxAiMessages,
          },
          highlights: planHighlights(plan.features),
        })),
      };
    }
  );

  app.post(
    "/public/demo-requests",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = demoRequestSchema.parse(request.body);

      // Bots recebem a mesma resposta para não aprenderem o mecanismo antispam.
      if (body.website) {
        return reply.status(202).send({ ok: true });
      }

      const lead = await prisma.salesLead.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          phone: body.phone || null,
          companyName: body.companyName,
          teamSize: body.teamSize || null,
          message: body.message || null,
        },
        select: { id: true, createdAt: true },
      });

      if (env.salesEmail) {
        const companyForSubject = body.companyName.replace(/\s+/g, " ").slice(0, 80);
        const lines = [
          `Novo pedido de demonstração NexaFlow`,
          `Nome: ${body.name}`,
          `Empresa: ${body.companyName}`,
          `E-mail: ${body.email}`,
          `Telefone: ${body.phone || "não informado"}`,
          `Equipe: ${body.teamSize || "não informado"}`,
          `Mensagem: ${body.message || "não informada"}`,
          `Lead: ${lead.id}`,
        ];
        const html = `<h2>Novo pedido de demonstração</h2><p><strong>Nome:</strong> ${escapeHtml(body.name)}</p><p><strong>Empresa:</strong> ${escapeHtml(body.companyName)}</p><p><strong>E-mail:</strong> ${escapeHtml(body.email)}</p><p><strong>Telefone:</strong> ${escapeHtml(body.phone || "não informado")}</p><p><strong>Equipe:</strong> ${escapeHtml(body.teamSize || "não informado")}</p><p><strong>Mensagem:</strong> ${escapeHtml(body.message || "não informada")}</p><p><strong>Lead:</strong> ${lead.id}</p>`;

        // A persistência do lead é a fonte de verdade; falha de e-mail não perde o contato.
        await sendMail({
          to: env.salesEmail,
          subject: `Pedido de demonstração — ${companyForSubject}`,
          text: lines.join("\n"),
          html,
          tags: ["sales-lead"],
        });
      }

      return reply.status(201).send({
        ok: true,
        message: "Pedido recebido. Nossa equipe entrará em contato.",
      });
    }
  );

  app.get(
    "/admin/sales-leads",
    { preHandler: app.requireSuperadmin },
    async () => {
      return prisma.salesLead.findMany({
        take: 200,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          companyName: true,
          teamSize: true,
          message: true,
          source: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }
  );

  app.patch(
    "/admin/sales-leads/:id",
    { preHandler: app.requireSuperadmin },
    async (request) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
      const { status } = salesLeadStatusSchema.parse(request.body);
      return prisma.salesLead.update({
        where: { id },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      });
    }
  );
}
