import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { broadcastToTenant } from "../ws/hub";
import { analyzeConversation } from "../services/ai";
import { audit } from "../services/audit";

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  /**
   * Fila "Assumir chat": só conversas com pedido REAL de humano.
   * - Cliente pediu atendente (regra "humano", etc.)
   * - IA solicitou handoff (regra nao_sabe / tool / "vou transferir")
   * - Créditos de IA esgotados (operacional)
   * NÃO inclui rate limit / erro transitório de provedor.
   */
  app.get(
    "/conversations/waiting-human",
    { preHandler: [app.requirePermission("conversations.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const candidates = await prisma.conversation.findMany({
        where: {
          tenantId,
          status: "PENDING",
          assignedToId: null,
        },
        select: {
          id: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          contact: { select: { name: true } },
          messages: {
            where: {
              OR: [
                { metadata: { path: ["requiresAssume"], equals: true } },
                { metadata: { path: ["waitingHuman"], equals: true } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { metadata: true, createdAt: true },
          },
        },
        // Mais antigo aguardando primeiro (FIFO da fila humana)
        orderBy: { lastMessageAt: "asc" },
        take: 40,
      });

      const intentional = candidates.filter((c) => {
        for (const m of c.messages) {
          const meta = (m.metadata || {}) as {
            requiresAssume?: boolean;
            waitingHuman?: boolean;
            humanHandoff?: boolean;
            source?: string;
            reason?: string;
          };
          // Preferência explícita
          if (meta.requiresAssume === true) return true;
          if (meta.requiresAssume === false) continue;
          // Legado: waitingHuman sem platform_degradation de rate limit
          if (meta.waitingHuman || meta.humanHandoff) {
            if (meta.source === "platform_degradation") {
              // só créditos esgotados contam como Assumir
              if (
                meta.reason === "tenant_credits_exhausted" ||
                meta.reason === "tenant_credits_near_limit"
              ) {
                return true;
              }
              continue;
            }
            // ai_rule | ai_tool | ai_reply | sem source (legado de regra)
            return true;
          }
        }
        return false;
      });

      return {
        count: intentional.length,
        items: intentional.slice(0, 5).map((c) => ({
          id: c.id,
          contactName: c.contact?.name || "Cliente",
          preview: c.lastMessagePreview || null,
          lastMessageAt: c.lastMessageAt,
        })),
      };
    }
  );

  app.get("/conversations", { preHandler: [app.requirePermission("conversations.read")] }, async (request) => {
    const q = z
      .object({
        status: z.string().optional(),
        channelId: z.string().optional(),
        assignedToId: z.string().optional(),
        unassigned: z.coerce.boolean().optional(),
        unread: z.coerce.boolean().optional(),
        favorite: z.coerce.boolean().optional(),
        /** Conversas com rascunho IA aguardando aprovação */
        pendingApproval: z.coerce.boolean().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query);

    const tenantId = request.user.tenantId!;
    const where: Record<string, unknown> = { tenantId };

    if (q.status) where.status = q.status;
    if (q.channelId) where.channelId = q.channelId;
    if (q.assignedToId) where.assignedToId = q.assignedToId;
    if (q.unassigned) where.assignedToId = null;
    if (q.unread) where.isUnread = true;
    if (q.favorite) where.isFavorite = true;
    if (q.pendingApproval) {
      where.messages = {
        some: {
          isAiGenerated: true,
          aiApproved: false,
          metadata: { path: ["pendingApproval"], equals: true },
        },
      };
    }
    if (q.search) {
      where.OR = [
        { contact: { name: { contains: q.search } } },
        { lastMessagePreview: { contains: q.search } },
      ];
    }

    // Atendente só vê conversas atribuídas a ele ou sem responsável (fila)
    if (request.user.role === "AGENT") {
      where.OR = [
        { assignedToId: request.user.sub },
        { assignedToId: null },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { include: { tags: { include: { tag: true } } } },
          channel: true,
          assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: [{ isUnread: "desc" }, { lastMessageAt: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return { items, total, page: q.page, limit: q.limit };
  });

  app.get("/conversations/:id", { preHandler: [app.requirePermission("conversations.read")] }, async (request) => {
    const { id } = request.params as { id: string };
    const conversation = assertFound(
      await prisma.conversation.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        include: {
          contact: { include: { tags: { include: { tag: true } }, memory: true } },
          channel: true,
          assignedTo: { select: { id: true, name: true, avatarUrl: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          },
          notes: {
            orderBy: { createdAt: "desc" },
            include: { author: { select: { id: true, name: true } } },
          },
          tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      })
    );

    if (conversation.isUnread) {
      await prisma.conversation.update({
        where: { id },
        data: { isUnread: false },
      });
      conversation.isUnread = false;
    }

    return conversation;
  });

  app.post("/conversations", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const body = z
      .object({
        contactId: z.string(),
        channelId: z.string().optional(),
        message: z.string().optional(),
      })
      .parse(request.body);

    const tenantId = request.user.tenantId!;
    const contact = assertFound(
      await prisma.contact.findFirst({ where: { id: body.contactId, tenantId } })
    );

    const open = await prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id, status: { in: ["OPEN", "PENDING"] } },
    });
    if (open) return open;

    const conversation = await prisma.conversation.create({
      data: {
        tenantId,
        contactId: contact.id,
        channelId: body.channelId,
        status: "OPEN",
        assignedToId: request.user.sub,
        lastMessageAt: body.message ? new Date() : null,
        lastMessagePreview: body.message,
        isUnread: false,
        messages: body.message
          ? {
              create: {
                direction: "OUTBOUND",
                content: body.message,
                authorId: request.user.sub,
              },
            }
          : undefined,
      },
      include: { contact: true, channel: true },
    });

    broadcastToTenant(tenantId, "conversation.created", conversation);
    try {
      const { emitWebhookEvent } = await import("../services/webhooks/dispatch");
      emitWebhookEvent({
        tenantId,
        type: "conversation.created",
        data: {
          conversation: {
            id: conversation.id,
            status: conversation.status,
            contactId: conversation.contactId,
          },
        },
      });
    } catch {
      /* ignore */
    }
    return conversation;
  });

  app.post("/conversations/:id/messages", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        content: z.string().min(1),
        /** Tipo de mídia. Nota interna usa isInternal=true (não MessageType). */
        type: z.enum(["TEXT", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"]).default("TEXT"),
        isInternal: z.boolean().optional(),
        mediaUrl: z.string().optional(),
        /** Cliente pode reenviar a mesma chave em retry — evita duplo envio WhatsApp */
        idempotencyKey: z.string().min(8).max(200).optional(),
      })
      .parse(request.body);

    const conversation = assertFound(
      await prisma.conversation.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        include: { contact: true, channel: true },
      })
    );

    const isInternal = Boolean(body.isInternal);

    // Primeira mensagem humana (sem responsável) = assume atômico e avisa no WhatsApp
    let shouldTakeover =
      !isInternal && !conversation.assignedToId && Boolean(request.user.sub);

    if (shouldTakeover) {
      try {
        const { assumeConversationAtomic } = await import("../services/human-handoff");
        const assumed = await assumeConversationAtomic({
          tenantId: request.user.tenantId!,
          conversationId: id,
          userId: request.user.sub,
        });
        if (!assumed.alreadyYours) {
          try {
            const { notifyHumanTakeover } = await import("../services/whatsapp");
            await notifyHumanTakeover({
              tenantId: request.user.tenantId!,
              conversationId: id,
              agentUserId: request.user.sub,
            });
          } catch (err) {
            console.error(
              "[conversations] handoff notify failed:",
              err instanceof Error ? err.message : err
            );
          }
        }
      } catch (err) {
        // Concorrência: outro já assumiu — envia mensagem mesmo assim sem reatribuir
        shouldTakeover = false;
        console.warn(
          "[conversations] assume on reply:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // Envia pelo WhatsApp (Evolution/WAHA) quando for mensagem real no canal
    let externalId: string | undefined;
    let deliveryError: string | undefined;
    if (!isInternal && conversation.channel?.type === "WHATSAPP" && conversation.contact.phone) {
      try {
        const { createHash } = await import("crypto");
        const { dispatchWhatsAppText } = await import("../services/whatsapp");
        // Chave estável (sem Date.now) — retry/double-click não duplica envio
        const contentHash = createHash("sha256")
          .update(body.content)
          .digest("hex")
          .slice(0, 16);
        const idempotencyKey =
          body.idempotencyKey ||
          `reply:${id}:${request.user.sub}:${contentHash}`;
        const sent = await dispatchWhatsAppText({
          channelId: conversation.channel.id,
          to: conversation.contact.phone,
          text: body.content,
          purpose: "reply",
          tenantId: request.user.tenantId!,
          contactId: conversation.contactId,
          idempotencyKey,
        });
        if (sent.ok) externalId = sent.externalId;
        else deliveryError = sent.error || "Falha no envio WhatsApp";
      } catch (err) {
        deliveryError = err instanceof Error ? err.message : "Erro ao enviar WhatsApp";
      }
    }

    const { asInputJson } = await import("../lib/json");
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: request.user.sub,
        direction: isInternal ? "INTERNAL" : "OUTBOUND",
        type: isInternal ? "TEXT" : body.type,
        content: body.content,
        mediaUrl: body.mediaUrl,
        externalId,
        isAiGenerated: false,
        metadata: asInputJson(deliveryError ? { deliveryError } : {}),
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: isInternal ? `[Nota] ${body.content}` : body.content,
        status: conversation.status === "CLOSED" ? "OPEN" : conversation.status,
        isUnread: false,
        assignedToId: shouldTakeover ? request.user.sub : conversation.assignedToId || undefined,
      },
    });

    await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { lastInteractionAt: new Date() },
    });

    if (!isInternal) {
      try {
        const { emitWebhookEvent } = await import("../services/webhooks/dispatch");
        emitWebhookEvent({
          tenantId: request.user.tenantId!,
          type: "message.sent",
          data: {
            conversationId: id,
            message: {
              id: message.id,
              content: message.content.slice(0, 500),
              direction: "OUTBOUND",
            },
          },
        });
      } catch {
        /* ignore */
      }
    }

    broadcastToTenant(request.user.tenantId!, "message.created", {
      conversationId: id,
      message,
      conversation: updated,
    });

    return { ...message, deliveryError };
  });

  app.patch("/conversations/:id", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.enum(["OPEN", "PENDING", "CLOSED", "ARCHIVED"]).optional(),
        assignedToId: z.string().nullable().optional(),
        isFavorite: z.boolean().optional(),
        priority: z.number().int().optional(),
        /** Motivo ao finalizar (não apaga histórico) */
        closeReason: z
          .enum([
            "COMPLETED",
            "HUMAN_CLOSED",
            "AI_RESOLVED",
            "NO_RESPONSE",
            "CANCELLED",
            "DUPLICATE",
            "SALE",
            "GAVE_UP",
            "FORWARDED",
            "OTHER",
          ])
          .optional(),
        closeNote: z.string().max(500).optional(),
        /** false = não avisar o cliente no WhatsApp ao encerrar */
        sendCloseNotice: z.boolean().optional(),
      })
      .parse(request.body);

    const before = assertFound(
      await prisma.conversation.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    const wasOpen = before.status === "OPEN" || before.status === "PENDING";
    const wasEnded = before.status === "CLOSED" || before.status === "ARCHIVED";
    const isEnding =
      body.status === "CLOSED" || body.status === "ARCHIVED";
    const isReopening = wasEnded && body.status === "OPEN";

    // Encerramento humano → serviço central (motivo, auditoria, timeline, aviso)
    if (wasOpen && isEnding && body.status && body.status !== before.status) {
      const { closeConversation } = await import("../services/conversation-close");
      const result = await closeConversation({
        tenantId: request.user.tenantId!,
        conversationId: id,
        source: "human",
        reason: body.closeReason || "HUMAN_CLOSED",
        note: body.closeNote,
        userId: request.user.sub,
        sendNotice: body.sendCloseNotice !== false,
        status: body.status === "ARCHIVED" ? "ARCHIVED" : "CLOSED",
        skipSafetyChecks: true,
      });
      // Aplica campos extras (assign etc.) se vieram no mesmo patch
      if (
        body.assignedToId !== undefined ||
        body.isFavorite !== undefined ||
        body.priority !== undefined
      ) {
        return prisma.conversation.update({
          where: { id },
          data: {
            assignedToId: body.assignedToId,
            isFavorite: body.isFavorite,
            priority: body.priority,
          },
          include: {
            contact: true,
            channel: true,
            assignedTo: { select: { id: true, name: true } },
          },
        });
      }
      if (result.ok && "conversation" in result && result.conversation) {
        // closeConversation já faz broadcast; reforça evento de lista (banner/inbox)
        broadcastToTenant(request.user.tenantId!, "conversation.updated", {
          id: result.conversation.id,
          conversationId: result.conversation.id,
          status: result.conversation.status,
          conversation: result.conversation,
        });
        return result.conversation;
      }
    }

    // Reabertura manual
    if (isReopening) {
      const { reopenConversation } = await import("../services/conversation-close");
      const reopened = await reopenConversation({
        tenantId: request.user.tenantId!,
        conversationId: id,
        userId: request.user.sub,
        reason: "manual",
      });
      if (reopened) {
        if (
          body.assignedToId !== undefined ||
          body.isFavorite !== undefined ||
          body.priority !== undefined
        ) {
          return prisma.conversation.update({
            where: { id },
            data: {
              assignedToId: body.assignedToId,
              isFavorite: body.isFavorite,
              priority: body.priority,
            },
            include: {
              contact: true,
              channel: true,
              assignedTo: { select: { id: true, name: true } },
            },
          });
        }
        return reopened;
      }
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        status: body.status,
        assignedToId: body.assignedToId,
        isFavorite: body.isFavorite,
        priority: body.priority,
      },
      include: {
        contact: true,
        channel: true,
        assignedTo: { select: { id: true, name: true } },
      },
    });

    // Padrão do sistema: assumir → avisa no WhatsApp (todo agente / todo cliente)
    if (body.assignedToId && body.assignedToId !== before.assignedToId) {
      try {
        const { notifyHumanTakeover } = await import("../services/whatsapp");
        await notifyHumanTakeover({
          tenantId: request.user.tenantId!,
          conversationId: id,
          agentUserId: body.assignedToId,
          agentName: conversation.assignedTo?.name,
        });
      } catch (err) {
        console.error(
          "[conversations] handoff on patch failed:",
          err instanceof Error ? err.message : err
        );
      }
      // Notificação in-app para o usuário atribuído (se não for o próprio)
      if (body.assignedToId !== request.user.sub) {
        try {
          const { createNotification } = await import("../services/notifications");
          const contactName = conversation.contact?.name || "Contato";
          await createNotification({
            userId: body.assignedToId,
            tenantId: request.user.tenantId!,
            type: "CONVERSATION_ASSIGNED",
            title: "Conversa atribuída a você",
            body: `${contactName} — abra a inbox para atender.`,
            actionUrl: `/app/inbox?c=${id}`,
            entityType: "conversation",
            entityId: id,
            dedupe: true,
          });
        } catch (err) {
          console.error(
            "[conversations] in-app assign notify failed:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    await audit({
      tenantId: request.user.tenantId,
      userId: request.user.sub,
      action: "conversation.update",
      entity: "conversation",
      entityId: id,
      metadata: {
        ...body,
        previousStatus: before.status,
      },
    });

    broadcastToTenant(request.user.tenantId!, "conversation.updated", conversation);
    return conversation;
  });

  /**
   * Exclusão permanente de conversa + mensagens na NexaFlow.
   * NÃO apaga chat no WhatsApp. Ação destrutiva — só ADMIN/SUPERVISOR.
   */
  app.delete("/conversations/:id", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const canHardDelete =
      request.user.platformRole === "SUPERADMIN" ||
      ["ADMIN", "SUPERVISOR"].includes(request.user.role || "");
    if (!canHardDelete) {
      throw new AppError(
        "Apenas administradores ou supervisores podem excluir conversas permanentemente. Use Encerrar ou Arquivar.",
        403
      );
    }
    const { id } = request.params as { id: string };
    const conv = assertFound(
      await prisma.conversation.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );

    // desvincula tarefas antes de apagar
    await prisma.task.updateMany({
      where: { conversationId: id },
      data: { conversationId: null },
    });
    await prisma.note.deleteMany({ where: { conversationId: id } });
    await prisma.message.deleteMany({ where: { conversationId: id } });
    await prisma.conversation.delete({ where: { id } });

    await audit({
      tenantId: request.user.tenantId,
      userId: request.user.sub,
      action: "conversation.delete",
      entity: "conversation",
      entityId: id,
      metadata: { contactId: conv.contactId },
    });

    broadcastToTenant(request.user.tenantId!, "conversation.deleted", { id });
    return { ok: true };
  });

  /**
   * Assumir atendimento (atômico) ou atribuir a outro usuário (transferência).
   * Body vazio / sem userId → assume para si.
   * Body { userId } → transferir (ou atribuir) para esse membro do tenant.
   * Body { userId: null } → devolve para fila (sem humano; use resume-ai para IA).
   */
  app.post("/conversations/:id/assign", { preHandler: [app.requirePermission("conversations.assign")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        userId: z.string().nullable().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(request.body ?? {});

    const tenantId = request.user.tenantId!;
    const selfId = request.user.sub;

    // Devolver à fila (sem humano e sem retomar IA — fica aguardando)
    if (body.userId === null) {
      const before = assertFound(
        await prisma.conversation.findFirst({ where: { id, tenantId } })
      );
      const conversation = await prisma.conversation.update({
        where: { id },
        data: { assignedToId: null, status: "PENDING", isUnread: true },
        include: {
          assignedTo: { select: { id: true, name: true } },
          contact: true,
          channel: true,
        },
      });
      const { asInputJson } = await import("../lib/json");
      await prisma.message.create({
        data: {
          conversationId: id,
          direction: "INTERNAL",
          type: "SYSTEM",
          content: "Atendimento devolvido à fila humana. Aguardando um atendente assumir.",
          authorId: selfId,
          metadata: asInputJson({
            systemNotice: true,
            noticeKind: "returned_to_queue",
            waitingHuman: true,
            requiresAssume: true,
            humanHandoff: true,
          }),
        },
      });
      broadcastToTenant(tenantId, "conversation.updated", conversation);
      broadcastToTenant(tenantId, "notification.created", {
        conversationId: id,
        waitingHuman: true,
      });
      return conversation;
    }

    // Transferência para outro membro
    if (body.userId && body.userId !== selfId) {
      const { transferConversationToUser } = await import("../services/human-handoff");
      await transferConversationToUser({
        tenantId,
        conversationId: id,
        fromUserId: selfId,
        toUserId: body.userId,
        note: body.note,
      });
      const conversation = assertFound(
        await prisma.conversation.findFirst({
          where: { id, tenantId },
          include: {
            assignedTo: { select: { id: true, name: true } },
            contact: true,
            channel: true,
          },
        })
      );
      try {
        const { emitWebhookEvent } = await import("../services/webhooks/dispatch");
        emitWebhookEvent({
          tenantId,
          type: "conversation.assigned",
          data: {
            conversation: {
              id: conversation.id,
              assignedToId: body.userId,
              contactId: conversation.contactId,
            },
          },
        });
      } catch {
        /* ignore */
      }
      return conversation;
    }

    // Assumir para si (atômico)
    const { assumeConversationAtomic } = await import("../services/human-handoff");
    const result = await assumeConversationAtomic({
      tenantId,
      conversationId: id,
      userId: selfId,
    });

    const conversation = assertFound(
      await prisma.conversation.findFirst({
        where: { id, tenantId },
        include: {
          assignedTo: { select: { id: true, name: true } },
          contact: true,
          channel: true,
        },
      })
    );

    // Aviso WhatsApp só na primeira assunção real
    if (!result.alreadyYours) {
      try {
        const { notifyHumanTakeover } = await import("../services/whatsapp");
        await notifyHumanTakeover({
          tenantId,
          conversationId: id,
          agentUserId: selfId,
          agentName: conversation.assignedTo?.name,
        });
      } catch (err) {
        console.error(
          "[conversations] handoff on assign failed:",
          err instanceof Error ? err.message : err
        );
      }
      try {
        const { emitWebhookEvent } = await import("../services/webhooks/dispatch");
        emitWebhookEvent({
          tenantId,
          type: "conversation.assigned",
          data: {
            conversation: {
              id: conversation.id,
              assignedToId: selfId,
              contactId: conversation.contactId,
            },
          },
        });
        emitWebhookEvent({
          tenantId,
          type: "ai.handoff",
          data: {
            conversationId: conversation.id,
            agentUserId: selfId,
            agentName: conversation.assignedTo?.name || null,
          },
        });
      } catch {
        /* ignore */
      }
    }

    return conversation;
  });

  /**
   * Devolver atendimento para a IA (retomada explícita).
   * Confirmação fica na UI; backend não reenvia msg automática ao cliente.
   */
  app.post(
    "/conversations/:id/resume-ai",
    { preHandler: [app.requirePermission("conversations.assign")] },
    async (request) => {
      if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
      const { id } = request.params as { id: string };
      const { resumeAiAttendance } = await import("../services/human-handoff");
      await resumeAiAttendance({
        tenantId: request.user.tenantId!,
        conversationId: id,
        userId: request.user.sub,
      });
      const conversation = assertFound(
        await prisma.conversation.findFirst({
          where: { id, tenantId: request.user.tenantId! },
          include: {
            assignedTo: { select: { id: true, name: true } },
            contact: true,
            channel: true,
          },
        })
      );
      try {
        const { emitWebhookEvent } = await import("../services/webhooks/dispatch");
        emitWebhookEvent({
          tenantId: request.user.tenantId!,
          type: "conversation.assigned",
          data: {
            conversation: {
              id: conversation.id,
              assignedToId: null,
              contactId: conversation.contactId,
              aiResumed: true,
            },
          },
        });
      } catch {
        /* ignore */
      }
      return conversation;
    }
  );

  app.post("/conversations/:id/notes", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z.object({ content: z.string().min(1) }).parse(request.body);

    assertFound(await prisma.conversation.findFirst({ where: { id, tenantId: request.user.tenantId! } }));

    const note = await prisma.note.create({
      data: {
        conversationId: id,
        authorId: request.user.sub,
        content: body.content,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    return note;
  });

  app.post("/conversations/:id/ai-suggest", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ agentId: z.string().optional() }).parse(request.body || {});
    const conv = assertFound(
      await prisma.conversation.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        select: { id: true, contactId: true },
      })
    );

    const suggestion = await analyzeConversation({
      tenantId: request.user.tenantId!,
      conversationId: id,
      agentId: body.agentId,
    });

    // Executa tools estruturadas seguras (não destrutivas)
    let toolResults: unknown[] = [];
    if (suggestion.actions?.length && suggestion.agentId) {
      try {
        const { executeAgentToolCalls } = await import("../services/agent-tools");
        toolResults = await executeAgentToolCalls(
          {
            tenantId: request.user.tenantId!,
            agentId: suggestion.agentId,
            conversationId: id,
            contactId: conv.contactId,
            userId: request.user.sub,
            source: "suggest",
          },
          suggestion.actions
        );
      } catch {
        toolResults = [];
      }
    }

    // Modo APPROVE: grava rascunho na timeline (não envia WhatsApp)
    let pendingApprovalMessageId: string | undefined;
    if (suggestion.agentMode === "APPROVE" && suggestion.reply?.trim()) {
      const msg = await prisma.message.create({
        data: {
          conversationId: id,
          authorId: request.user.sub,
          direction: "OUTBOUND",
          content: suggestion.reply,
          isAiGenerated: true,
          aiApproved: false,
          metadata: {
            pendingApproval: true,
            agentId: suggestion.agentId || null,
            originalReply: suggestion.reply,
          },
        },
      });
      pendingApprovalMessageId = msg.id;
      await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: `[Aguardando aprovação] ${suggestion.reply.slice(0, 160)}`,
        },
      });
      broadcastToTenant(request.user.tenantId!, "message.created", {
        conversationId: id,
        message: msg,
      });
    }

    return {
      ...suggestion,
      toolResults,
      pendingApprovalMessageId,
      pendingApproval: Boolean(pendingApprovalMessageId),
    };
  });

  /** Aprovar / editar e enviar rascunho IA (modo APPROVE) */
  app.post(
    "/conversations/:id/messages/:messageId/approve",
    { preHandler: [app.requirePermission("conversations.reply")] },
    async (request) => {
      if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
      const { id, messageId } = request.params as { id: string; messageId: string };
      const body = z
        .object({
          content: z.string().min(1).optional(),
          discard: z.boolean().optional(),
        })
        .parse(request.body || {});

      const conversation = assertFound(
        await prisma.conversation.findFirst({
          where: { id, tenantId: request.user.tenantId! },
          include: { contact: true, channel: true },
        })
      );

      const message = assertFound(
        await prisma.message.findFirst({
          where: { id: messageId, conversationId: id },
        })
      );

      if (!message.isAiGenerated || message.aiApproved !== false) {
        throw new AppError("Mensagem não está aguardando aprovação", 400);
      }

      if (body.discard) {
        await prisma.message.delete({ where: { id: messageId } });
        return { ok: true, discarded: true };
      }

      const finalContent = (body.content || message.content).trim();
      const meta = (message.metadata || {}) as {
        originalReply?: string;
        agentId?: string;
      };

      // aprendizado: correção humana
      if (meta.originalReply && meta.originalReply !== finalContent) {
        try {
          const { recordHumanCorrection } = await import("../services/agent-learning");
          await recordHumanCorrection({
            tenantId: request.user.tenantId!,
            agentId: meta.agentId,
            conversationId: id,
            originalAi: meta.originalReply,
            finalHuman: finalContent,
          });
        } catch {
          /* ignore */
        }
      }

      let externalId: string | undefined;
      let deliveryError: string | undefined;
      if (conversation.channel?.type === "WHATSAPP" && conversation.contact.phone) {
        try {
          const { createHash } = await import("crypto");
          const { dispatchWhatsAppText } = await import("../services/whatsapp");
          const contentHash = createHash("sha256")
            .update(finalContent)
            .digest("hex")
            .slice(0, 16);
          const sent = await dispatchWhatsAppText({
            channelId: conversation.channel.id,
            to: conversation.contact.phone,
            text: finalContent,
            purpose: "ai",
            tenantId: request.user.tenantId!,
            contactId: conversation.contactId,
            idempotencyKey: `ai-approve:${messageId}:${contentHash}`,
          });
          if (sent.ok) externalId = sent.externalId;
          else deliveryError = sent.error || "Falha no envio WhatsApp";
        } catch (err) {
          deliveryError = err instanceof Error ? err.message : "Erro ao enviar";
        }
      }

      const { asInputJson } = await import("../lib/json");
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: finalContent,
          aiApproved: true,
          externalId,
          authorId: request.user.sub,
          metadata: asInputJson({
            ...meta,
            pendingApproval: false,
            approvedById: request.user.sub,
            approvedAt: new Date().toISOString(),
            edited: Boolean(body.content && body.content !== message.content),
            ...(deliveryError ? { deliveryError } : {}),
          }),
        },
        include: { author: { select: { id: true, name: true } } },
      });

      await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: finalContent.slice(0, 200),
          isUnread: false,
        },
      });

      broadcastToTenant(request.user.tenantId!, "message.created", {
        conversationId: id,
        message: updated,
      });
      return updated;
    }
  );

  app.post("/conversations/:id/ai-send", { preHandler: [app.requirePermission("conversations.reply")] }, async (request) => {
    if (request.user.role === "READONLY") throw new AppError("Sem permissão", 403);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        content: z.string().min(1),
        approved: z.boolean().default(true),
      })
      .parse(request.body);

    const conversation = assertFound(
      await prisma.conversation.findFirst({
        where: { id, tenantId: request.user.tenantId! },
        include: { contact: true, channel: true },
      })
    );

    // Mesmo caminho de envio do reply humano — só marca origem IA
    let externalId: string | undefined;
    let deliveryError: string | undefined;
    if (conversation.channel?.type === "WHATSAPP" && conversation.contact.phone) {
      try {
        const { createHash } = await import("crypto");
        const { dispatchWhatsAppText } = await import("../services/whatsapp");
        const contentHash = createHash("sha256")
          .update(body.content)
          .digest("hex")
          .slice(0, 16);
        const sent = await dispatchWhatsAppText({
          channelId: conversation.channel.id,
          to: conversation.contact.phone,
          text: body.content,
          purpose: "ai",
          tenantId: request.user.tenantId!,
          contactId: conversation.contactId,
          idempotencyKey: `ai-send:${id}:${request.user.sub}:${contentHash}`,
        });
        if (sent.ok) externalId = sent.externalId;
        else deliveryError = sent.error || "Falha no envio WhatsApp";
      } catch (err) {
        deliveryError = err instanceof Error ? err.message : "Erro ao enviar WhatsApp";
      }
    }

    const { asInputJson } = await import("../lib/json");
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: request.user.sub,
        direction: "OUTBOUND",
        content: body.content,
        externalId,
        isAiGenerated: true,
        aiApproved: body.approved,
        metadata: asInputJson({
          aiManualSend: true,
          ...(deliveryError ? { deliveryError } : {}),
        }),
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });

    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: body.content,
        isUnread: false,
      },
    });

    broadcastToTenant(request.user.tenantId!, "message.created", { conversationId: id, message });
    return message;
  });
}
