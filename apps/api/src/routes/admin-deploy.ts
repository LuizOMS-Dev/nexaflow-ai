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

    const result = await githubClient.clearVisualHistory(user.sub, user.email);

    await audit({
      action: "github.update_history.cleared",
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
  });

  // 2.2 Sincronizar e buscar atualizações diretamente do GitHub (Bypass de cache + Refresh real)
  app.post("/admin/deploy/sync", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    try {
      const commits = await githubClient.listRecentCommits(15, true);
      const latest = await githubClient.getLatestCommit(true);

      return {
        success: true,
        count: commits.length,
        latestCommit: latest,
        message:
          commits.length > 0
            ? `${commits.length} commits sincronizados com sucesso do GitHub.`
            : "Repositório sincronizado com sucesso. Nenhuma nova atualização pendente.",
      };
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : "Erro desconhecido ao consultar o GitHub.";
      return {
        success: false,
        count: 0,
        message: errMsg.includes("rate limit")
          ? "Limite de requisições anônimas do GitHub atingido temporariamente. Tente novamente em alguns minutos."
          : `Não foi possível sincronizar com o GitHub: ${errMsg}`,
      };
    }
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

  // 7.1 Limpar histórico de deploys (apenas finalizados)
  app.post("/admin/deploy/history/clear", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const result = await deploymentOrchestrator.clearHistory(user.sub, request.ip);
    return {
      success: true,
      message: "Histórico de implantações limpo com sucesso.",
      count: result.count,
    };
  });

  // 8. Detalhes e logs de um deployment específico
  app.get("/admin/deploy/:id", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const params = request.params as { id: string };
    return deploymentOrchestrator.getDeployment(params.id);
  });

  // 9. Rollback para uma versão anterior bem-sucedida
  app.post("/admin/deploy/:id/rollback", async (request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const params = request.params as { id: string };
    const target = assertFound(
      await prisma.deployment.findUnique({ where: { id: params.id } }),
      "Deploy alvo para rollback não encontrado."
    );

    if (target.status !== "COMPLETED") {
      throw new AppError(
        "Apenas deploys anteriores concluídos com sucesso podem ser restaurados.",
        400,
        "INVALID_ROLLBACK_TARGET"
      );
    }

    const user = request.user;
    if (!user) throw new AppError("Não autenticado.", 401, "UNAUTHORIZED");

    const result = await deploymentOrchestrator.startDeploy(
      {
        commitSha: target.commitSha,
        branch: target.branch,
        isRollback: true,
        rollbackFromSha: target.commitSha,
      },
      { sub: user.sub, ip: request.ip }
    );

    return reply.status(202).send(result);
  });
}
