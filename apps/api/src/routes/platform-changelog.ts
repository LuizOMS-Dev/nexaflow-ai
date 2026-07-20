/**
 * Rotas de Novidades (tenant) + gestão de releases (superadmin).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  adminArchiveRelease,
  adminCreateRelease,
  adminDeleteRelease,
  adminDuplicateRelease,
  adminGetRelease,
  adminListReleases,
  adminPublishRelease,
  adminUnpublishRelease,
  adminUpdateRelease,
  countUnseenReleases,
  listPublishedReleases,
  markReleasesSeen,
} from "../services/platform-changelog";
import { audit } from "../services/audit";

const itemSchema = z.object({
  category: z.enum(["NEW", "IMPROVEMENT", "FIX", "SECURITY"]),
  body: z.string().min(1).max(500),
  sortOrder: z.number().int().optional(),
});

export async function platformChangelogRoutes(app: FastifyInstance) {
  // ——— Tenant / usuários autenticados ———
  app.get(
    "/changelog",
    { preHandler: [app.authenticate] },
    async (request) => {
      const isSuperadmin = request.user.platformRole === "SUPERADMIN";
      const items = await listPublishedReleases({
        userId: request.user.sub,
        isSuperadmin,
      });
      const unseen = await countUnseenReleases(request.user.sub, isSuperadmin);
      return { items, unseenCount: unseen };
    }
  );

  app.get(
    "/changelog/unseen-count",
    { preHandler: [app.authenticate] },
    async (request) => {
      const isSuperadmin = request.user.platformRole === "SUPERADMIN";
      const count = await countUnseenReleases(request.user.sub, isSuperadmin);
      return { count };
    }
  );

  app.post(
    "/changelog/seen",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = z
        .object({
          releaseIds: z.array(z.string()).optional(),
          all: z.boolean().optional(),
        })
        .parse(request.body || {});
      return markReleasesSeen({
        userId: request.user.sub,
        releaseIds: body.releaseIds,
        allPublished: body.all !== false && !body.releaseIds?.length,
      });
    }
  );

  // ——— Superadmin ———
  app.get(
    "/admin/changelog",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async () => {
      const items = await adminListReleases();
      return { items };
    }
  );

  app.get(
    "/admin/changelog/:id",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminGetRelease(id);
    }
  );

  app.post(
    "/admin/changelog",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const body = z
        .object({
          version: z.string().min(1).max(32),
          title: z.string().min(1).max(200),
          summary: z.string().max(2000).optional().nullable(),
          visibility: z.enum(["ALL", "SUPERADMIN"]).optional(),
          items: z.array(itemSchema).max(40).optional(),
        })
        .parse(request.body);

      const release = await adminCreateRelease({
        ...body,
        createdById: request.user.sub,
      });
      await audit({
        userId: request.user.sub,
        action: "changelog.created",
        entity: "platform_release",
        entityId: release.id,
        metadata: { version: release.version },
        ip: request.ip,
      });
      return release;
    }
  );

  app.patch(
    "/admin/changelog/:id",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          version: z.string().min(1).max(32).optional(),
          title: z.string().min(1).max(200).optional(),
          summary: z.string().max(2000).optional().nullable(),
          visibility: z.enum(["ALL", "SUPERADMIN"]).optional(),
          items: z.array(itemSchema).max(40).optional(),
        })
        .parse(request.body);

      const release = await adminUpdateRelease({ id, ...body });
      await audit({
        userId: request.user.sub,
        action: "changelog.updated",
        entity: "platform_release",
        entityId: id,
        metadata: { version: release.version },
        ip: request.ip,
      });
      return release;
    }
  );

  app.post(
    "/admin/changelog/:id/publish",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const release = await adminPublishRelease(id);
      await audit({
        userId: request.user.sub,
        action: "changelog.published",
        entity: "platform_release",
        entityId: id,
        metadata: {
          version: release.version,
          visibility: release.visibility,
          status: release.status,
          event: "platform.release.published",
        },
        ip: request.ip,
      });
      return release;
    }
  );

  app.post(
    "/admin/changelog/:id/unpublish",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminUnpublishRelease(id);
    }
  );

  app.post(
    "/admin/changelog/:id/archive",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const release = await adminArchiveRelease(id);
      await audit({
        userId: request.user.sub,
        action: "changelog.archived",
        entity: "platform_release",
        entityId: id,
        metadata: { version: release.version },
        ip: request.ip,
      });
      return release;
    }
  );

  app.post(
    "/admin/changelog/:id/duplicate",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminDuplicateRelease(id, request.user.sub);
    }
  );

  app.delete(
    "/admin/changelog/:id",
    { preHandler: [app.authenticate, app.requireSuperadmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      return adminDeleteRelease(id);
    }
  );
}
