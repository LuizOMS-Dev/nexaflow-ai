import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { broadcastToTenant } from "../ws/hub";
import { audit } from "../services/audit";
import { ingestInboundMessage } from "../services/whatsapp";

export async function miscRoutes(app: FastifyInstance) {
  // Tags
  app.get("/tags", { preHandler: [app.requireTenant, app.requirePermission("contacts.read")] }, async (request) => {
    return prisma.tag.findMany({
      where: { tenantId: request.user.tenantId! },
      orderBy: { name: "asc" },
    });
  });

  app.post("/tags", { preHandler: [app.requireTenant, app.requirePermission("contacts.update")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const body = z.object({ name: z.string().min(1), color: z.string().default("#6366f1") }).parse(request.body);
    return prisma.tag.create({
      data: { tenantId: request.user.tenantId!, name: body.name, color: body.color },
    });
  });

  app.delete("/tags/:id", { preHandler: [app.requireTenant, app.requirePermission("contacts.update")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    assertFound(await prisma.tag.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    await prisma.tag.delete({ where: { id } });
    return { ok: true };
  });

  // Quick replies
  app.get("/quick-replies", { preHandler: [app.requireTenant, app.requirePermission("conversations.read")] }, async (request) => {
    return prisma.quickReply.findMany({
      where: { tenantId: request.user.tenantId! },
      orderBy: { title: "asc" },
    });
  });

  app.post("/quick-replies", { preHandler: [app.requireTenant, app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const body = z
      .object({ title: z.string(), content: z.string(), shortcut: z.string().optional() })
      .parse(request.body);
    return prisma.quickReply.create({
      data: { tenantId: request.user.tenantId!, ...body },
    });
  });

  app.delete("/quick-replies/:id", { preHandler: [app.requireTenant, app.requirePermission("conversations.reply")] }, async (request) => {
    const { id } = request.params as { id: string };
    assertFound(await prisma.quickReply.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    await prisma.quickReply.delete({ where: { id } });
    return { ok: true };
  });

  // Channels
  app.get("/channels", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async (request) => {
    return prisma.channel.findMany({
      where: { tenantId: request.user.tenantId! },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post("/channels", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        type: z.enum(["WHATSAPP", "INSTAGRAM", "MESSENGER", "TELEGRAM", "EMAIL", "WEBCHAT", "FORM", "WEBHOOK", "API"]),
        name: z.string(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    // Limite do plano aplica só a WhatsApp ativo (não WEBCHAT etc.)
    if (body.type === "WHATSAPP") {
      const { assertCanAddChannel } = await import("../services/entitlements");
      await assertCanAddChannel(request.user.tenantId!);
    }
    const { asInputJson } = await import("../lib/json");
    return prisma.channel.create({
      data: {
        tenantId: request.user.tenantId!,
        type: body.type,
        name: body.name,
        config: asInputJson(body.config || {}),
      },
    });
  });

  app.patch("/channels/:id", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        isActive: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    assertFound(await prisma.channel.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    const { asInputJson } = await import("../lib/json");
    const { config, ...rest } = body;
    return prisma.channel.update({
      where: { id },
      data: {
        ...rest,
        ...(config !== undefined ? { config: asInputJson(config) } : {}),
      },
    });
  });

  // Knowledge — base central multi-tenant + vínculos com agentes
  app.get("/knowledge", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    const q = request.query as {
      status?: string;
      source?: string;
      agentId?: string;
      q?: string;
    };
    const { listKnowledgeDocs } = await import("../services/knowledge");
    return listKnowledgeDocs({
      tenantId: request.user.tenantId!,
      status: q.status,
      sourceType: q.source,
      agentId: q.agentId,
      q: q.q,
    });
  });

  app.post("/knowledge", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        category: z.string().optional(),
        status: z.enum(["draft", "ready", "archived"]).optional(),
        sourceType: z.enum(["manual", "document", "import"]).optional(),
        scope: z.enum(["all", "agents"]).optional(),
        agentIds: z.array(z.string()).optional(),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    const scope = body.scope || "all";
    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: body.title.trim(),
        content: body.content,
        category: body.category?.trim() || "Geral",
        sourceType: body.sourceType || "manual",
        status: body.status || "ready",
        scope,
        chunks: {
          create: body.content
            .split(/\n{2,}/)
            .filter(Boolean)
            .slice(0, 20)
            .map((content) => ({ content: content.slice(0, 2000) })),
        },
      },
    });

    if (scope === "agents" && body.agentIds?.length) {
      const { setKnowledgeAgentLinks } = await import("../services/knowledge");
      await setKnowledgeAgentLinks({
        tenantId,
        knowledgeDocId: doc.id,
        agentIds: body.agentIds,
        scope: "agents",
      });
    }

    const { getKnowledgeDoc } = await import("../services/knowledge");
    return (await getKnowledgeDoc(tenantId, doc.id)) || doc;
  });

  /**
   * Atualiza documento (editável).
   * Publicar bloqueado se ainda houver placeholders do modelo "Planos e preços".
   */
  app.patch("/knowledge/:id", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        content: z.string().min(1).optional(),
        category: z.string().optional().nullable(),
        status: z.enum(["draft", "ready", "archived"]).optional(),
        scope: z.enum(["all", "agents"]).optional(),
        agentIds: z.array(z.string()).optional(),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    const existing = assertFound(
      await prisma.knowledgeDoc.findFirst({ where: { id, tenantId } })
    );

    const { setKnowledgeAgentLinks, rebuildChunks, getKnowledgeDoc } = await import(
      "../services/knowledge"
    );
    const { hasStarterPlaceholders } = await import("../services/knowledge-starter");

    const nextContent = body.content ?? existing.content;
    if (body.status === "ready" && hasStarterPlaceholders(nextContent)) {
      throw new AppError(
        "Este conhecimento ainda contém informações de exemplo. Revise o conteúdo antes de publicar.",
        400,
        "KNOWLEDGE_EXAMPLE_PLACEHOLDERS"
      );
    }

    const contentChanged =
      body.content !== undefined && body.content !== existing.content;
    if (contentChanged) {
      await rebuildChunks(id, nextContent);
    }

    await prisma.knowledgeDoc.update({
      where: { id },
      data: {
        title: body.title,
        content: body.content,
        category: body.category === undefined ? undefined : body.category,
        status: body.status,
        sourceType: existing.sourceType === "system" ? "manual" : existing.sourceType,
        syncedAt: existing.sourceType === "system" ? null : existing.syncedAt,
        version: contentChanged ? existing.version + 1 : undefined,
      },
    });

    if (body.scope !== undefined || body.agentIds !== undefined) {
      const scope = body.scope || (existing.scope as "all" | "agents") || "all";
      await setKnowledgeAgentLinks({
        tenantId,
        knowledgeDocId: id,
        agentIds: body.agentIds ?? [],
        scope: body.scope === "all" ? "all" : scope === "agents" || body.agentIds ? "agents" : "all",
      });
    }

    return assertFound(await getKnowledgeDoc(tenantId, id));
  });

  app.post("/knowledge/:id/duplicate", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenantId!;
    const src = assertFound(
      await prisma.knowledgeDoc.findFirst({ where: { id, tenantId } })
    );
    const { getKnowledgeDoc, rebuildChunks } = await import("../services/knowledge");
    const copy = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: `${src.title} (cópia)`.slice(0, 200),
        content: src.content,
        category: src.category,
        sourceType: "manual",
        status: "draft",
        scope: "all",
      },
    });
    await rebuildChunks(copy.id, copy.content);
    return assertFound(await getKnowledgeDoc(tenantId, copy.id));
  });

  app.delete("/knowledge/:id", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenantId!;
    const existing = assertFound(
      await prisma.knowledgeDoc.findFirst({
        where: { id, tenantId },
        include: { agentLinks: { take: 5, include: { agent: { select: { name: true } } } } },
      })
    );
    const { markStarterPlansRemovedIfMatch } = await import("../services/knowledge-starter");
    await markStarterPlansRemovedIfMatch(tenantId, existing);
    await prisma.knowledgeDoc.delete({ where: { id } });
    return {
      ok: true,
      hadLinks: existing.agentLinks.length > 0,
      agents: existing.agentLinks.map((l) => l.agent.name),
    };
  });

  /**
   * Exclusão em massa de conhecimentos do tenant.
   * Só remove IDs que pertencem ao tenant da sessão (anti-IDOR).
   */
  app.post(
    "/knowledge/bulk-delete",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async (request) => {
      if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
        throw new AppError("Sem permissão", 403);
      }
      const body = z
        .object({
          ids: z.array(z.string().min(1)).min(1).max(500),
        })
        .parse(request.body);
      const tenantId = request.user.tenantId!;
      const uniqueIds = Array.from(new Set(body.ids));

      const existing = await prisma.knowledgeDoc.findMany({
        where: { tenantId, id: { in: uniqueIds } },
        select: {
          id: true,
          title: true,
          sourceType: true,
          content: true,
        },
      });
      if (!existing.length) {
        throw new AppError("Nenhum conhecimento encontrado para excluir", 404);
      }

      const { markStarterPlansRemovedIfMatch } = await import("../services/knowledge-starter");
      for (const doc of existing) {
        await markStarterPlansRemovedIfMatch(tenantId, doc);
      }

      const result = await prisma.knowledgeDoc.deleteMany({
        where: { tenantId, id: { in: existing.map((d) => d.id) } },
      });

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "knowledge.bulk_delete",
        entity: "knowledgeDoc",
        metadata: { requested: uniqueIds.length, deleted: result.count },
      });

      return {
        ok: true,
        deleted: result.count,
        requested: uniqueIds.length,
        skipped: uniqueIds.length - result.count,
      };
    }
  );

  /** Knowledge vinculado a um agente (Central do Agente) */
  app.get(
    "/ai-agents/:id/knowledge",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const tenantId = request.user.tenantId!;
      assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId } }));
      const { listKnowledgeDocs } = await import("../services/knowledge");
      const all = await listKnowledgeDocs({ tenantId, agentId: id });
      // inclui também só os de scope agents vinculados + all
      return all;
    }
  );

  /**
   * Modelo de arquivo para importação em lote (TXT/Markdown).
   */
  app.get(
    "/knowledge/import/sample",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async () => {
      const { IMPORT_SAMPLE_MD } = await import("../services/knowledge-import");
      return { filename: "modelo-base-conhecimento.md", content: IMPORT_SAMPLE_MD };
    }
  );

  /**
   * Analisa arquivo de texto (.txt / .md) e devolve rascunhos para revisão.
   * NÃO publica nada — só pré-visualização.
   */
  app.post(
    "/knowledge/import/analyze",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async (request) => {
      if (
        !["ADMIN", "SUPERVISOR"].includes(request.user.role || "") &&
        request.user.platformRole !== "SUPERADMIN"
      ) {
        throw new AppError("Sem permissão", 403);
      }
      const body = z
        .object({
          text: z.string().min(1).max(150_000),
          filename: z.string().min(1).max(200).default("importacao.txt"),
          useAi: z.boolean().optional().default(true),
        })
        .parse(request.body);

      const filename = body.filename.toLowerCase();
      if (!/\.(txt|md|markdown)$/i.test(filename) && !/^[^.]+$/.test(body.filename)) {
        // permite nome sem extensão se for texto puro
        if (!filename.endsWith(".txt") && !filename.endsWith(".md") && !filename.endsWith(".markdown")) {
          // still allow if client sends plain text without ext
        }
      }
      const extOk =
        /\.(txt|md|markdown)$/i.test(body.filename) || !body.filename.includes(".");
      if (!extOk) {
        throw new AppError(
          "Formato não suportado. Use .txt ou .md.",
          400,
          "UNSUPPORTED_FORMAT"
        );
      }

      const tenantId = request.user.tenantId!;
      const existing = await prisma.knowledgeDoc.findMany({
        where: { tenantId },
        select: { id: true, title: true, content: true },
        take: 500,
      });

      try {
        const { analyzeKnowledgeImport } = await import("../services/knowledge-import");
        return await analyzeKnowledgeImport({
          text: body.text,
          filename: body.filename,
          existing,
          useAi: body.useAi,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha na análise";
        const code = (err as { statusCode?: number }).statusCode || 400;
        throw new AppError(msg, code);
      }
    }
  );

  /**
   * Confirma importação após revisão do usuário.
   * Cria KnowledgeDoc + chunks no pipeline existente (tenant-scoped).
   */
  app.post(
    "/knowledge/import/confirm",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async (request) => {
      if (
        !["ADMIN", "SUPERVISOR"].includes(request.user.role || "") &&
        request.user.platformRole !== "SUPERADMIN"
      ) {
        throw new AppError("Sem permissão", 403);
      }
      const body = z
        .object({
          filename: z.string().max(200).default("importacao.txt"),
          items: z
            .array(
              z.object({
                title: z.string().min(1).max(200),
                category: z.string().max(80).optional().nullable(),
                content: z.string().min(1).max(50_000),
                /** skip | create | replace */
                action: z.enum(["skip", "create", "replace"]).default("create"),
                replaceId: z.string().optional().nullable(),
              })
            )
            .min(1)
            .max(40),
          /** reservado: agentes da empresa (base continua company-wide) */
          agentIds: z.array(z.string()).optional(),
          general: z.boolean().optional().default(true),
        })
        .parse(request.body);

      const tenantId = request.user.tenantId!;
      const { detectSensitive, chunkContent } = await import("../services/knowledge-import");

      // Valida agentes do mesmo tenant (se enviados)
      if (body.agentIds?.length) {
        const count = await prisma.aiAgent.count({
          where: { tenantId, id: { in: body.agentIds } },
        });
        if (count !== body.agentIds.length) {
          throw new AppError("Agente inválido para este tenant.", 403, "FORBIDDEN");
        }
      }

      const created: Array<{ id: string; title: string }> = [];
      const updated: Array<{ id: string; title: string }> = [];
      const skipped: string[] = [];

      for (const item of body.items) {
        if (item.action === "skip") {
          skipped.push(item.title);
          continue;
        }

        const sens = detectSensitive(item.content);
        if (sens.hit) {
          skipped.push(`${item.title} (bloqueado: sensível)`);
          continue;
        }

        const chunks = chunkContent(item.content);
        const meta = {
          origin: "import",
          filename: body.filename,
          importedAt: new Date().toISOString(),
          importedBy: request.user.sub,
          agentIds: body.agentIds?.length ? body.agentIds : "all",
          general: body.general !== false,
        };

        if (item.action === "replace" && item.replaceId) {
          const existing = await prisma.knowledgeDoc.findFirst({
            where: { id: item.replaceId, tenantId },
          });
          if (!existing) {
            skipped.push(`${item.title} (substituir: não encontrado)`);
            continue;
          }
          await prisma.knowledgeChunk.deleteMany({ where: { docId: existing.id } });
          const doc = await prisma.knowledgeDoc.update({
            where: { id: existing.id },
            data: {
              title: item.title.trim(),
              content: item.content.trim(),
              category: item.category?.trim() || existing.category || "Geral",
              sourceType: "import",
              sourceUrl: body.filename,
              status: "ready",
              scope: "all",
              version: existing.version + 1,
              chunks: {
                create: chunks.map((content) => ({
                  content,
                  metadata: meta,
                })),
              },
            },
          });
          updated.push({ id: doc.id, title: doc.title });
          continue;
        }

        // create
        const doc = await prisma.knowledgeDoc.create({
          data: {
            tenantId,
            title: item.title.trim(),
            content: item.content.trim(),
            category: item.category?.trim() || "Geral",
            sourceType: "import",
            sourceUrl: body.filename,
            status: "ready",
            scope: "all",
            chunks: {
              create: chunks.map((content) => ({
                content,
                metadata: meta,
              })),
            },
          },
        });
        created.push({ id: doc.id, title: doc.title });
      }

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "knowledge.import",
        entity: "knowledge",
        metadata: {
          filename: body.filename,
          created: created.length,
          updated: updated.length,
          skipped: skipped.length,
        },
        ip: request.ip,
      });

      return {
        ok: true,
        created,
        updated,
        skipped,
        message: `${created.length} conhecimento(s) adicionado(s)${
          updated.length ? `, ${updated.length} atualizado(s)` : ""
        }.`,
      };
    }
  );

  // Detalhe (depois de /knowledge/import/* para não capturar "import" como :id)
  app.get("/knowledge/:id", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    if (id === "import") throw new AppError("Não encontrado", 404);
    const { getKnowledgeDoc } = await import("../services/knowledge");
    const doc = await getKnowledgeDoc(request.user.tenantId!, id);
    return assertFound(doc);
  });

  // Automations
  app.get("/automations", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    // runs recentes: só leitura para saúde no card (não altera motor)
    return prisma.automation.findMany({
      where: { tenantId: request.user.tenantId! },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { runs: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, status: true, error: true, createdAt: true },
        },
      },
    });
  });

  app.post("/automations", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        name: z.string(),
        description: z.string().optional(),
        trigger: z.record(z.unknown()).default({}),
        definition: z.record(z.unknown()).default({}),
        status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
      })
      .parse(request.body);

    const { asInputJson } = await import("../lib/json");
    const { assertCanActivateAutomation } = await import("../services/entitlements");
    if (body.status === "ACTIVE") {
      await assertCanActivateAutomation(request.user.tenantId!);
    }
    return prisma.automation.create({
      data: {
        tenantId: request.user.tenantId!,
        name: body.name,
        description: body.description,
        status: body.status,
        trigger: asInputJson(body.trigger),
        definition: asInputJson(body.definition),
      },
    });
  });

  app.patch("/automations/:id", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional().nullable(),
        trigger: z.record(z.unknown()).optional(),
        definition: z.record(z.unknown()).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
      })
      .parse(request.body);

    assertFound(await prisma.automation.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    if (body.status === "ACTIVE") {
      const { assertCanActivateAutomation } = await import("../services/entitlements");
      await assertCanActivateAutomation(request.user.tenantId!, id);
    }
    const { asInputJson } = await import("../lib/json");
    const { trigger, definition, ...rest } = body;
    return prisma.automation.update({
      where: { id },
      data: {
        ...rest,
        ...(trigger !== undefined ? { trigger: asInputJson(trigger) } : {}),
        ...(definition !== undefined ? { definition: asInputJson(definition) } : {}),
        version: { increment: 1 },
      },
    });
  });

  app.delete("/automations/:id", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const existing = assertFound(
      await prisma.automation.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );
    // runs cascateiam via onDelete: Cascade no schema
    await prisma.automation.delete({ where: { id } });
    await audit({
      tenantId: request.user.tenantId!,
      userId: request.user.sub,
      action: "automation.delete",
      entity: "automation",
      entityId: id,
      metadata: { name: existing.name },
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post("/automations/:id/run-test", { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const automation = assertFound(
      await prisma.automation.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    const started = Date.now();
    // Debugger: passos estruturados (reutiliza AutomationRun.result — sem tabela nova)
    const steps = [
      { name: "Mensagem recebida", status: "ok", detail: "Trigger de teste simulado" },
      { name: "Contato localizado", status: "ok", detail: "Sandbox" },
      {
        name: "Condição avaliada",
        status: "ok",
        detail: typeof automation.trigger === "object" ? "Trigger presente" : "Sem condição",
      },
      {
        name: "Ações do fluxo",
        status: "ok",
        detail: "Execução de teste (sem side-effects em clientes reais)",
      },
    ];

    const { asInputJson } = await import("../lib/json");
    const run = await prisma.automationRun.create({
      data: {
        automationId: id,
        status: "success",
        payload: asInputJson({ test: true, by: request.user.sub, sandbox: true }),
        result: asInputJson({
          message: "Execução de teste concluída",
          durationMs: Date.now() - started,
          steps,
          version: automation.version,
        }),
        error: null,
      },
    });

    await prisma.automation.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });

    return run;
  });

  // Campaigns
  app.get("/campaigns", { preHandler: [app.requireTenant, app.requirePermission("crm.read")] }, async (request) => {
    return prisma.campaign.findMany({
      where: { tenantId: request.user.tenantId! },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/campaigns", { preHandler: [app.requireTenant, app.requirePermission("crm.create")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR", "SALES"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { assertFeatureEnabled } = await import("../services/entitlements");
    await assertFeatureEnabled(
      request.user.tenantId!,
      "campaignsEnabled",
      "Campanhas não estão disponíveis no seu plano. Faça upgrade para usar."
    );
    const body = z
      .object({
        name: z.string(),
        message: z.string(),
        channelType: z.enum(["WHATSAPP", "EMAIL", "TELEGRAM"]).optional(),
        segment: z.record(z.unknown()).optional(),
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(request.body);

    const { asInputJson } = await import("../lib/json");
    return prisma.campaign.create({
      data: {
        tenantId: request.user.tenantId!,
        name: body.name,
        message: body.message,
        channelType: body.channelType,
        segment: asInputJson(body.segment || {}),
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
      },
    });
  });

  app.patch("/campaigns/:id", { preHandler: [app.requireTenant, app.requirePermission("crm.update")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        message: z.string().optional(),
        status: z.enum(["DRAFT", "SCHEDULED", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
      })
      .parse(request.body);

    assertFound(await prisma.campaign.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    return prisma.campaign.update({ where: { id }, data: body });
  });

  /**
   * Dispara campanha WhatsApp (lote síncrono limitado).
   * Só contatos com telefone + consentWhatsapp (ou force sem consent se admin marcar).
   */
  app.post(
    "/campaigns/:id/start",
    { preHandler: [app.requireTenant, app.requirePermission("crm.create")] },
    async (request) => {
      if (
        !["ADMIN", "SUPERVISOR", "SALES"].includes(request.user.role || "") &&
        request.user.platformRole !== "SUPERADMIN"
      ) {
        throw new AppError("Sem permissão", 403);
      }
      const { assertFeatureEnabled } = await import("../services/entitlements");
      await assertFeatureEnabled(
        request.user.tenantId!,
        "campaignsEnabled",
        "Campanhas não estão disponíveis no seu plano. Faça upgrade para usar."
      );

      const { id } = request.params as { id: string };
      const body = z
        .object({
          /** Padrão false — só envia com consentWhatsapp */
          requireConsent: z.boolean().optional().default(true),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .parse(request.body || {});

      const tenantId = request.user.tenantId!;
      const campaign = assertFound(
        await prisma.campaign.findFirst({ where: { id, tenantId } })
      );

      if (["RUNNING", "COMPLETED", "CANCELLED"].includes(campaign.status)) {
        throw new AppError(
          `Campanha não pode ser iniciada no status ${campaign.status}.`,
          409,
          "CAMPAIGN_INVALID_STATUS"
        );
      }

      const channel = await prisma.channel.findFirst({
        where: { tenantId, type: "WHATSAPP", isActive: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!channel) {
        throw new AppError(
          "Nenhum canal WhatsApp ativo. Conecte o WhatsApp em Integrações.",
          400,
          "WA_CHANNEL_MISSING"
        );
      }

      const { env: appEnv } = await import("../lib/env");
      const limit = Math.min(
        body.limit || appEnv.campaignBatchLimit,
        appEnv.campaignBatchLimit
      );

      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          phone: { not: null },
          ...(body.requireConsent ? { consentWhatsapp: true } : {}),
        },
        take: limit,
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, phone: true },
      });

      // Access Gate: campanhas não rodam se operações pausadas
      {
        const { evaluateTenantOperationalGate } = await import("../services/access-gate");
        const gate = await evaluateTenantOperationalGate(tenantId);
        if (gate.operationalPaused || !gate.decision.capabilities.canRunCampaigns) {
          throw new (await import("../lib/errors")).AppError(
            "Campanhas pausadas para esta empresa (acesso restrito ou bloqueado).",
            403,
            gate.code
          );
        }
      }

      await prisma.campaign.update({
        where: { id },
        data: { status: "RUNNING" },
      });

      const { dispatchWhatsAppText } = await import("../services/whatsapp/message-dispatch");
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const c of contacts) {
        const phone = (c.phone || "").replace(/\D/g, "");
        if (phone.length < 10) {
          skipped += 1;
          continue;
        }
        const result = await dispatchWhatsAppText({
          channelId: channel.id,
          to: phone,
          text: campaign.message,
          purpose: "campaign",
          contactId: c.id,
          tenantId,
          idempotencyKey: `campaign:${id}:${c.id}`,
          skipConsentCheck: !body.requireConsent,
        });
        if (result.ok) sent += 1;
        else if (result.skipped) skipped += 1;
        else {
          failed += 1;
          if (errors.length < 5 && result.error) errors.push(result.error);
        }
      }

      const stats = {
        attempted: contacts.length,
        sent,
        failed,
        skipped,
        finishedAt: new Date().toISOString(),
        errors: errors.length ? errors : undefined,
      };

      const { asInputJson } = await import("../lib/json");
      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          status: "COMPLETED",
          stats: asInputJson(stats),
        },
      });

      return {
        campaign: updated,
        result: stats,
      };
    }
  );

  // Team — membros, convites pendentes e vagas do plano
  app.get("/team", { preHandler: [app.requireTenant, app.requirePermission("team.manage")] }, async (request) => {
    const tenantId = request.user.tenantId!;
    const now = new Date();
    const [members, pendingInvites, limits] = await Promise.all([
      prisma.membership.findMany({
        where: { tenantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              avatarType: true,
              avatarPresetId: true,
              avatarColor: true,
              lastLoginAt: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.userInvite.findMany({
        where: {
          tenantId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      import("../services/entitlements").then((m) => m.getTenantLimits(tenantId)),
    ]);

    const activeCount = members.filter((m) => m.isActive).length;
    return {
      members,
      pendingInvites,
      seats: {
        used: activeCount,
        pending: pendingInvites.length,
        max: limits.maxUsers,
      },
    };
  });

  app.post("/team/invite", { preHandler: [app.requireTenant, app.requirePermission("team.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        email: z.string().email(),
        /** Opcional — convidado define o nome ao aceitar; se vazio usa trecho do e-mail */
        name: z.string().max(120).optional(),
        role: z.enum(["ADMIN", "SUPERVISOR", "AGENT", "SALES", "READONLY"]).default("AGENT"),
        /** @deprecated não use — convite com token; mantido só por compat e ignorado */
        password: z.string().optional(),
      })
      .parse(request.body);

    const email = body.email.toLowerCase().trim();
    const displayName =
      (body.name || "").trim() ||
      email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ||
      "Convidado";
    const tenantId = request.user.tenantId!;
    const { assertCanAddUser, getTenantLimits } = await import("../services/entitlements");
    await assertCanAddUser(tenantId);

    // Já é membro ativo?
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const membership = await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: existingUser.id } },
      });
      if (membership?.isActive) {
        throw new AppError("Esta pessoa já faz parte da empresa.", 409, "ALREADY_MEMBER");
      }
    }

    // Revoga convites anteriores pendentes para o mesmo e-mail/tenant
    await prisma.userInvite.updateMany({
      where: { tenantId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const { randomBytes } = await import("crypto");
    const { hashOpaqueToken } = await import("../services/security/password");
    const { sendMail, appPublicUrl } = await import("../services/security/mail");
    const { audit } = await import("../services/audit");

    const raw = randomBytes(32).toString("base64url");
    const invite = await prisma.userInvite.create({
      data: {
        tenantId,
        email,
        name: displayName,
        role: body.role,
        tokenHash: hashOpaqueToken(raw),
        invitedById: request.user.sub,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const companyName = tenant?.name || "sua empresa";
    const link = `${appPublicUrl()}/login?invite=${encodeURIComponent(raw)}`;
    const delivery = await sendMail({
      to: email,
      subject: `Convite para a equipe — ${companyName}`,
      text: `Olá${displayName ? ` ${displayName}` : ""},\n\nVocê foi convidado(a) para a equipe de ${companyName} na NexaFlow.\n\nAceite o convite e defina sua senha neste link (válido por 7 dias):\n${link}\n\nSe você não esperava este e-mail, pode ignorá-lo.\n`,
      tags: ["team-invite"],
    });

    await audit({
      tenantId,
      userId: request.user.sub,
      action: "team.invite",
      entity: "user_invite",
      entityId: invite.id,
      metadata: { email, role: body.role },
      ip: request.ip,
    });

    const limits = await getTenantLimits(tenantId);

    return {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
      message: delivery.sent
        ? "Convite enviado. A pessoa receberá um e-mail para definir a senha."
        : "Convite criado, mas o e-mail não foi entregue. Verifique o serviço de e-mail e reenvie.",
      mailDelivered: delivery.sent,
      seats: { max: limits.maxUsers },
      // token só em dev para facilitar testes manuais — nunca em production
      ...(process.env.NODE_ENV !== "production" ? { inviteTokenDevOnly: raw } : {}),
    };
  });

  app.post(
    "/team/invites/:id/revoke",
    { preHandler: [app.requireTenant, app.requirePermission("team.manage")] },
    async (request) => {
      if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
        throw new AppError("Sem permissão", 403);
      }
      const { id } = request.params as { id: string };
      const tenantId = request.user.tenantId!;
      const invite = await prisma.userInvite.findFirst({
        where: { id, tenantId, acceptedAt: null, revokedAt: null },
      });
      if (!invite) {
        throw new AppError("Convite não encontrado ou já utilizado.", 404);
      }
      await prisma.userInvite.update({
        where: { id: invite.id },
        data: { revokedAt: new Date() },
      });
      const { audit } = await import("../services/audit");
      await audit({
        tenantId,
        userId: request.user.sub,
        action: "team.invite_revoke",
        entity: "user_invite",
        entityId: invite.id,
        metadata: { email: invite.email },
        ip: request.ip,
      });
      return { ok: true };
    }
  );

  // Dashboard
  app.get("/dashboard", { preHandler: [app.requireTenant, app.requirePermission("reports.read")] }, async (request) => {
    const tenantId = request.user.tenantId!;
    const q = z
      .object({
        period: z
          .enum(["today", "7", "30", "90", "month", "last_month", "custom"])
          .optional()
          .default("30"),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(request.query || {});

    const now = new Date();
    let rangeEnd = now;
    let rangeStart: Date;
    let periodLabel = "Últimos 30 dias";

    switch (q.period) {
      case "today": {
        rangeStart = new Date(now);
        rangeStart.setHours(0, 0, 0, 0);
        periodLabel = "Hoje";
        break;
      }
      case "7":
        rangeStart = new Date(now.getTime() - 7 * 86400_000);
        periodLabel = "Últimos 7 dias";
        break;
      case "90":
        rangeStart = new Date(now.getTime() - 90 * 86400_000);
        periodLabel = "Últimos 90 dias";
        break;
      case "month":
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = "Este mês";
        break;
      case "last_month": {
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        periodLabel = "Mês anterior";
        break;
      }
      case "custom": {
        rangeStart = q.from ? new Date(q.from) : new Date(now.getTime() - 30 * 86400_000);
        rangeEnd = q.to ? new Date(q.to) : now;
        if (Number.isNaN(rangeStart.getTime())) rangeStart = new Date(now.getTime() - 30 * 86400_000);
        if (Number.isNaN(rangeEnd.getTime())) rangeEnd = now;
        periodLabel = "Personalizado";
        break;
      }
      default:
        rangeStart = new Date(now.getTime() - 30 * 86400_000);
        periodLabel = "Últimos 30 dias";
    }

    const durationMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 86400_000);
    const prevEnd = new Date(rangeStart.getTime() - 1);
    const prevStart = new Date(rangeStart.getTime() - durationMs);
    const since = rangeStart;

    const [
      openConversations,
      unreadConversations,
      totalContacts,
      openTasks,
      openOpportunities,
      wonOpportunities,
      messagesIn,
      messagesOut,
      aiAgents,
      channelsConfigured,
      priorityLeads,
      qualifiedLeads,
      recentConversations,
      overdueTasks,
      stuckOpportunities,
      prevMessagesIn,
      prevMessagesOut,
      prevWonOpps,
      closedConversations,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId, status: "OPEN" } }),
      prisma.conversation.count({ where: { tenantId, isUnread: true } }),
      prisma.contact.count({ where: { tenantId } }),
      prisma.task.count({ where: { tenantId, status: { in: ["TODO", "IN_PROGRESS"] } } }),
      prisma.opportunity.count({ where: { tenantId, status: "OPEN" } }),
      prisma.opportunity.findMany({
        where: {
          tenantId,
          status: "WON",
          updatedAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { value: true },
      }),
      prisma.message.count({
        where: {
          direction: "INBOUND",
          conversation: { tenantId },
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          conversation: { tenantId },
          createdAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
      prisma.aiAgent.count({ where: { tenantId, isActive: true } }),
      // apenas contagem de registros (não = conectado)
      prisma.channel.count({ where: { tenantId, type: "WHATSAPP" } }),
      prisma.contact.count({
        where: { tenantId, priority: { in: ["ALTA", "URGENTE"] } },
      }),
      prisma.contact.count({
        where: {
          tenantId,
          commercialStatus: { in: ["QUALIFICADO", "EM_NEGOCIACAO"] },
        },
      }),
      prisma.conversation.findMany({
        where: { tenantId },
        include: { contact: true, channel: true },
        orderBy: { lastMessageAt: "desc" },
        take: 8,
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueAt: { lt: new Date() },
        },
      }),
      prisma.opportunity.count({
        where: {
          tenantId,
          status: "OPEN",
          OR: [
            { lastActivityAt: { lt: new Date(Date.now() - 4 * 86400_000) } },
            { lastActivityAt: null, updatedAt: { lt: new Date(Date.now() - 4 * 86400_000) } },
          ],
        },
      }),
      prisma.message.count({
        where: {
          direction: "INBOUND",
          conversation: { tenantId },
          createdAt: { gte: prevStart, lte: prevEnd },
        },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          conversation: { tenantId },
          createdAt: { gte: prevStart, lte: prevEnd },
        },
      }),
      prisma.opportunity.findMany({
        where: {
          tenantId,
          status: "WON",
          updatedAt: { gte: prevStart, lte: prevEnd },
        },
        select: { value: true },
      }),
      prisma.conversation.count({
        where: {
          tenantId,
          status: { in: ["CLOSED", "ARCHIVED"] },
          closedAt: { gte: rangeStart, lte: rangeEnd },
        },
      }),
    ]);

    // Fonte única de verdade: sessões realmente conectadas (não isActive no banco)
    const { getTenantWhatsAppStatus } = await import("../services/whatsapp/connection-status");
    const waStatus = await getTenantWhatsAppStatus(tenantId);
    const channels = waStatus.connectedCount;

    // Setup checklist histórico (não regride com desconexão operacional)
    const { ensureWhatsAppConfiguredFromLive } = await import("../services/tenant-setup-checklist");
    const checklist = await ensureWhatsAppConfiguredFromLive(tenantId, waStatus.connected);

    const pipelineValue = await prisma.opportunity.aggregate({
      where: { tenantId, status: "OPEN" },
      _sum: { value: true },
    });

    const wonValue = wonOpportunities.reduce((acc, o) => acc + Number(o.value), 0);
    const prevWonValue = prevWonOpps.reduce((acc, o) => acc + Number(o.value), 0);

    // Forgotten opportunities detector
    const forgotten = await prisma.conversation.findMany({
      where: {
        tenantId,
        status: { in: ["OPEN", "PENDING"] },
        OR: [
          { assignedToId: null, isUnread: true },
          { lastMessageAt: { lt: new Date(Date.now() - 2 * 86400_000) } },
        ],
      },
      include: { contact: true },
      take: 10,
      orderBy: { lastMessageAt: "asc" },
    });

    const waitingReply = await prisma.conversation.count({
      where: {
        tenantId,
        status: "OPEN",
        isUnread: true,
        lastMessageAt: { lt: new Date(Date.now() - 30 * 60_000) },
      },
    });

    // Health baseado em estado real (fonte única getTenantWhatsAppStatus)
    const [failedRuns, activeAutomations] = await Promise.all([
      prisma.automationRun.count({
        where: {
          status: { in: ["error", "failed"] },
          createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
          automation: { tenantId },
        },
      }),
      prisma.automation.count({
        where: { tenantId, status: "ACTIVE" },
      }),
    ]);
    const { getAiStatus } = await import("../services/ai");
    const aiStatus = getAiStatus();

    const health = {
      whatsapp: {
        label: "WhatsApp",
        status: waStatus.health.status,
        human: waStatus.health.human,
        detail: waStatus.channels.filter((c) => !c.connected).map((c) => c.name),
        actionLabel: waStatus.health.actionLabel,
        actionHref: waStatus.health.actionHref,
        connectionStatus: waStatus.status,
        connectedCount: waStatus.connectedCount,
      },
      // IA "Operando" só faz sentido operacionalmente com canal conectado
      agents: {
        label: "Agentes de IA",
        status: !aiStatus.configured
          ? "ATENCAO"
          : aiAgents === 0
            ? "SEM_DADOS"
            : !waStatus.connected
              ? "ATENCAO"
              : "OPERANDO",
        human: !aiStatus.configured
          ? "IA sem chave configurada"
          : aiAgents === 0
            ? "Nenhum agente ativo"
            : !waStatus.connected
              ? "Aguardando canal"
              : "Operando",
      },
      // Automações: não mostrar "Normal" sem fluxo ACTIVE ou sem canal para rodar
      automations: {
        label: "Automações",
        status:
          failedRuns > 0
            ? "ATENCAO"
            : activeAutomations === 0
              ? "SEM_DADOS"
              : !waStatus.connected
                ? "ATENCAO"
                : "OPERANDO",
        human:
          failedRuns > 0
            ? `${failedRuns} falha(s) nos últimos 7 dias`
            : activeAutomations === 0
              ? "Nenhuma automação ativa"
              : !waStatus.connected
                ? "Aguardando canal"
                : "Normal",
      },
      queues: {
        label: "Filas",
        status: "SEM_DADOS",
        human: "Sem workers dedicados neste ambiente",
      },
    };

    // NexaFlow recomenda (dados reais) + filtra decisões do usuário
    const rawRecs: Array<{
      id: string;
      title: string;
      reason: string;
      impact: string;
      actionLabel: string;
      href: string;
    }> = [];

    // Contagem real da fila "Assumir" (pedido cliente/IA — não rate limit)
    let waitingHumanCount = 0;
    try {
      const pending = await prisma.conversation.findMany({
        where: { tenantId, status: "PENDING", assignedToId: null },
        select: {
          id: true,
          messages: {
            where: {
              OR: [
                { metadata: { path: ["requiresAssume"], equals: true } },
                { metadata: { path: ["waitingHuman"], equals: true } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 2,
            select: { metadata: true },
          },
        },
        take: 40,
      });
      waitingHumanCount = pending.filter((c) => {
        for (const m of c.messages) {
          const meta = (m.metadata || {}) as {
            requiresAssume?: boolean;
            waitingHuman?: boolean;
            humanHandoff?: boolean;
            source?: string;
            reason?: string;
          };
          if (meta.requiresAssume === true) return true;
          if (meta.requiresAssume === false) continue;
          if (meta.waitingHuman || meta.humanHandoff) {
            if (meta.source === "platform_degradation") {
              return (
                meta.reason === "tenant_credits_exhausted" ||
                meta.reason === "tenant_credits_near_limit"
              );
            }
            return true;
          }
        }
        return false;
      }).length;
    } catch {
      waitingHumanCount = 0;
    }

    if (waitingHumanCount > 0) {
      rawRecs.push({
        id: "waiting-human",
        title:
          waitingHumanCount === 1
            ? "1 chat aguarda você assumir"
            : `${waitingHumanCount} chats aguardam um atendente`,
        reason: "Cliente pediu humano ou a IA solicitou transferência.",
        impact: "high",
        actionLabel: waitingHumanCount === 1 ? "Abrir conversa" : "Ver atendimentos",
        href: "/app/inbox?status=PENDING",
      });
    }

    if (waitingReply > 0) {
      rawRecs.push({
        id: "waiting-reply",
        title: `${waitingReply} conversa(s) sem resposta (> 30 min)`,
        reason: "",
        impact: "",
        actionLabel: "Abrir conversas",
        href: "/app/inbox",
      });
    }
    if (overdueTasks > 0) {
      rawRecs.push({
        id: "overdue-tasks",
        title: `${overdueTasks} tarefa(s) vencida(s)`,
        reason: "",
        impact: "",
        actionLabel: "Ver tarefas",
        href: "/app/tasks",
      });
    }
    if (stuckOpportunities > 0) {
      rawRecs.push({
        id: "stuck-ops",
        title: `${stuckOpportunities} oportunidade(s) parada(s) há 4+ dias`,
        reason: "",
        impact: "",
        actionLabel: "Abrir funil",
        href: "/app/crm",
      });
    }
    if (!waStatus.connected) {
      const wasSetup = checklist.whatsappConfigured;
      rawRecs.push({
        id: "wa-connect",
        title: wasSetup ? "WhatsApp desconectado" : "WhatsApp não conectado",
        reason: "",
        impact: "",
        actionLabel: wasSetup ? "Reconectar" : "Conectar",
        href: "/app/integrations",
      });
    }
    if (priorityLeads > 0) {
      rawRecs.push({
        id: "priority-leads",
        title: `${priorityLeads} lead(s) com prioridade alta`,
        reason: "",
        impact: "",
        actionLabel: "Ver contatos",
        href: "/app/contacts",
      });
    }

    const decisions = await prisma.recommendationDecision.findMany({
      where: {
        tenantId,
        userId: request.user.sub,
        OR: [
          { status: { in: ["RESOLVED", "IGNORED"] } },
          { status: "SNOOZED", snoozeUntil: { gt: new Date() } },
        ],
      },
    });
    const hiddenKeys = new Set(decisions.map((d) => d.key));
    const recommendations = rawRecs
      .filter((r) => !hiddenKeys.has(r.id))
      .map((r) => ({ ...r, status: "OPEN" as const }));

    let usage = null;
    try {
      const { getUsageSnapshot } = await import("../services/entitlements");
      usage = await getUsageSnapshot(tenantId);
    } catch {
      /* ignore */
    }

    return {
      kpis: {
        openConversations,
        unreadConversations,
        totalContacts,
        openTasks,
        openOpportunities,
        wonValue,
        pipelineValue: Number(pipelineValue._sum.value || 0),
        messagesIn,
        messagesOut,
        aiAgents,
        /** Canais REALMENTE conectados (sessão aberta) — nunca isActive sozinho */
        channels,
        channelsConnected: channels,
        /** Registros WHATSAPP no banco (configurados, não necessariamente online) */
        channelsConfigured,
        /** @deprecated use priorityLeads / qualifiedLeads */
        hotLeads: priorityLeads,
        priorityLeads,
        qualifiedLeads,
        overdueTasks,
        stuckOpportunities,
        waitingReply,
        /** Fila Assumir (só handoff real) */
        waitingHuman: waitingHumanCount,
        closedConversations,
      },
      waitingHumanCount,
      /** Período aplicado às métricas de fluxo (mensagens, vendas no intervalo) */
      period: {
        key: q.period,
        label: periodLabel,
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
      /** Comparação real com intervalo anterior de mesma duração — sem inventar % */
      previous: {
        messagesIn: prevMessagesIn,
        messagesOut: prevMessagesOut,
        wonValue: prevWonValue,
      },
      whatsapp: {
        status: waStatus.status,
        connected: waStatus.connected,
        connectedCount: waStatus.connectedCount,
        configuredCount: waStatus.configuredCount,
        banner: waStatus.banner,
        /** Histórico de setup — independente de connected */
        everConfigured: checklist.whatsappConfigured,
      },
      /** Checklist Home "Configuração inicial" — etapas não regridem */
      setupChecklist: checklist,
      recentConversations,
      forgottenOpportunities: forgotten,
      recommendations,
      health,
      usage,
    };
  });

  app.get("/usage", { preHandler: [app.requireTenant, app.requirePermission("settings.read")] }, async (request) => {
    const { getUsageSnapshot } = await import("../services/entitlements");
    return getUsageSnapshot(request.user.tenantId!);
  });

  // Notificações in-app
  app.get("/notifications", { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const unread = items.filter((n) => !n.readAt).length;
    return {
      items: items.map((n) => ({
        ...n,
        actionUrl: n.actionUrl || n.href,
      })),
      unread,
    };
  });

  app.post("/notifications/read-all", { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    // Releases vinculadas a notificações de Novidades também passam a "vistas"
    try {
      const { markReleasesSeenFromAllNotifications } = await import(
        "../services/platform-release-notify"
      );
      await markReleasesSeenFromAllNotifications(userId);
    } catch {
      /* ignore */
    }
    return { ok: true };
  });

  /** Remove todas as notificações do usuário autenticado */
  app.post("/notifications/clear", { preHandler: [app.authenticate] }, async (request) => {
    const result = await prisma.notification.deleteMany({
      where: { userId: request.user.sub },
    });
    return { ok: true, deleted: result.count };
  });

  app.post("/notifications/:id/read", { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;
    await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    try {
      const { markReleaseSeenFromNotification } = await import(
        "../services/platform-release-notify"
      );
      await markReleaseSeenFromNotification({ userId, notificationId: id });
    } catch {
      /* ignore */
    }
    return { ok: true };
  });

  /** Resolver / ignorar / adiar recomendação (não recria se já decidida) */
  app.post(
    "/recommendations/:key/decision",
    { preHandler: [app.requireTenant, app.authenticate] },
    async (request) => {
      const { key } = request.params as { key: string };
      const body = z
        .object({
          status: z.enum(["RESOLVED", "IGNORED", "SNOOZED", "OPEN"]),
          note: z.string().max(500).optional(),
          snoozeHours: z.number().min(1).max(168).optional(),
        })
        .parse(request.body);

      const tenantId = request.user.tenantId!;
      const userId = request.user.sub;
      const snoozeUntil =
        body.status === "SNOOZED"
          ? new Date(Date.now() + (body.snoozeHours || 24) * 3600_000)
          : null;

      const row = await prisma.recommendationDecision.upsert({
        where: {
          tenantId_userId_key: { tenantId, userId, key },
        },
        create: {
          tenantId,
          userId,
          key,
          status: body.status,
          note: body.note || null,
          snoozeUntil,
        },
        update: {
          status: body.status,
          note: body.note || null,
          snoozeUntil,
        },
      });
      return row;
    }
  );

  app.get(
    "/automations/:id/runs",
    { preHandler: [app.requireTenant, app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      assertFound(
        await prisma.automation.findFirst({
          where: { id, tenantId: request.user.tenantId! },
        })
      );
      return prisma.automationRun.findMany({
        where: { automationId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
    }
  );

  // Settings
  app.get("/settings", { preHandler: [app.requireTenant, app.requirePermission("settings.read")] }, async (request) => {
    const tenant = assertFound(
      await prisma.tenant.findUnique({
        where: { id: request.user.tenantId! },
        include: { plan: true },
      })
    );
    return tenant;
  });

  app.patch("/settings", { preHandler: [app.requireTenant, app.requirePermission("settings.update")] }, async (request) => {
    const body = z
      .object({
        name: z.string().min(2).max(120).optional(),
        primaryColor: z.string().optional(),
        logoUrl: z.string().optional().nullable(),
        settings: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const { sanitizeLogoInput } = await import("../services/security/logo-upload");
    const logoUrl =
      body.logoUrl !== undefined ? await sanitizeLogoInput(body.logoUrl) : undefined;

    const current = assertFound(
      await prisma.tenant.findUnique({ where: { id: request.user.tenantId! } })
    );
    const prev = (current.settings || {}) as Record<string, unknown>;
    // Merge profundo de continuousLearning e attendance (não substituir parcialmente)
    let nextSettings = body.settings ? { ...prev, ...body.settings } : undefined;
    if (body.settings?.continuousLearning && typeof body.settings.continuousLearning === "object") {
      const prevCl = (prev.continuousLearning || {}) as Record<string, unknown>;
      const nextCl = body.settings.continuousLearning as Record<string, unknown>;
      nextSettings = {
        ...prev,
        ...body.settings,
        continuousLearning: {
          ...prevCl,
          ...nextCl,
          sources: {
            ...((prevCl.sources as object) || {}),
            ...((nextCl.sources as object) || {}),
          },
        },
      };
    }
    if (body.settings?.attendance && typeof body.settings.attendance === "object") {
      const prevAt = (prev.attendance || {}) as Record<string, unknown>;
      const nextAt = body.settings.attendance as Record<string, unknown>;
      const deep = (a: unknown, b: unknown) => ({
        ...((a && typeof a === "object" ? a : {}) as object),
        ...((b && typeof b === "object" ? b : {}) as object),
      });
      nextSettings = {
        ...(nextSettings || prev),
        ...body.settings,
        attendance: {
          ...prevAt,
          ...nextAt,
          inactivity: deep(prevAt.inactivity, nextAt.inactivity),
          aiClose: deep(prevAt.aiClose, nextAt.aiClose),
          reopen: deep(prevAt.reopen, nextAt.reopen),
          aiHandoff: deep(prevAt.aiHandoff, nextAt.aiHandoff),
          csat: deep(prevAt.csat, nextAt.csat),
        },
      };
    }

    const { asInputJson } = await import("../lib/json");
    const updated = await prisma.tenant.update({
      where: { id: request.user.tenantId! },
      data: {
        name: body.name,
        primaryColor: body.primaryColor,
        ...(logoUrl !== undefined ? { logoUrl: logoUrl ?? null } : {}),
        ...(nextSettings ? { settings: asInputJson(nextSettings) } : {}),
      },
      include: { plan: true },
    });

    // Auditoria de aprendizado contínuo (ativar/desativar, nível, fontes)
    if (body.settings?.continuousLearning !== undefined && nextSettings) {
      try {
        const { audit } = await import("../services/audit");
        const prevCl = (prev.continuousLearning || {}) as {
          enabled?: boolean;
          level?: number;
          sources?: Record<string, boolean>;
        };
        const nextCl = (nextSettings.continuousLearning || {}) as {
          enabled?: boolean;
          level?: number;
          sources?: Record<string, boolean>;
        };
        const prevEn = prevCl.enabled === true;
        const nextEn = nextCl.enabled === true;
        if (prevEn !== nextEn) {
          await audit({
            tenantId: request.user.tenantId!,
            userId: request.user.sub,
            action: nextEn ? "learning.enabled" : "learning.disabled",
            entity: "tenant",
            entityId: request.user.tenantId!,
            metadata: { continuousLearning: nextCl },
          });
        }
        if (prevEn || nextEn) {
          if (Number(prevCl.level || 1) !== Number(nextCl.level || 1)) {
            await audit({
              tenantId: request.user.tenantId!,
              userId: request.user.sub,
              action: "learning.level_changed",
              entity: "tenant",
              entityId: request.user.tenantId!,
              metadata: { from: prevCl.level || 1, to: nextCl.level || 1 },
            });
          }
          const prevSrc = prevCl.sources || {};
          const nextSrc = nextCl.sources || {};
          const keys = new Set([...Object.keys(prevSrc), ...Object.keys(nextSrc)]);
          for (const key of keys) {
            const was = prevSrc[key] !== false;
            const now = nextSrc[key] !== false;
            if (was !== now) {
              await audit({
                tenantId: request.user.tenantId!,
                userId: request.user.sub,
                action: now ? "learning.source_enabled" : "learning.source_disabled",
                entity: "tenant",
                entityId: request.user.tenantId!,
                metadata: { source: key },
              });
            }
          }
        }
      } catch {
        /* ignore audit failure */
      }
    }

    return updated;
  });

  /** Cadastro inicial da empresa (1ª vez no sistema) — auth + permissão no servidor */
  app.post(
    "/onboarding/company",
    { preHandler: [app.requireTenant, app.requirePermission("onboarding.complete")] },
    async (request) => {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        segment: z.string().max(80).optional(),
        phone: z.string().max(40).optional(),
        website: z.string().max(200).optional(),
        commercialEmail: z.string().max(160).optional(),
        city: z.string().max(80).optional(),
        state: z.string().max(40).optional(),
        primaryColor: z.string().optional(),
        logoUrl: z.string().max(2_500_000).optional().nullable(),
      })
      .parse(request.body);

    // tenant SEMPRE da sessão
    const tenantId = request.user.tenantId;
    if (!tenantId) throw new AppError("Empresa não selecionada", 400, "TENANT_REQUIRED");

    const current = assertFound(
      await prisma.tenant.findUnique({ where: { id: tenantId } })
    );
    const prev = (current.settings || {}) as Record<string, unknown>;
    if (prev.onboardingCompleted === true) {
      throw new AppError("Onboarding já concluído", 409, "ONBOARDING_DONE");
    }

    const slugBase = body.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    let slug = slugBase || current.slug;
    if (slug !== current.slug) {
      const taken = await prisma.tenant.findFirst({
        where: { slug, id: { not: current.id } },
      });
      if (taken) slug = `${slugBase}-${current.id.slice(-4)}`;
    }

    const { sanitizeLogoInput } = await import("../services/security/logo-upload");
    const safeLogo =
      body.logoUrl !== undefined ? await sanitizeLogoInput(body.logoUrl) : undefined;

    const tenant = await prisma.$transaction(async (tx) => {
      return tx.tenant.update({
        where: { id: current.id },
        data: {
          name: body.name.trim(),
          slug,
          primaryColor: body.primaryColor || current.primaryColor,
          ...(safeLogo !== undefined ? { logoUrl: safeLogo || null } : {}),
          settings: {
            ...prev,
            onboardingCompleted: true,
            onboardingCompletedAt: new Date().toISOString(),
            segment: body.segment || null,
            phone: body.phone || null,
            website: body.website || null,
            commercialEmail: body.commercialEmail || null,
            city: body.city || null,
            state: body.state || null,
            timezone: (prev.timezone as string) || "America/Sao_Paulo",
            language: (prev.language as string) || "pt-BR",
          },
        },
        include: { plan: true },
      });
    });

    // Agente padrão + knowledge inicial da EMPRESA (Planos e preços em rascunho)
    try {
      const { ensureDefaultAiAgent } = await import("../services/ensure-default-agent");
      await ensureDefaultAiAgent(tenant.id);
    } catch (err) {
      console.error(
        "[onboarding] ensure agent failed:",
        err instanceof Error ? err.message : err
      );
    }
    try {
      const { provisionTenantKnowledge } = await import("../services/knowledge-starter");
      await provisionTenantKnowledge(tenant.id);
    } catch (err) {
      console.error(
        "[onboarding] starter knowledge failed:",
        err instanceof Error ? err.message : err
      );
    }

    await audit({
      tenantId: tenant.id,
      userId: request.user.sub,
      action: "tenant.onboarding.completed",
      ip: request.ip,
      metadata: { name: tenant.name },
    });

    return tenant;
  }
  );

  // Audit logs
  app.get("/audit-logs", { preHandler: [app.requireTenant, app.requirePermission("audit.read")] }, async (request) => {
    return prisma.auditLog.findMany({
      where: { tenantId: request.user.tenantId! },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  // WhatsApp webhook (público)
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const q = request.query as Record<string, string>;
    const mode = q["hub.mode"];
    const token = q["hub.verify_token"];
    const challenge = q["hub.challenge"];
    const { env } = await import("../lib/env");
    if (mode === "subscribe" && token === env.whatsappVerifyToken) {
      return reply.send(challenge);
    }
    return reply.code(403).send("Forbidden");
  });

  app.post("/webhooks/whatsapp", async (request) => {
    const payload = request.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            messages?: Array<{
              from: string;
              id: string;
              timestamp: string;
              type: string;
              text?: { body: string };
            }>;
            contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          };
        }>;
      }>;
    };

    try {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value?.messages?.length) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          let resolvedChannel = phoneNumberId
            ? await prisma.channel.findFirst({
                where: { type: "WHATSAPP", isActive: true, externalId: phoneNumberId },
              })
            : null;

          // Se não achar canal específico, tenta o primeiro WhatsApp ativo
          if (!resolvedChannel) {
            resolvedChannel = await prisma.channel.findFirst({
              where: { type: "WHATSAPP", isActive: true },
            });
          }

          if (!resolvedChannel) continue;

          for (const msg of value.messages) {
            const name = value.contacts?.[0]?.profile?.name || msg.from;
            const content = msg.text?.body || `[${msg.type}]`;
            // ingestInboundMessage dispara auto-resposta da Ana (modo AUTO)
            await ingestInboundMessage({
              tenantId: resolvedChannel.tenantId,
              channelId: resolvedChannel.id,
              phone: msg.from,
              name,
              content,
              externalId: msg.id,
              type: msg.type === "text" ? "TEXT" : "DOCUMENT",
            });
          }
        }
      }
    } catch (err) {
      console.error("WhatsApp webhook error", err);
    }

    return { ok: true };
  });

  // Simulate inbound message (dev/demo)
  app.post("/channels/:id/simulate-inbound", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        phone: z.string(),
        name: z.string().default("Cliente simulado"),
        content: z.string().min(1),
      })
      .parse(request.body);

    const channel = assertFound(
      await prisma.channel.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    // Usa o mesmo fluxo real (inclui auto-resposta da Ana)
    return ingestInboundMessage({
      tenantId: channel.tenantId,
      channelId: channel.id,
      phone: body.phone,
      name: body.name,
      content: body.content,
    });
  });
}
