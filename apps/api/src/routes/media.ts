import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createReadStream } from "fs";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import {
  saveMediaBuffer,
  resolveMediaFilePath,
  deleteMediaFile,
  classifyFile,
  type MediaKind,
} from "../services/storage/media-storage";

export async function mediaRoutes(app: FastifyInstance) {
  // Endpoint de download/streaming de arquivos do tenant
  app.get(
    "/media/files/:tenantId/:filename",
    async (
      request: FastifyRequest<{ Params: { tenantId: string; filename: string } }>,
      reply: FastifyReply
    ) => {
      const { tenantId, filename } = request.params;
      if (!tenantId || !filename) {
        throw new AppError("Parâmetros inválidos", 400);
      }

      const { absPath, exists } = await resolveMediaFilePath(tenantId, filename);
      if (!exists) {
        throw new AppError("Arquivo não encontrado", 404);
      }

      const classification = classifyFile("", filename);
      reply.header("Content-Type", classification.mime);
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Cache-Control", "public, max-age=604800, immutable");

      const stream = createReadStream(absPath);
      return reply.send(stream);
    }
  );

  // Rotas autenticadas por tenant
  app.register(async (tenantScope) => {
    tenantScope.addHook("preHandler", tenantScope.requireTenant);

    /**
     * Upload de arquivo (multipart ou json base64)
     */
    tenantScope.post(
      "/media/upload",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = request.user.tenantId!;

        // Caso 1: Multipart file upload
        if (request.isMultipart()) {
          const file = await request.file();
          if (!file) {
            throw new AppError("Nenhum arquivo enviado", 400);
          }
          const buf = await file.toBuffer();
          const isVoice = file.fields?.isVoice
            ? String((file.fields.isVoice as { value?: unknown }).value || "") === "true"
            : false;

          const stored = await saveMediaBuffer({
            tenantId,
            buffer: buf,
            originalName: file.filename,
            mimetype: file.mimetype,
            isVoice,
          });

          return reply.status(201).send(stored);
        }

        // Caso 2: JSON base64 upload
        const bodySchema = z.object({
          filename: z.string().min(1).max(255),
          mimetype: z.string().min(1).max(100),
          dataBase64: z.string().min(1),
          isVoice: z.boolean().optional(),
        });

        const parsed = bodySchema.parse(request.body);
        const buf = Buffer.from(parsed.dataBase64, "base64");
        if (!buf.length) {
          throw new AppError("Dados do arquivo inválidos ou vazios", 400);
        }

        const stored = await saveMediaBuffer({
          tenantId,
          buffer: buf,
          originalName: parsed.filename,
          mimetype: parsed.mimetype,
          isVoice: parsed.isVoice,
        });

        return reply.status(201).send(stored);
      }
    );

    /**
     * Listar ativos da Biblioteca de Mídia (AgentMediaAsset)
     */
    tenantScope.get("/media/assets", async (request: FastifyRequest) => {
      const tenantId = request.user.tenantId!;
      const q = z
        .object({
          agentId: z.string().optional(),
          type: z.string().optional(),
          permissionMode: z.string().optional(),
          activeOnly: z.coerce.boolean().optional().default(true),
        })
        .parse(request.query);

      const where: Record<string, unknown> = { tenantId };
      if (q.agentId) where.agentId = q.agentId;
      if (q.type) where.type = q.type;
      if (q.permissionMode) where.permissionMode = q.permissionMode;
      if (q.activeOnly) where.isActive = true;

      const assets = await prisma.agentMediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return { items: assets, total: assets.length };
    });

    /**
     * Cadastrar novo ativo na Biblioteca de Mídia
     */
    tenantScope.post(
      "/media/assets",
      { preHandler: [tenantScope.requirePermission("ai.manage")] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = request.user.tenantId!;
        const body = z
          .object({
            agentId: z.string().optional(),
            name: z.string().min(1).max(200),
            description: z.string().max(1000).optional(),
            type: z.enum(["IMAGE", "PDF", "DOCUMENT", "AUDIO", "VOICE", "VIDEO", "FILE"]).default("FILE"),
            mimetype: z.string().min(1),
            filename: z.string().min(1),
            sizeBytes: z.number().int().min(0).default(0),
            url: z.string().min(1),
            storageKey: z.string().optional(),
            tags: z.array(z.string()).default([]),
            permissionMode: z.enum(["AUTO_ALLOWED", "APPROVAL_REQUIRED", "DISABLED"]).default("AUTO_ALLOWED"),
          })
          .parse(request.body);

        const asset = await prisma.agentMediaAsset.create({
          data: {
            tenantId,
            agentId: body.agentId || null,
            name: body.name,
            description: body.description || null,
            type: body.type,
            mimetype: body.mimetype,
            filename: body.filename,
            sizeBytes: body.sizeBytes,
            url: body.url,
            storageKey: body.storageKey || null,
            tags: body.tags,
            permissionMode: body.permissionMode,
          },
        });

        const { AuditService } = await import("../services/audit");
        void AuditService.record({
          action: "ai.media.asset_created",
          tenantId,
          userId: request.user.sub,
          entity: "AgentMediaAsset",
          entityId: asset.id,
          metadata: {
            name: asset.name,
            type: asset.type,
            permissionMode: asset.permissionMode,
          },
        }).catch(() => null);

        return reply.status(201).send(asset);
      }
    );

    /**
     * Atualizar ativo da Biblioteca de Mídia
     */
    tenantScope.patch(
      "/media/assets/:id",
      { preHandler: [tenantScope.requirePermission("ai.manage")] },
      async (request: FastifyRequest) => {
        const tenantId = request.user.tenantId!;
        const { id } = request.params as { id: string };

        const asset = assertFound(
          await prisma.agentMediaAsset.findFirst({
            where: { id, tenantId },
          })
        );

        const body = z
          .object({
            name: z.string().min(1).max(200).optional(),
            description: z.string().max(1000).optional(),
            permissionMode: z.enum(["AUTO_ALLOWED", "APPROVAL_REQUIRED", "DISABLED"]).optional(),
            tags: z.array(z.string()).optional(),
            isActive: z.boolean().optional(),
          })
          .parse(request.body);

        const updated = await prisma.agentMediaAsset.update({
          where: { id: asset.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.permissionMode !== undefined ? { permissionMode: body.permissionMode } : {}),
            ...(body.tags !== undefined ? { tags: body.tags } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          },
        });

        return updated;
      }
    );

    /**
     * Excluir ativo da Biblioteca de Mídia
     */
    tenantScope.delete(
      "/media/assets/:id",
      { preHandler: [tenantScope.requirePermission("ai.manage")] },
      async (request: FastifyRequest) => {
        const tenantId = request.user.tenantId!;
        const { id } = request.params as { id: string };

        const asset = assertFound(
          await prisma.agentMediaAsset.findFirst({
            where: { id, tenantId },
          })
        );

        await prisma.agentMediaAsset.delete({
          where: { id: asset.id },
        });

        if (asset.filename) {
          await deleteMediaFile(tenantId, asset.filename);
        }

        return { ok: true, id: asset.id };
      }
    );
  });
}
