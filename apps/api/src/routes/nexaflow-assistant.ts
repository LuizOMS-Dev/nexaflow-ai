/**
 * Rotas do Assistente NexaFlow (ajuda da plataforma).
 * Auth: sessão + tenant. Qualquer membro ativo pode usar (não exige ai.manage).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { permissionsForRole } from "../services/security/permissions";
import {
  chatWithNexaflowAssistant,
  getAssistantBootstrap,
  setMessageFeedback,
  ensureHelpKnowledgeSeeded,
  startNewAssistantThread,
  listAssistantThreads,
  getAssistantThread,
  deleteAssistantThread,
  deleteAllAssistantThreads,
} from "../services/nexaflow-assistant";
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export async function nexaflowAssistantRoutes(app: FastifyInstance) {
  // Bootstrap: contexto + sugestões + histórico curto
  app.get(
    "/assistant/bootstrap",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      const q = z
        .object({ path: z.string().max(300).optional() })
        .parse(request.query || {});
      const user = request.user;
      const role = user.role as Parameters<typeof permissionsForRole>[0];
      return getAssistantBootstrap({
        userId: user.sub,
        tenantId: user.tenantId!,
        role,
        platformRole: user.platformRole,
        impersonating: Boolean(user.imp),
        currentPath: q.path,
      });
    }
  );

  app.post(
    "/assistant/chat",
    {
      preHandler: [app.authenticate, app.requireTenant],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const body = z
        .object({
          message: z.string().min(1).max(2000),
          threadId: z.string().optional().nullable(),
          path: z.string().max(300).optional().nullable(),
        })
        .parse(request.body);

      const user = request.user;
      const role = user.role as Parameters<typeof permissionsForRole>[0];
      const permissions = permissionsForRole(role, user.platformRole, {
        impersonating: Boolean(user.imp),
      });

      try {
        return await chatWithNexaflowAssistant({
          userId: user.sub,
          tenantId: user.tenantId!,
          role,
          platformRole: user.platformRole,
          impersonating: Boolean(user.imp),
          message: body.message,
          threadId: body.threadId,
          currentPath: body.path,
          permissions,
        });
      } catch (e) {
        if (e instanceof AppError) throw e;
        console.error("[assistant/chat]", e);
        throw new AppError("Não foi possível responder agora.", 502, "ASSISTANT_ERROR");
      }
    }
  );

  app.post(
    "/assistant/feedback",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      const body = z
        .object({
          messageId: z.string().min(1),
          feedback: z.enum(["up", "down"]),
        })
        .parse(request.body);
      return setMessageFeedback({
        userId: request.user.sub,
        messageId: body.messageId,
        feedback: body.feedback,
      });
    }
  );

  app.post(
    "/assistant/new-thread",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      return startNewAssistantThread({
        userId: request.user.sub,
        tenantId: request.user.tenantId!,
      });
    }
  );

  app.get(
    "/assistant/threads",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      const q = z
        .object({
          take: z.coerce.number().int().min(1).max(50).optional(),
          cursor: z.string().optional(),
        })
        .parse(request.query || {});
      return listAssistantThreads({
        userId: request.user.sub,
        tenantId: request.user.tenantId!,
        take: q.take,
        cursor: q.cursor,
      });
    }
  );

  app.get(
    "/assistant/threads/:id",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getAssistantThread({
        userId: request.user.sub,
        tenantId: request.user.tenantId!,
        threadId: id,
      });
    }
  );

  app.delete(
    "/assistant/threads/:id",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteAssistantThread({
        userId: request.user.sub,
        tenantId: request.user.tenantId!,
        threadId: id,
      });
    }
  );

  app.delete(
    "/assistant/threads",
    { preHandler: [app.authenticate, app.requireTenant] },
    async (request) => {
      return deleteAllAssistantThreads({
        userId: request.user.sub,
        tenantId: request.user.tenantId!,
      });
    }
  );

  // Superadmin: listar help knowledge
  app.get(
    "/admin/assistant/help-knowledge",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => {
      await ensureHelpKnowledgeSeeded();
      const docs = await prisma.helpKnowledgeDoc.findMany({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      });
      return { items: docs };
    }
  );

  app.patch(
    "/admin/assistant/help-knowledge/:id",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          title: z.string().min(1).max(200).optional(),
          content: z.string().min(1).optional(),
          category: z.string().optional().nullable(),
          status: z.enum(["draft", "published", "archived"]).optional(),
          sortOrder: z.number().int().optional(),
        })
        .parse(request.body);
      const doc = await prisma.helpKnowledgeDoc.update({
        where: { id },
        data: {
          title: body.title,
          content: body.content,
          category: body.category === undefined ? undefined : body.category,
          status: body.status,
          sortOrder: body.sortOrder,
        },
      });
      return doc;
    }
  );

  app.post(
    "/admin/assistant/help-knowledge",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const body = z
        .object({
          title: z.string().min(1).max(200),
          content: z.string().min(1),
          category: z.string().optional().nullable(),
          status: z.enum(["draft", "published", "archived"]).default("draft"),
          sortOrder: z.number().int().optional(),
        })
        .parse(request.body);
      return prisma.helpKnowledgeDoc.create({
        data: {
          title: body.title,
          content: body.content,
          category: body.category || null,
          status: body.status,
          sortOrder: body.sortOrder ?? 100,
          source: "manual",
        },
      });
    }
  );

  app.get(
    "/admin/assistant/gaps",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => {
      const items = await prisma.helpKnowledgeGap.findMany({
        orderBy: [{ count: "desc" }, { lastSeenAt: "desc" }],
        take: 100,
      });
      return { items };
    }
  );

  app.get(
    "/admin/assistant/settings",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => {
      const enabled = await prisma.platformSetting.findUnique({
        where: { key: "nexaflow.assistant.enabled" },
      });
      const support = await prisma.platformSetting.findUnique({
        where: { key: "nexaflow.support.email" },
      });
      return {
        enabled:
          enabled?.value === false ||
          (enabled?.value &&
            typeof enabled.value === "object" &&
            (enabled.value as { enabled?: boolean }).enabled === false)
            ? false
            : true,
        supportEmail:
          typeof support?.value === "string"
            ? support.value
            : (support?.value as { email?: string } | null)?.email || null,
      };
    }
  );

  app.put(
    "/admin/assistant/settings",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const body = z
        .object({
          enabled: z.boolean().optional(),
          supportEmail: z.string().email().optional().nullable(),
        })
        .parse(request.body);

      if (body.enabled !== undefined) {
        await prisma.platformSetting.upsert({
          where: { key: "nexaflow.assistant.enabled" },
          create: {
            key: "nexaflow.assistant.enabled",
            value: asInputJson({ enabled: body.enabled }),
          },
          update: { value: asInputJson({ enabled: body.enabled }) },
        });
      }
      if (body.supportEmail !== undefined) {
        if (body.supportEmail) {
          await prisma.platformSetting.upsert({
            where: { key: "nexaflow.support.email" },
            create: {
              key: "nexaflow.support.email",
              value: asInputJson({ email: body.supportEmail }),
            },
            update: { value: asInputJson({ email: body.supportEmail }) },
          });
        } else {
          await prisma.platformSetting.deleteMany({
            where: { key: "nexaflow.support.email" },
          });
        }
      }
      return { ok: true };
    }
  );
}
