import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { chatWithAgent, sanitizeAgentInstructions } from "../services/ai";
import { sanitizeAgentSecurityFromConfig } from "../services/agent-security";
import { ensureDefaultAiAgent } from "../services/ensure-default-agent";
import {
  agentConfigFingerprint,
  getAgentReadiness,
  getTenantAgentOverview,
} from "../services/agent-readiness";

export async function aiAgentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireTenant);

  app.get("/ai-agents", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      // Superadmin sem empresa: não inventa lista
      return [];
    }

    let agents = await prisma.aiAgent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    // Auto-cura: se a empresa não tem agente, cria a Ana com treino
    if (agents.length === 0) {
      await ensureDefaultAiAgent(tenantId);
      agents = await prisma.aiAgent.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
    }

    // Cura encoding UTF-8 + identidade embutida inconsistente nas instruções
    const { repairUtf8Fields, repairUtf8Text } = await import("../lib/utf8-repair");
    const textKeys = [
      "name",
      "role",
      "objective",
      "personality",
      "tone",
      "instructions",
      "restrictions",
      "greeting",
      "farewell",
    ] as const;

    const repaired = await Promise.all(
      agents.map(async (agent) => {
        const { row, changed } = repairUtf8Fields(agent, [...textKeys]);
        const greeting = repairUtf8Text(agent.greeting || "");
        const farewell = repairUtf8Text(agent.farewell || "");
        const emojiFixed =
          greeting !== (agent.greeting || "") || farewell !== (agent.farewell || "");

        const cleanedInstructions = sanitizeAgentInstructions(
          String(row.instructions || agent.instructions || ""),
          String(row.name || agent.name)
        );
        const instructionsFixed =
          cleanedInstructions !== (agent.instructions || "").trim() &&
          cleanedInstructions !== (row.instructions || "").trim();

        // Remove "nunca diga que é IA" que força mentira — política global cuida da transparência
        let restrictions = String(row.restrictions || agent.restrictions || "");
        const restClean = restrictions
          .replace(/\bNunca dizer que é robô\/IA\/bot\.?\s*/gi, "")
          .replace(/\bNunca diga que é (IA|bot|robô)[^.]*\.?\s*/gi, "")
          .trim();
        const restrictionsFixed = restClean !== (agent.restrictions || "").trim();

        if (!changed && !emojiFixed && !instructionsFixed && !restrictionsFixed) {
          return agent;
        }

        return prisma.aiAgent.update({
          where: { id: agent.id },
          data: {
            name: row.name,
            role: row.role,
            objective: row.objective,
            personality: row.personality,
            tone: row.tone,
            instructions: cleanedInstructions || String(row.instructions || ""),
            restrictions: restrictionsFixed ? restClean || null : row.restrictions,
            greeting: emojiFixed ? greeting || null : row.greeting,
            farewell: emojiFixed ? farewell || null : row.farewell,
          },
        });
      })
    );

    return repaired;
  });

  app.get(
    "/ai-agents/overview",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => getTenantAgentOverview(request.user.tenantId!)
  );

  app.get("/ai-agents/:id", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    return assertFound(
      await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );
  });

  /**
   * Importa configuração conceitual (identidade + comportamento).
   * NÃO salva agente, NÃO altera mode/tools/handoff/knowledge.
   */
  app.post(
    "/ai-agents/import-config",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      if (
        !["ADMIN", "SUPERVISOR"].includes(request.user.role || "") &&
        request.user.platformRole !== "SUPERADMIN"
      ) {
        throw new AppError("Sem permissão", 403);
      }
      const body = z
        .object({
          text: z.string().min(1).max(50_000),
          filename: z.string().max(200).optional().nullable(),
          /** agentId só para auditoria — não grava */
          agentId: z.string().optional().nullable(),
        })
        .parse(request.body);

      const {
        importAgentConfigFromText,
        mapImportToAgentFormFields,
      } = await import("../services/agent-config-import");

      // Se agentId informado, valida multi-tenant
      if (body.agentId) {
        const agent = await prisma.aiAgent.findFirst({
          where: { id: body.agentId, tenantId: request.user.tenantId! },
          select: { id: true },
        });
        if (!agent) throw new AppError("Agente não encontrado", 404);
      }

      const result = await importAgentConfigFromText({
        text: body.text,
        filename: body.filename,
      });
      const form = mapImportToAgentFormFields(result.fields);

      const { audit } = await import("../services/audit");
      await audit({
        tenantId: request.user.tenantId!,
        userId: request.user.sub,
        action: "agent.config_imported",
        entity: "ai_agent",
        entityId: body.agentId || undefined,
        metadata: {
          filename: body.filename || null,
          found: result.found,
          source: result.source,
          ignoredOperational: result.ignoredOperational,
        },
        ip: request.ip,
      });

      return {
        ...result,
        form,
        message:
          "Revise a prévia e aplique no formulário. Nada é salvo até você clicar em Salvar.",
      };
    }
  );

  app.post("/ai-agents", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { assertCanAddAgent } = await import("../services/entitlements");
    await assertCanAddAgent(request.user.tenantId!);

    const body = z
      .object({
        name: z.string().min(1),
        role: z.string().optional(),
        objective: z.string().optional(),
        personality: z.string().optional(),
        tone: z.string().optional(),
        instructions: z.string().default(""),
        restrictions: z.string().optional(),
        mode: z.enum(["SUGGEST", "APPROVE", "AUTO"]).default("SUGGEST"),
        model: z.string().default("llama-3.1-8b-instant"),
        temperature: z.number().min(0).max(2).default(0.4),
        greeting: z.string().optional(),
        farewell: z.string().optional(),
        transferRules: z.record(z.unknown()).optional(),
        tools: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    // Contexto off-topic é sempre bloqueado no system prompt da plataforma;
    // aqui só reforçamos o padrão no cadastro de qualquer agente novo.
    const defaultRestrictions =
      "Não oferecer desconto sem autorização. Não prometer prazos ou condições não cadastradas. Não confirmar pagamento sem validação. Não sair do contexto do negócio.";
    const { asInputJson } = await import("../lib/json");
    const { transferRules, tools, ...rest } = body;
    const agent = await prisma.aiAgent.create({
      data: {
        tenantId: request.user.tenantId!,
        ...rest,
        // Blindagem de plataforma: limpa instruções + não há flag para desligar segurança
        instructions: sanitizeAgentInstructions(
          body.instructions || "",
          body.name
        ),
        restrictions:
          sanitizeAgentSecurityFromConfig(body.restrictions || "") ||
          defaultRestrictions,
        transferRules: transferRules
          ? asInputJson(transferRules)
          : asInputJson({ triggers: ["humano", "nao_sabe"], destination: "queue" }),
        tools: tools
          ? asInputJson(tools)
          : asInputJson({
              allowed: [
                "consult_contact",
                "update_contact",
                "update_status",
                "set_next_action",
                "create_opportunity",
                "transfer",
              ],
              blocked: [
                "delete_contact",
                "manage_users",
                "cancel_subscription",
                "register_payment",
                "change_contract",
                "grant_discount",
              ],
            }),
      },
    });
    const { agentSnapshot } = await import("../services/agent-versioning");
    await prisma.agentVersion.create({
      data: {
        tenantId: request.user.tenantId!,
        agentId: agent.id,
        version: agent.currentVersion || 1,
        snapshot: asInputJson(agentSnapshot(agent)),
        changeNote: "Configuração inicial",
        createdById: request.user.sub,
      },
    });
    void import("../services/tenant-setup-checklist")
      .then(({ markAgentCreated }) => markAgentCreated(request.user.tenantId!))
      .catch(() => null);
    return agent;
  });

  /**
   * Teste isolado do agente — não envia mensagem real a cliente.
   * Conversação simulada em memória.
   */
  app.post(
    "/ai-agents/:id/test",
    { preHandler: [app.requirePermission("ai.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          message: z.string().min(1).max(4000),
          history: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .max(20)
            .optional(),
        })
        .parse(request.body);

      const agent = assertFound(
        await prisma.aiAgent.findFirst({
          where: { id, tenantId: request.user.tenantId! },
        })
      );

      const started = Date.now();
      const history = (body.history || []).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      }));
      history.push({ role: "user", content: body.message });

      const result = await chatWithAgent({
        tenantId: request.user.tenantId!,
        agentId: agent.id,
        messages: history,
      });

      const failed = "error" in result && Boolean(result.error);
      const passed =
        !failed &&
        Boolean(result.content?.trim()) &&
        result.provider !== "heuristic" &&
        result.model !== "heuristic";
      const fingerprint = agentConfigFingerprint(agent);
      const { asInputJson } = await import("../lib/json");
      await prisma.agentTestRun.create({
        data: {
          tenantId: request.user.tenantId!,
          agentId: agent.id,
          result: passed ? "PASS" : "FAIL",
          reply: (result.content || "").slice(0, 4000),
          details: asInputJson({
            sandbox: true,
            configFingerprint: fingerprint,
            provider: result.provider,
            model: result.model,
            durationMs: Date.now() - started,
            error: failed,
          }),
        },
      });

      return {
        sandbox: true,
        reply: result.content,
        agent: { id: agent.id, name: agent.name, mode: agent.mode, model: agent.model },
        meta: {
          durationMs: Date.now() - started,
          provider: result.provider,
          model: result.model || agent.model,
          passed,
          toolsUsed: [] as string[],
          sources: [] as string[],
          error: "error" in result ? result.error : undefined,
          note: "Ambiente isolado — nenhuma mensagem foi enviada a clientes.",
        },
      };
    }
  );

  app.patch("/ai-agents/:id", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        role: z.string().optional().nullable(),
        objective: z.string().optional().nullable(),
        personality: z.string().optional().nullable(),
        tone: z.string().optional().nullable(),
        instructions: z.string().optional(),
        restrictions: z.string().optional().nullable(),
        mode: z.enum(["SUGGEST", "APPROVE", "AUTO"]).optional(),
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        isActive: z.boolean().optional(),
        greeting: z.string().optional().nullable(),
        farewell: z.string().optional().nullable(),
        transferRules: z.record(z.unknown()).optional().nullable(),
        tools: z.record(z.unknown()).optional().nullable(),
      })
      .parse(request.body);

    const existing = assertFound(
      await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } })
    );
    const { asInputJson } = await import("../lib/json");
    const { Prisma } = await import("@prisma/client");
    const { transferRules, tools, ...rest } = body;
    const nameForSanitize = body.name ?? existing.name;
    if (typeof rest.instructions === "string") {
      rest.instructions = sanitizeAgentInstructions(rest.instructions, nameForSanitize);
    }
    if (typeof rest.restrictions === "string") {
      rest.restrictions = sanitizeAgentSecurityFromConfig(rest.restrictions) || rest.restrictions;
    }
    // Merge profundo de tools (não apagar allowed/blocked ao togglar continuousLearning)
    let nextTools: unknown = undefined;
    if (tools !== undefined) {
      if (tools === null) {
        nextTools = null;
      } else {
        const prev = (existing.tools || {}) as Record<string, unknown>;
        nextTools = { ...prev, ...tools };
      }
    }

    const prospective = {
      ...existing,
      ...rest,
      ...(transferRules !== undefined
        ? { transferRules: transferRules === null ? null : transferRules }
        : {}),
      ...(nextTools !== undefined ? { tools: nextTools } : {}),
    };
    const configChanged =
      agentConfigFingerprint(prospective) !== agentConfigFingerprint(existing);
    const nextMode = prospective.mode;
    const nextActive = body.isActive ?? existing.isActive;

    if (existing.mode === "AUTO" && existing.isActive && configChanged) {
      throw new AppError(
        "Pause o agente automático antes de alterar sua configuração.",
        409,
        "AGENT_MUST_BE_PAUSED"
      );
    }
    if (nextMode === "AUTO" && nextActive) {
      if (configChanged) {
        throw new AppError(
          "Salve o agente desativado, teste a nova configuração no sandbox e só então ative o modo automático.",
          409,
          "AGENT_TEST_REQUIRED"
        );
      }
      const readiness = await getAgentReadiness({
        tenantId: request.user.tenantId!,
        agentId: existing.id,
        agent: existing,
      });
      if (!readiness.readyForAuto) {
        const reasons = readiness.blockers.slice(0, 3).map((item) => item.label).join(", ");
        throw new AppError(
          `Agente ainda não está pronto para o modo automático: ${reasons}.`,
          409,
          "AGENT_NOT_READY"
        );
      }
    }

    if (configChanged) {
      const versionCount = await prisma.agentVersion.count({
        where: { tenantId: request.user.tenantId!, agentId: existing.id },
      });
      if (versionCount === 0) {
        const { agentSnapshot } = await import("../services/agent-versioning");
        await prisma.agentVersion.create({
          data: {
            tenantId: request.user.tenantId!,
            agentId: existing.id,
            version: existing.currentVersion || 1,
            snapshot: asInputJson(agentSnapshot(existing)),
            changeNote: "Configuração anterior à primeira revisão",
            createdById: request.user.sub,
          },
        });
      }
    }

    const updated = await prisma.aiAgent.update({
      where: { id },
      data: {
        ...rest,
        ...(transferRules !== undefined
          ? {
              transferRules:
                transferRules === null ? Prisma.DbNull : asInputJson(transferRules),
            }
          : {}),
        ...(nextTools !== undefined
          ? {
              tools:
                nextTools === null ? Prisma.DbNull : asInputJson(nextTools as object),
            }
          : {}),
      },
    });
    if (!configChanged) return updated;

    const { publishAgentVersion } = await import("../services/agent-versioning");
    await publishAgentVersion({
      tenantId: request.user.tenantId!,
      agentId: existing.id,
      userId: request.user.sub,
      changeNote: "Configuração atualizada",
    });
    return assertFound(
      await prisma.aiAgent.findFirst({
        where: { id: existing.id, tenantId: request.user.tenantId! },
      })
    );
  });

  app.delete("/ai-agents/:id", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    assertFound(await prisma.aiAgent.findFirst({ where: { id, tenantId: request.user.tenantId! } }));
    await prisma.aiAgent.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/ai-agents/:id/chat", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
          })
        ),
      })
      .parse(request.body);

    return chatWithAgent({
      tenantId: request.user.tenantId!,
      agentId: id,
      messages: body.messages,
    });
  });

  app.post("/ai-agents/interview", { preHandler: [app.requirePermission("ai.manage")] }, async (request) => {
    if (!["ADMIN", "SUPERVISOR"].includes(request.user.role || "") && request.user.platformRole !== "SUPERADMIN") {
      throw new AppError("Sem permissão", 403);
    }
    const body = z
      .object({
        businessName: z.string(),
        niche: z.string(),
        goal: z.string(),
        tone: z.string().default("profissional e amigável"),
        products: z.string().optional(),
        restrictions: z.string().optional(),
      })
      .parse(request.body);

    const instructions = `Você é o atendente da ${body.businessName}, empresa do nicho ${body.niche}.
Objetivo: ${body.goal}.
Tom de voz: ${body.tone} — humano, WhatsApp, mensagens curtas.
Produtos/serviços: ${body.products || "conforme base de conhecimento"}.
Regras: português do Brasil; use a base de conhecimento e estas instruções para preços e condições; fique no contexto do negócio; off-topic recuse de forma leve (sem falar de horário de trabalho) e volte ao atendimento.
${body.restrictions ? `Restrições extras: ${body.restrictions}` : ""}`;

    const agent = await prisma.aiAgent.create({
      data: {
        tenantId: request.user.tenantId!,
        name: `Agente ${body.niche}`,
        role: body.goal,
        objective: body.goal,
        personality: body.tone,
        tone: body.tone,
        instructions,
        restrictions: body.restrictions,
        mode: "SUGGEST",
        greeting: `Olá! Sou o assistente da ${body.businessName}. Como posso ajudar?`,
      },
    });

    void import("../services/tenant-setup-checklist")
      .then(({ markAgentCreated }) => markAgentCreated(request.user.tenantId!))
      .catch(() => null);

    return agent;
  });
}
