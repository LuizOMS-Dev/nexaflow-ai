import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, assertFound } from "../lib/errors";
import { githubClient } from "../services/deploy/github-client";
import { easyPanelClient } from "../services/deploy/easypanel-client";
import { deploymentOrchestrator } from "../services/deploy/deployment-orchestrator";
import { audit } from "../services/audit";
import { prisma } from "../lib/prisma";

export async function adminDeployRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  // 1. Overview geral de deploy e status de conexão
  app.get("/admin/deploy/status", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return deploymentOrchestrator.getOverview();
  });

  // 2. Lista de commits recentes do GitHub
  app.get("/admin/deploy/commits", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const q = request.query as { limit?: string };
    const limit = Math.min(30, Math.max(1, Number(q.limit) || 10));
    try {
      const commits = await githubClient.listRecentCommits(limit);
      return { commits };
    } catch (e: any) {
      return {
        commits: [],
        error: e instanceof Error ? e.message : "Não foi possível carregar os commits do GitHub no momento.",
      };
    }
  });

  // 2.1 Limpar histórico visual de atualizações do GitHub no painel
  app.post("/admin/deploy/commits/clear", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    await audit({
      action: "github_updates.clear_requested",
      userId: user.sub,
      ip: request.ip,
    });

    try {
      const result = await githubClient.clearVisualHistory(user.sub, user.email);

      await audit({
        action: "github_updates.cleared",
        userId: user.sub,
        ip: request.ip,
        metadata: {
          clearedAt: result.clearedAt,
          hiddenCount: result.hiddenCount,
          lastClearedSha: result.lastClearedSha,
        },
      });

      return {
        success: true,
        message: "Histórico visual de atualizações do GitHub limpo com sucesso.",
        clearedAt: result.clearedAt,
        hiddenCount: result.hiddenCount,
      };
    } catch (e: any) {
      await audit({
        action: "github_updates.clear_failed",
        userId: user.sub,
        ip: request.ip,
        metadata: { error: e instanceof Error ? e.message : "Erro desconhecido" },
      });
      throw e;
    }
  });

  // 2.2 Sincronizar e buscar atualizações diretamente do GitHub (Bypass de cache + Refresh real)
  app.post("/admin/deploy/sync", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    if (githubClient.isRateLimited()) {
      const rateInfo = githubClient.getRateLimitInfo();
      return {
        success: false,
        rateLimited: true,
        retryAt: rateInfo.resetAt,
        count: 0,
        message: "GitHub temporariamente limitado. O NexaFlow aguardará o período indicado pelo GitHub antes de sincronizar novamente.",
      };
    }

    try {
      const commits = await githubClient.listRecentCommits(15, true);
      const latest = await githubClient.getLatestCommit(true);

      return {
        success: true,
        count: commits.length,
        latestCommit: latest,
        rateLimit: githubClient.getRateLimitInfo(),
        message:
          commits.length > 0
            ? `${commits.length} commits sincronizados com sucesso do GitHub.`
            : "Repositório sincronizado com sucesso. Nenhuma nova atualização pendente.",
      };
    } catch (e: any) {
      const isRate = githubClient.isRateLimited() || /rate limit|secondary rate/i.test(e?.message || "");
      const rateInfo = githubClient.getRateLimitInfo();
      return {
        success: false,
        rateLimited: isRate,
        retryAt: rateInfo.resetAt,
        count: 0,
        message: isRate
          ? "GitHub temporariamente limitado. O NexaFlow aguardará o período indicado pelo GitHub antes de sincronizar novamente."
          : `Não foi possível sincronizar com o GitHub: ${e instanceof Error ? e.message : "Erro desconhecido"}`,
      };
    }
  });

  // 2.3 Obter configuração atual do GitHub (WRITE-ONLY: NUNCA expor o token, preview ou caracteres)
  app.get("/admin/deploy/github/config", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    reply.header("Pragma", "no-cache");
    return githubClient.getConfigSanitized();
  });

  // 2.4 Salvar/Substituir configuração do GitHub (Criptografando o token com AES-256-GCM)
  app.post("/admin/deploy/github/config", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const bodySchema = z.object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      branch: z.string().optional(),
      token: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(request.body || {});
    if (!parsed.success) {
      throw new AppError("Parâmetros de configuração do GitHub inválidos.", 400, "INVALID_GITHUB_CONFIG");
    }

    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const hasNewToken = Boolean(parsed.data.token && parsed.data.token.trim());
    await githubClient.saveConfig(parsed.data);

    await audit({
      action: hasNewToken ? "github.token.rotated" : "github.configuration.updated",
      userId: user.sub,
      ip: request.ip,
      metadata: {
        owner: parsed.data.owner || "LuizOMS-Dev",
        repo: parsed.data.repo || "nexaflow-ai",
        branch: parsed.data.branch || "main",
        tokenRotated: hasNewToken,
      },
    });

    return { success: true, message: "Configuração do GitHub salva com sucesso." };
  });

  // 2.5 Testar conexão com o GitHub de forma real e granular
  app.post("/admin/deploy/github/test", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const bodySchema = z.object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      branch: z.string().optional(),
      token: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(request.body || {});
    if (!parsed.success) {
      throw new AppError("Parâmetros de teste inválidos.", 400, "INVALID_GITHUB_TEST_PAYLOAD");
    }

    const user = request.user;
    const result = await githubClient.testConnection(parsed.data);

    if (user) {
      await audit({
        action: "github.connection.tested",
        userId: user.sub,
        ip: request.ip,
        metadata: {
          owner: parsed.data.owner || "LuizOMS-Dev",
          repo: parsed.data.repo || "nexaflow-ai",
          branch: parsed.data.branch || "main",
          success: result.success,
          state: result.state,
          testedCustomToken: Boolean(parsed.data.token),
        },
      });
    }

    return result;
  });

  // 3. Obter configuração atual do EasyPanel (WRITE-ONLY: NUNCA expor o token, preview ou ciphertext)
  app.get("/admin/deploy/config", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    reply.header("Pragma", "no-cache");
    const cfg = await easyPanelClient.getEffectiveConfig();
    const tokenConfigured = Boolean(cfg.token);
    return {
      configured: Boolean(cfg.baseUrl && cfg.token),
      url: cfg.baseUrl,
      projectName: cfg.projectName,
      serviceName: cfg.serviceName,
      tokenConfigured,
    };
  });

  // 4. Testar conexão com o EasyPanel de forma real e granular
  app.post("/admin/deploy/config/test", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const bodySchema = z.object({
      url: z.string().min(1, "URL é obrigatória"),
      token: z.string().optional(),
      projectName: z.string().min(1, "Projeto é obrigatório"),
      serviceName: z.string().min(1, "Serviço é obrigatório"),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors[0]?.message || "Parâmetros de configuração inválidos.",
        400,
        "INVALID_CONFIG_PAYLOAD"
      );
    }

    const user = request.user;
    const result = await easyPanelClient.testConnection(parsed.data);

    if (user) {
      await audit({
        action: "easypanel.connection.tested",
        userId: user.sub,
        ip: request.ip,
        metadata: {
          url: parsed.data.url,
          projectName: parsed.data.projectName,
          serviceName: parsed.data.serviceName,
          success: result.success,
          state: result.state,
          testedCustomToken: Boolean(parsed.data.token),
        },
      });
    }

    return result;
  });

  // 5. Salvar/Substituir configuração do EasyPanel (criptografando o token em repouso)
  app.post("/admin/deploy/config", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const bodySchema = z.object({
      url: z.string().min(1, "URL é obrigatória"),
      token: z.string().optional(),
      projectName: z.string().min(1, "Projeto é obrigatório"),
      serviceName: z.string().min(1, "Serviço é obrigatório"),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors[0]?.message || "Parâmetros de configuração inválidos.",
        400,
        "INVALID_CONFIG_PAYLOAD"
      );
    }

    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const hasNewToken = Boolean(parsed.data.token && parsed.data.token.trim());
    await easyPanelClient.saveConfig(parsed.data);

    // Auditoria sem jamais registrar material de segredo
    await audit({
      action: hasNewToken ? "easypanel.token.rotated" : "easypanel.configuration.updated",
      userId: user.sub,
      ip: request.ip,
      metadata: {
        url: parsed.data.url,
        projectName: parsed.data.projectName,
        serviceName: parsed.data.serviceName,
        tokenRotated: hasNewToken,
      },
    });

    return { success: true, message: "Configuração salva com sucesso." };
  });

  // 6. Iniciar novo deploy
  app.post("/admin/deploy/start", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const bodySchema = z.object({
      commitSha: z.string().optional(),
      branch: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(request.body || {});
    if (!parsed.success) {
      throw new AppError("Parâmetros de deploy inválidos.", 400, "INVALID_DEPLOY_PAYLOAD");
    }

    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const result = await deploymentOrchestrator.startDeploy(
      {
        commitSha: parsed.data.commitSha,
        branch: parsed.data.branch,
      },
      { sub: user.sub, ip: request.ip }
    );

    return reply.status(202).send(result);
  });

  // 7. Histórico de deploys paginado
  app.get("/admin/deploy/history", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const q = request.query as { page?: string; limit?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 15));
    return deploymentOrchestrator.listHistory(page, limit);
  });

  // 7.1 Limpar histórico de deploys (apenas finalizados) com auditoria específica
  app.post("/admin/deploy/history/clear", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    await audit({
      action: "deployment_history.clear_requested",
      userId: user.sub,
      ip: request.ip,
    });

    try {
      const result = await deploymentOrchestrator.clearHistory(user.sub, request.ip);
      return {
        success: true,
        message: "Histórico de implantações limpo com sucesso.",
        count: result.count,
      };
    } catch (e: any) {
      await audit({
        action: "deployment_history.clear_failed",
        userId: user.sub,
        ip: request.ip,
        metadata: { error: e instanceof Error ? e.message : "Erro desconhecido" },
      });
      throw e;
    }
  });

  // 8. Detalhes e logs de um deployment específico (com suporte a cursor incremental)
  app.get("/admin/deploy/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const params = request.params as { id: string };
    const query = request.query as { offset?: string };
    const offset = query.offset ? Math.max(0, parseInt(query.offset, 10) || 0) : 0;
    return deploymentOrchestrator.getDeployment(params.id, offset);
  });

  // 9. Rollback para uma versão anterior bem-sucedida
  app.post("/admin/deploy/:id/rollback", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const params = request.params as { id: string };
    const target = assertFound(
      await prisma.deployment.findUnique({ where: { id: params.id } }),
      "A versão selecionada não está disponível para restauração."
    );

    if (target.status !== "COMPLETED") {
      throw new AppError(
        "A versão selecionada não está disponível para restauração.",
        400,
        "INVALID_ROLLBACK_TARGET"
      );
    }

    // Registra audit log específico da solicitação de reversão
    await audit({
      action: "deployment.rollback_requested",
      userId: user.sub,
      ip: request.ip,
      metadata: {
        targetDeploymentId: target.id,
        commitSha: target.commitSha,
        shortSha: target.commitShortSha,
      },
    });

    const result = await deploymentOrchestrator.startDeploy(
      {
        commitSha: target.commitSha,
        commitMessage: target.commitMessage ? `Reversão para ${target.commitShortSha}: ${target.commitMessage}` : `Reversão para versão ${target.commitShortSha}`,
        commitAuthor: target.commitAuthor || "Superadmin",
        branch: target.branch,
        isRollback: true,
        rollbackFromSha: target.commitSha,
      },
      { sub: user.sub, ip: request.ip }
    );

    return reply.status(202).send(result);
  });
}
