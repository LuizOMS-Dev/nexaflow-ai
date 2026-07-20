/**
 * Agentes 2.0 — rotas avançadas (tools, versões, aprendizado, testes, métricas).
 * Multi-tenant: sempre filtra tenantId do JWT.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { executeAgentTool, SAFE_TOOLS } from "../services/agent-tools";
import {
  recordAgentFeedback,
  recordKnowledgeGap,
  recordLearningSuggestion,
} from "../services/agent-learning";
import {
  publishAgentVersion,
  rollbackAgentVersion,
  agentSnapshot,
} from "../services/agent-versioning";
import { chatWithAgent } from "../services/ai";
import { asInputJson } from "../lib/json";
import { agentConfigFingerprint } from "../services/agent-readiness";

const testExpectationsSchema = z
  .object({
    mustInclude: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
    mustNotInclude: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
    expectedHandoff: z.boolean().optional(),
  })
  .strict();

export async function agentAdvancedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  const canManage = async (request: {
    user: { role?: string | null; platformRole?: string | null };
  }) => {
    if (
      !["ADMIN", "SUPERVISOR"].includes(request.user.role || "") &&
      request.user.platformRole !== "SUPERADMIN"
    ) {
      throw new AppError("Sem permissão", 403);
    }
  };

  // ── Catalog tools ──
  app.get("/ai-agents/tools/catalog", { preHandler: [app.requirePermission("ai.manage")] }, async () => {
    return {
      tools: SAFE_TOOLS.map((id) => ({
        id,
        label: id.replace(/_/g, " "),
      })),
      blocked: [
        "delete_contact",
        "manage_users",
        "cancel_subscription",
        "register_payment",
        "change_contract",
        "grant_discount",
      ],
    };
  });

  // ── Execute tool (manual / server) ──
  app.post(
    "/ai-agents/:id/tools/execute",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          tool: z.string().min(1),
          args: z.record(z.unknown()).default({}),
          conversationId: z.string().optional(),
          contactId: z.string().optional(),
          sandbox: z.boolean().optional(),
        })
        .parse(request.body);

      assertFound(
        await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );

      return executeAgentTool(
        {
          tenantId: request.user.tenantId!,
          agentId: id,
          conversationId: body.conversationId,
          contactId: body.contactId,
          userId: request.user.sub,
          source: body.sandbox ? "sandbox" : "manual",
        },
        body.tool,
        body.args
      );
    }
  );

  // ── Metrics ──
  app.get(
    "/ai-agents/:id/metrics",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const q = request.query as { days?: string };
      const days = Math.min(90, Math.max(1, Number(q.days) || 30));
      const tenantId = request.user.tenantId!;
      assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId } }));

      const since = new Date(Date.now() - days * 864e5);

      const [usage, tools, feedbacks, gaps, handoffMsgs, pendingApprovals] = await Promise.all([
        prisma.aiUsageLog.count({
          where: { tenantId, agentId: id, createdAt: { gte: since } },
        }),
        prisma.agentToolExecution.groupBy({
          by: ["status"],
          where: { tenantId, agentId: id, createdAt: { gte: since } },
          _count: true,
        }),
        prisma.agentFeedback.groupBy({
          by: ["rating"],
          where: { tenantId, agentId: id, createdAt: { gte: since } },
          _count: true,
        }),
        prisma.knowledgeGap.count({
          where: { tenantId, agentId: id, createdAt: { gte: since } },
        }),
        prisma.message.count({
          where: {
            conversation: { tenantId },
            createdAt: { gte: since },
            metadata: { path: ["agentId"], equals: id },
            AND: [{ metadata: { path: ["humanHandoff"], equals: true } }],
          },
        }),
        prisma.message.count({
          where: {
            conversation: { tenantId },
            isAiGenerated: true,
            aiApproved: false,
            createdAt: { gte: since },
            metadata: { path: ["agentId"], equals: id },
          },
        }),
      ]);

      const toolsOk = tools.find((t) => t.status === "SUCCESS")?._count || 0;
      const toolsFail = tools.find((t) => t.status === "FAILED")?._count || 0;
      const up = feedbacks.find((f) => f.rating === "up")?._count || 0;
      const down = feedbacks.find((f) => f.rating === "down")?._count || 0;

      return {
        periodDays: days,
        since: since.toISOString(),
        aiResponses: usage,
        toolSuccess: toolsOk,
        toolFailed: toolsFail,
        feedbackUp: up,
        feedbackDown: down,
        knowledgeGaps: gaps,
        handoffs: handoffMsgs,
        pendingApprovals,
      };
    }
  );

  // ── Versions ──
  app.get(
    "/ai-agents/:id/versions",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const tenantId = request.user.tenantId!;
      assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId } }));
      return prisma.agentVersion.findMany({
        where: { tenantId, agentId: id },
        orderBy: { version: "desc" },
        take: 50,
      });
    }
  );

  app.post(
    "/ai-agents/:id/publish",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z.object({ changeNote: z.string().optional() }).parse(request.body || {});
      assertFound(
        await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      const version = await publishAgentVersion({
        tenantId: request.user.tenantId!,
        agentId: id,
        userId: request.user.sub,
        changeNote: body.changeNote,
      });
      return version;
    }
  );

  app.post(
    "/ai-agents/:id/rollback",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z.object({ version: z.number().int().positive() }).parse(request.body);
      const version = await rollbackAgentVersion({
        tenantId: request.user.tenantId!,
        agentId: id,
        version: body.version,
        userId: request.user.sub,
      });
      return version;
    }
  );

  // ── Knowledge gaps ──
  app.get("/knowledge-gaps", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    const q = request.query as { status?: string; agentId?: string };
    const tenantId = request.user.tenantId!;
    return prisma.knowledgeGap.findMany({
      where: {
        tenantId,
        ...(q.status ? { status: q.status as "NEW" | "REVIEWING" | "RESOLVED" | "IGNORED" } : {}),
        ...(q.agentId ? { agentId: q.agentId } : {}),
      },
      orderBy: [{ occurrences: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
    });
  });

  app.patch(
    "/knowledge-gaps/:id",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z
        .object({
          status: z.enum(["NEW", "REVIEWING", "RESOLVED", "IGNORED"]).optional(),
        })
        .parse(request.body);
      assertFound(
        await prisma.knowledgeGap.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      const updated = await prisma.knowledgeGap.update({
        where: { id },
        data: {
          status: body.status,
          resolvedAt: body.status === "RESOLVED" ? new Date() : undefined,
        },
      });
      if (body.status) {
        const { audit } = await import("../services/audit");
        await audit({
          tenantId: request.user.tenantId!,
          userId: request.user.sub,
          action: `learning.gap_${body.status.toLowerCase()}`,
          entity: "knowledgeGap",
          entityId: id,
          metadata: { status: body.status },
        });
      }
      return updated;
    }
  );

  app.post(
    "/knowledge-gaps/:id/to-knowledge",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z
        .object({ title: z.string().optional(), content: z.string().min(1) })
        .parse(request.body);
      const gap = assertFound(
        await prisma.knowledgeGap.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      const tenantId = request.user.tenantId!;
      const doc = await prisma.knowledgeDoc.create({
        data: {
          tenantId,
          title: body.title || gap.question.slice(0, 120),
          content: body.content,
          category: "FAQ",
          sourceType: "gap",
          status: "ready",
          scope: gap.agentId ? "agents" : "all",
        },
      });
      // Sugere vínculo com o agente que gerou a lacuna
      if (gap.agentId) {
        try {
          const { setKnowledgeAgentLinks } = await import("../services/knowledge");
          await setKnowledgeAgentLinks({
            tenantId,
            knowledgeDocId: doc.id,
            agentIds: [gap.agentId],
            scope: "agents",
          });
        } catch {
          /* ignore */
        }
      }
      await prisma.knowledgeGap.update({
        where: { id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      const { audit } = await import("../services/audit");
      await audit({
        tenantId,
        userId: request.user.sub,
        action: "learning.knowledge_created",
        entity: "knowledgeDoc",
        entityId: doc.id,
        metadata: { fromGapId: id, sourceType: "gap", agentId: gap.agentId },
      });
      return doc;
    }
  );

  // ── Learning suggestions ──
  app.get(
    "/learning-suggestions",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const q = request.query as { status?: string; agentId?: string };
      return prisma.learningSuggestion.findMany({
        where: {
          tenantId: request.user.tenantId!,
          ...(q.status
            ? { status: q.status as "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED" }
            : {}),
          ...(q.agentId ? { agentId: q.agentId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
  );

  app.patch(
    "/learning-suggestions/:id",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z
        .object({
          status: z.enum(["PENDING", "APPROVED", "REJECTED", "ARCHIVED"]),
          content: z.string().optional(),
          publishKnowledge: z.boolean().optional(),
        })
        .parse(request.body);
      const sug = assertFound(
        await prisma.learningSuggestion.findFirst({
          where: { id, tenantId: request.user.tenantId! },
        })
      );
      const updated = await prisma.learningSuggestion.update({
        where: { id },
        data: {
          status: body.status,
          content: body.content ?? sug.content,
          reviewedById: request.user.sub,
          reviewedAt: new Date(),
        },
      });
      const { audit } = await import("../services/audit");
      const actionMap: Record<string, string> = {
        APPROVED: "learning.suggestion_approved",
        REJECTED: "learning.suggestion_rejected",
        ARCHIVED: "learning.suggestion_archived",
        PENDING: "learning.suggestion_pending",
      };
      await audit({
        tenantId: request.user.tenantId!,
        userId: request.user.sub,
        action: actionMap[body.status] || "learning.suggestion_updated",
        entity: "learningSuggestion",
        entityId: id,
        metadata: { status: body.status, kind: sug.kind },
      });
      if (body.status === "APPROVED" && body.publishKnowledge !== false) {
        const tenantId = request.user.tenantId!;
        const doc = await prisma.knowledgeDoc.create({
          data: {
            tenantId,
            title: sug.title,
            content: body.content || sug.content,
            category: "Aprendizado",
            sourceType: "learning",
            status: "ready",
            scope: sug.agentId ? "agents" : "all",
          },
        });
        if (sug.agentId) {
          try {
            const { setKnowledgeAgentLinks } = await import("../services/knowledge");
            await setKnowledgeAgentLinks({
              tenantId,
              knowledgeDocId: doc.id,
              agentIds: [sug.agentId],
              scope: "agents",
            });
          } catch {
            /* ignore */
          }
        }
        await audit({
          tenantId,
          userId: request.user.sub,
          action: "learning.knowledge_created",
          entity: "knowledgeDoc",
          entityId: doc.id,
          metadata: { fromSuggestionId: id, sourceType: "learning", agentId: sug.agentId },
        });
      }
      return updated;
    }
  );

  // ── Feedback ──
  app.post(
    "/ai-agents/:id/feedback",
    { preHandler: [app.requirePermission("conversations.reply")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          rating: z.enum(["up", "down"]),
          reason: z.string().optional(),
          note: z.string().optional(),
          conversationId: z.string().optional(),
          messageId: z.string().optional(),
        })
        .parse(request.body);
      assertFound(
        await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      return recordAgentFeedback({
        tenantId: request.user.tenantId!,
        agentId: id,
        conversationId: body.conversationId,
        messageId: body.messageId,
        rating: body.rating,
        reason: body.reason,
        note: body.note,
        createdById: request.user.sub,
      });
    }
  );

  // ── Test cases ──
  app.get(
    "/ai-agents/:id/test-cases",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      assertFound(
        await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      return prisma.agentTestCase.findMany({
        where: { tenantId: request.user.tenantId!, agentId: id },
        orderBy: { sortOrder: "asc" },
      });
    }
  );

  app.post(
    "/ai-agents/:id/test-cases",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { id } = request.params as { id: string };
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          input: z.string().trim().min(2).max(4000),
          expectations: testExpectationsSchema.optional(),
          isRequired: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(10_000).optional(),
        })
        .parse(request.body);
      assertFound(
        await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
      );
      return prisma.agentTestCase.create({
        data: {
          tenantId: request.user.tenantId!,
          agentId: id,
          name: body.name,
          input: body.input,
          expectations: body.expectations ? asInputJson(body.expectations) : undefined,
          isRequired: body.isRequired ?? false,
          sortOrder: body.sortOrder ?? 0,
        },
      });
    }
  );

  app.patch(
    "/ai-agents/:agentId/test-cases/:caseId",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { agentId, caseId } = request.params as { agentId: string; caseId: string };
      const body = z
        .object({
          name: z.string().trim().min(2).max(120).optional(),
          input: z.string().trim().min(2).max(4000).optional(),
          expectations: testExpectationsSchema.optional(),
          isRequired: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(10_000).optional(),
        })
        .parse(request.body);
      assertFound(
        await prisma.agentTestCase.findFirst({
          where: {
            id: caseId,
            agentId,
            tenantId: request.user.tenantId!,
          },
        })
      );
      return prisma.agentTestCase.update({
        where: { id: caseId },
        data: {
          ...body,
          ...(body.expectations !== undefined
            ? { expectations: asInputJson(body.expectations) }
            : {}),
        },
      });
    }
  );

  app.delete(
    "/ai-agents/:agentId/test-cases/:caseId",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      await canManage(request);
      const { agentId, caseId } = request.params as { agentId: string; caseId: string };
      assertFound(
        await prisma.agentTestCase.findFirst({
          where: {
            id: caseId,
            agentId,
            tenantId: request.user.tenantId!,
          },
        })
      );
      await prisma.agentTestCase.delete({ where: { id: caseId } });
      return { ok: true };
    }
  );

  app.get(
    "/ai-agents/:id/test-runs",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(100).default(30) })
        .parse(request.query || {});
      assertFound(
        await prisma.aiAgent.findFirst({
          where: { id, tenantId: request.user.tenantId! },
          select: { id: true },
        })
      );
      return prisma.agentTestRun.findMany({
        where: { tenantId: request.user.tenantId!, agentId: id },
        orderBy: { createdAt: "desc" },
        take: query.limit,
        include: { testCase: { select: { id: true, name: true, isRequired: true } } },
      });
    }
  );

  app.post(
    "/ai-agents/:id/test-suite/run",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const tenantId = request.user.tenantId!;
      const agent = assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId } }));
      const cases = await prisma.agentTestCase.findMany({
        where: { tenantId, agentId: id },
        orderBy: { sortOrder: "asc" },
      });

      const results: Array<{
        testCaseId: string;
        name: string;
        result: "PASS" | "FAIL" | "WARNING";
        reply?: string;
        details?: unknown;
      }> = [];
      const suiteStartedAt = new Date();
      const configFingerprint = agentConfigFingerprint(agent);

      for (const tc of cases) {
        const exp = (tc.expectations || {}) as {
          mustInclude?: string[];
          mustNotInclude?: string[];
          expectedHandoff?: boolean;
        };
        let reply = "";
        let result: "PASS" | "FAIL" | "WARNING" = "PASS";
        const details: string[] = [];
        try {
          const r = await chatWithAgent({
            tenantId,
            agentId: id,
            messages: [{ role: "user", content: tc.input }],
          });
          reply = r.content || "";
          if ("error" in r && r.error) {
            result = "FAIL";
            details.push("O provedor não concluiu a geração");
          }
        } catch (e) {
          reply = "";
        }

        const lower = reply.toLowerCase();

        for (const m of exp.mustInclude || []) {
          if (!lower.includes(m.toLowerCase())) {
            result = "FAIL";
            details.push(`Faltou mencionar: ${m}`);
          }
        }
        for (const m of exp.mustNotInclude || []) {
          if (lower.includes(m.toLowerCase())) {
            result = "FAIL";
            details.push(`Não deveria mencionar: ${m}`);
          }
        }
        if (exp.expectedHandoff) {
          const handoffish = /humano|encaminh|transfer|equipe|atendente/.test(lower);
          if (!handoffish) {
            result = result === "FAIL" ? "FAIL" : "WARNING";
            details.push("Esperava indício de handoff");
          }
        }
        if (!reply.trim()) {
          result = "FAIL";
          details.push("Resposta vazia");
        }

        await prisma.agentTestRun.create({
          data: {
            tenantId,
            agentId: id,
            testCaseId: tc.id,
            result,
            reply: reply.slice(0, 4000),
            details: asInputJson({
              checks: details,
              configFingerprint,
              suiteStartedAt: suiteStartedAt.toISOString(),
            }),
          },
        });

        results.push({
          testCaseId: tc.id,
          name: tc.name,
          result,
          reply: reply.slice(0, 500),
          details,
        });
      }

      const pass = results.filter((r) => r.result === "PASS").length;
      const fail = results.filter((r) => r.result === "FAIL").length;
      const warn = results.filter((r) => r.result === "WARNING").length;

      return {
        total: results.length,
        pass,
        fail,
        warning: warn,
        configFingerprint,
        startedAt: suiteStartedAt.toISOString(),
        results,
      };
    }
  );

  // ── Ensure v1 snapshot for published agents without versions ──
  app.post(
    "/ai-agents/:id/ensure-version",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const tenantId = request.user.tenantId!;
      const agent = assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId } }));
      const count = await prisma.agentVersion.count({ where: { agentId: id, tenantId } });
      if (count > 0) return { ok: true, skipped: true };
      await prisma.agentVersion.create({
        data: {
          tenantId,
          agentId: id,
          version: agent.currentVersion || 1,
          snapshot: asInputJson(agentSnapshot(agent)),
          changeNote: "Snapshot inicial",
          createdById: request.user.sub,
        },
      });
      return { ok: true, version: agent.currentVersion || 1 };
    }
  );

  // seed gap helper (manual)
  app.post(
    "/knowledge-gaps",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const body = z
        .object({
          question: z.string().min(5),
          agentId: z.string().optional(),
        })
        .parse(request.body);
      return recordKnowledgeGap({
        tenantId: request.user.tenantId!,
        agentId: body.agentId,
        question: body.question,
        metadata: { manual: true },
      });
    }
  );

  app.post(
    "/learning-suggestions",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const body = z
        .object({
          kind: z.string().default("knowledge"),
          title: z.string().min(1),
          content: z.string().min(1),
          agentId: z.string().optional(),
        })
        .parse(request.body);
      return recordLearningSuggestion({
        tenantId: request.user.tenantId!,
        agentId: body.agentId,
        kind: body.kind,
        title: body.title,
        content: body.content,
        source: "manual",
      });
    }
  );
}
