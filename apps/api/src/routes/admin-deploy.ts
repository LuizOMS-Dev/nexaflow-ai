import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, assertFound } from "../lib/errors";
import { githubClient } from "../services/deploy/github-client";
import { deploymentOrchestrator } from "../services/deploy/deployment-orchestrator";
import { prisma } from "../lib/prisma";

export async function adminDeployRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireSuperadmin);

  // 1. Overview geral de deploy e status de conexão
  app.get("/admin/deploy/status", async () => {
    return deploymentOrchestrator.getOverview();
  });

  // 2. Lista de commits recentes do GitHub
  app.get("/admin/deploy/commits", async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(30, Math.max(1, Number(q.limit) || 10));
    const commits = await githubClient.listRecentCommits(limit);
    return { commits };
  });

  // 3. Iniciar novo deploy
  app.post("/admin/deploy/start", async (request, reply) => {
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

  // 4. Histórico de deploys paginado
  app.get("/admin/deploy/history", async (request) => {
    const q = request.query as { page?: string; limit?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 15));
    return deploymentOrchestrator.listHistory(page, limit);
  });

  // 5. Detalhes e logs de um deployment específico
  app.get("/admin/deploy/:id", async (request) => {
    const params = request.params as { id: string };
    return deploymentOrchestrator.getDeployment(params.id);
  });

  // 6. Rollback para uma versão anterior bem-sucedida
  app.post("/admin/deploy/:id/rollback", async (request, reply) => {
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
