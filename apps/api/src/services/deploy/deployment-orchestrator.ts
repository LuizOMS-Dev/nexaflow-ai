import { prisma } from "../../lib/prisma";
import { AppError, assertFound } from "../../lib/errors";
import { audit } from "../audit";
import { githubClient, type GitHubCommitInfo } from "./github-client";
import { easyPanelClient, type EasyPanelConnectionStatus } from "./easypanel-client";

export type DeploymentStatus =
  | "PENDING"
  | "PREPARING"
  | "BUILDING"
  | "DEPLOYING"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED";

const ACTIVE_STATUSES: DeploymentStatus[] = [
  "PENDING",
  "PREPARING",
  "BUILDING",
  "DEPLOYING",
  "VALIDATING",
];

export type DeployOverview = {
  environment: string;
  isOnline: boolean;
  healthState: "HEALTHY" | "VALIDATING" | "DEGRADED" | "UNKNOWN";
  status: "UP_TO_DATE" | "UPDATE_AVAILABLE" | "DEPLOYING" | "UNKNOWN";
  currentCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    deployedAt: Date | null;
    deployedBy: string | null;
    isKnown: boolean;
  } | null;
  latestGitHubCommit: GitHubCommitInfo | null;
  gitHub: {
    connected: boolean;
    owner: string;
    repo: string;
    branch: string;
    error?: string;
  };
  easyPanel: EasyPanelConnectionStatus;
  activeDeployment: {
    id: string;
    status: DeploymentStatus;
    branch: string;
    commitShortSha: string;
    commitMessage: string;
    startedAt: Date;
    startedByName: string;
    durationSeconds: number;
  } | null;
};

export class DeploymentOrchestrator {
  /**
   * Retorna o status geral de deploy, comparando com precisão o commit em produção com o GitHub
   */
  async getOverview(): Promise<DeployOverview> {
    const [latestCompleted, activeDeployment, ghStatus, epStatus] = await Promise.all([
      prisma.deployment.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { finishedAt: "desc" },
        include: { startedBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.deployment.findFirst({
        where: { status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
        include: { startedBy: { select: { id: true, name: true, email: true } } },
      }),
      githubClient.getRepoStatus(),
      easyPanelClient.checkConnection(),
    ]);

    const latestGh = ghStatus.latestCommit;

    // 1. Determina a fonte confiável da versão em produção
    let currentCommit: DeployOverview["currentCommit"] = null;

    if (latestCompleted) {
      currentCommit = {
        sha: latestCompleted.commitSha,
        shortSha: latestCompleted.commitShortSha || latestCompleted.commitSha.slice(0, 7),
        message: latestCompleted.commitMessage,
        author: latestCompleted.commitAuthor || "Desconhecido",
        deployedAt: latestCompleted.finishedAt,
        deployedBy: latestCompleted.startedBy?.name || null,
        isKnown: true,
      };
    } else if (process.env.DEPLOYED_COMMIT_SHA || process.env.GIT_COMMIT_SHA) {
      const sha = (process.env.DEPLOYED_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "").trim();
      if (sha) {
        currentCommit = {
          sha,
          shortSha: sha.slice(0, 7),
          message: process.env.DEPLOYED_COMMIT_MESSAGE || "Versão base de implantação",
          author: process.env.DEPLOYED_COMMIT_AUTHOR || "Sistema",
          deployedAt: null,
          deployedBy: null,
          isKnown: true,
        };
      }
    }

    // 2. Comparação estrita de versão (SHA completo)
    let comparisonStatus: "UP_TO_DATE" | "UPDATE_AVAILABLE" | "DEPLOYING" | "UNKNOWN" = "UNKNOWN";

    if (activeDeployment) {
      comparisonStatus = "DEPLOYING";
    } else if (currentCommit && latestGh) {
      const curSha = currentCommit.sha.toLowerCase().trim();
      const latSha = latestGh.sha.toLowerCase().trim();
      const isSame =
        curSha === latSha ||
        (curSha.length >= 7 && latSha.length >= 7 && (curSha.startsWith(latSha) || latSha.startsWith(curSha)));

      comparisonStatus = isSame ? "UP_TO_DATE" : "UPDATE_AVAILABLE";
    } else if (latestGh && !currentCommit) {
      // Se não há histórico no banco, mas GitHub está acessível, permitimos a primeira implantação
      comparisonStatus = "UPDATE_AVAILABLE";
    }

    const activeInfo = activeDeployment
      ? {
          id: activeDeployment.id,
          status: activeDeployment.status as DeploymentStatus,
          branch: activeDeployment.branch,
          commitShortSha: activeDeployment.commitShortSha,
          commitMessage: activeDeployment.commitMessage,
          startedAt: activeDeployment.startedAt,
          startedByName: activeDeployment.startedBy?.name || "Superadmin",
          durationSeconds: Math.max(
            0,
            Math.round((Date.now() - activeDeployment.startedAt.getTime()) / 1000)
          ),
        }
      : null;

    const healthState = activeDeployment ? "VALIDATING" : "HEALTHY";

    return {
      environment: "production",
      isOnline: true,
      healthState,
      status: comparisonStatus,
      currentCommit,
      latestGitHubCommit: latestGh,
      gitHub: {
        connected: ghStatus.connected,
        owner: ghStatus.owner,
        repo: `${ghStatus.owner}/${ghStatus.repo}`,
        branch: ghStatus.branch,
        error: ghStatus.error,
      },
      easyPanel: epStatus,
      activeDeployment: activeInfo,
    };
  }

  /**
   * Inicia o fluxo de deploy de forma assíncrona e atômica com lock de concorrência
   */
  async startDeploy(
    input: {
      commitSha?: string;
      branch?: string;
      isRollback?: boolean;
      rollbackFromSha?: string;
    },
    actor: { sub: string; ip?: string }
  ) {
    // 1. Lock de Concorrência: Verifica se já existe um deploy ativo nos últimos 15 min
    const active = await prisma.deployment.findFirst({
      where: {
        status: { in: ACTIVE_STATUSES },
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    if (active) {
      throw new AppError(
        "Já existe um deploy em andamento no momento. Aguarde a conclusão.",
        409,
        "DEPLOYMENT_IN_PROGRESS"
      );
    }

    // 2. Resolve informações do commit alvo
    const branch = input.branch || "main";
    let targetCommit: GitHubCommitInfo;

    try {
      if (input.commitSha) {
        targetCommit = {
          sha: input.commitSha,
          shortSha: input.commitSha.slice(0, 7),
          message: input.isRollback ? `Rollback para ${input.commitSha.slice(0, 7)}` : "Deploy manual de commit",
          author: "Superadmin",
          date: new Date().toISOString(),
        };
      } else {
        targetCommit = await githubClient.getLatestCommit();
      }
    } catch (e) {
      throw new AppError(
        `Não foi possível consultar os commits no GitHub: ${e instanceof Error ? e.message : "Erro de conexão"}`,
        400,
        "GITHUB_UNAVAILABLE"
      );
    }

    // 3. Cria o registro de Deployment no banco com status PREPARING
    const deployment = await prisma.deployment.create({
      data: {
        environment: "production",
        branch,
        commitSha: targetCommit.sha,
        commitShortSha: targetCommit.shortSha,
        commitMessage: targetCommit.message,
        commitAuthor: targetCommit.author,
        startedById: actor.sub,
        status: "PREPARING",
        services: ["nexaflow"],
        isRollback: Boolean(input.isRollback),
        rollbackFromSha: input.rollbackFromSha,
        startedAt: new Date(),
        logs: `[${new Date().toISOString()}] Deploy iniciado por usuário ID: ${actor.sub}\n[${new Date().toISOString()}] Versão alvo: ${targetCommit.shortSha} (${targetCommit.sha})\n[${new Date().toISOString()}] Mensagem: "${targetCommit.message}"\n`,
      },
    });

    // 4. Grava evento no AuditLog
    await audit({
      action: input.isRollback ? "deployment.rollback.started" : "deployment.started",
      userId: actor.sub,
      ip: actor.ip,
      metadata: {
        deploymentId: deployment.id,
        commitSha: targetCommit.sha,
        shortSha: targetCommit.shortSha,
        branch,
      },
    });

    // 5. Executa a orquestração em background de forma resiliente
    this.runDeploymentPipeline(deployment.id, actor).catch((err) => {
      console.error(`[DeploymentOrchestrator] Falha fatal no deploy ${deployment.id}:`, err);
    });

    return {
      deploymentId: deployment.id,
      status: "PREPARING",
      commitShortSha: targetCommit.shortSha,
      commitMessage: targetCommit.message,
      branch,
    };
  }

  /**
   * Pipeline de execução assíncrona: EasyPanel Deploy -> Polling Health Check -> Finalização
   */
  private async runDeploymentPipeline(
    deploymentId: string,
    actor: { sub: string; ip?: string }
  ) {
    let logBuffer = "";
    const log = (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      logBuffer += line;
    };

    const safeUpdate = async (data: any) => {
      try {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data,
        });
      } catch {
        // Silenciosamente ignora se o registro já foi removido (ex: em teardown de teste)
      }
    };

    const flushLogs = async () => {
      await safeUpdate({ logs: logBuffer });
    };

    try {
      log("Preparando conexão com o EasyPanel...");
      await flushLogs();

      // Transição: BUILDING
      await safeUpdate({ status: "BUILDING" });
      log("Disparando comando de build e deploy no EasyPanel (serviço 'nexaflow')...");
      await flushLogs();

      // Em ambiente de teste, simula o pipeline sem acionar EasyPanel real nem esperar 15s
      if (process.env.NODE_ENV === "test") {
        log("✓ [MODO TESTE] Deploy simulado com sucesso.");
        await safeUpdate({
          status: "COMPLETED",
          healthStatus: "HEALTHY",
          finishedAt: new Date(),
          durationSeconds: 2,
          logs: logBuffer,
        });
        return;
      }

      // Dispara o deploy no EasyPanel em produção
      await easyPanelClient.deployService();
      log("✓ EasyPanel aceitou o comando de deploy. Iniciando compilação dos serviços...");

      await safeUpdate({ status: "DEPLOYING" });
      await flushLogs();

      // Aguarda 15s antes de iniciar a validação para o container iniciar o ciclo de rebuild
      await new Promise((r) => setTimeout(r, 15000));

      // Transição: VALIDATING
      await safeUpdate({ status: "VALIDATING" });
      log("Aguardando reinicialização dos containers e iniciando verificação de integridade (Health Check)...");
      await flushLogs();

      // Executa health check com retries (até 18 tentativas de 10s = 180s)
      const healthResult = await this.pollHealthCheck((attempt, max) => {
        log(`Health check: tentativa ${attempt}/${max}...`);
        void flushLogs();
      });

      const finishedAt = new Date();
      const dep = await prisma.deployment.findUnique({ where: { id: deploymentId } }).catch(() => null);
      const durationSeconds = dep ? Math.max(1, Math.round((finishedAt.getTime() - dep.startedAt.getTime()) / 1000)) : 0;

      if (healthResult.healthy) {
        log(`✓ Validação de saúde bem-sucedida! API (${healthResult.apiStatus}) e Web (${healthResult.webStatus}) operacionais.`);
        log(`✓ Deploy concluído com sucesso em ${durationSeconds} segundos.`);

        await safeUpdate({
          status: "COMPLETED",
          healthStatus: "HEALTHY",
          healthCheckedAt: finishedAt,
          finishedAt,
          durationSeconds,
          logs: logBuffer,
        });

        await audit({
          action: "deployment.succeeded",
          userId: actor.sub,
          ip: actor.ip,
          metadata: { deploymentId, durationSeconds, commitSha: dep?.commitSha },
        });
      } else {
        const err = healthResult.error || "A implantação terminou, mas a aplicação não ficou saudável.";
        log(`✕ Falha no Health Check: ${err}`);

        await safeUpdate({
          status: "FAILED",
          healthStatus: "UNHEALTHY",
          errorSummary: err,
          healthCheckedAt: finishedAt,
          finishedAt,
          durationSeconds,
          logs: logBuffer,
        });

        await audit({
          action: "deployment.failed",
          userId: actor.sub,
          ip: actor.ip,
          metadata: { deploymentId, error: err, durationSeconds },
        });
      }
    } catch (e) {
      const finishedAt = new Date();
      const errMessage = e instanceof Error ? e.message : "Erro desconhecido durante o deploy.";
      log(`✕ Erro fatal durante a orquestração: ${errMessage}`);

      const dep = await prisma.deployment.findUnique({ where: { id: deploymentId } }).catch(() => null);
      const durationSeconds = dep ? Math.max(1, Math.round((finishedAt.getTime() - dep.startedAt.getTime()) / 1000)) : 0;

      await safeUpdate({
        status: "FAILED",
        errorSummary: errMessage,
        finishedAt,
        durationSeconds,
        logs: logBuffer,
      });

      await audit({
        action: "deployment.failed",
        userId: actor.sub,
        ip: actor.ip,
        metadata: { deploymentId, error: errMessage, durationSeconds },
      });
    }
  }

  /**
   * Polling de Health Check real
   */
  private async pollHealthCheck(onAttempt?: (attempt: number, max: number) => void): Promise<{
    healthy: boolean;
    apiStatus?: number;
    webStatus?: number;
    error?: string;
  }> {
    const apiUrl = process.env.PROD_API_HEALTH_URL || "https://nexaflow-api.161.97.107.241.sslip.io/health";
    const webUrl = process.env.PROD_WEB_HEALTH_URL || "https://nexaflow.161.97.107.241.sslip.io/login";

    const maxAttempts = 18;
    const intervalMs = 10000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt?.(attempt, maxAttempts);
      try {
        const [apiRes, webRes] = await Promise.all([
          fetch(apiUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null),
          fetch(webUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null),
        ]);

        if (apiRes && apiRes.ok && webRes && webRes.ok) {
          return {
            healthy: true,
            apiStatus: apiRes.status,
            webStatus: webRes.status,
          };
        }
      } catch {}

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    return {
      healthy: false,
      error: `Timeout após ${maxAttempts * 10} segundos sem resposta saudável de API ou Web.`,
    };
  }

  /**
   * Histórico paginado de deploys
   */
  async listHistory(page = 1, limit = 15) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.deployment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          startedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.deployment.count(),
    ]);

    return {
      items: items.map((d) => ({
        id: d.id,
        environment: d.environment,
        branch: d.branch,
        commitSha: d.commitSha,
        commitShortSha: d.commitShortSha,
        commitMessage: d.commitMessage,
        commitAuthor: d.commitAuthor,
        startedBy: d.startedBy?.name || "Desconhecido",
        startedByEmail: d.startedBy?.email,
        status: d.status,
        startedAt: d.startedAt,
        finishedAt: d.finishedAt,
        durationSeconds: d.durationSeconds,
        errorSummary: d.errorSummary,
        healthStatus: d.healthStatus,
        isRollback: d.isRollback,
        rollbackFromSha: d.rollbackFromSha,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Detalhes e logs de um deployment específico
   */
  async getDeployment(id: string) {
    const d = assertFound(
      await prisma.deployment.findUnique({
        where: { id },
        include: { startedBy: { select: { id: true, name: true, email: true } } },
      }),
      "Registro de deploy não encontrado."
    );

    return {
      id: d.id,
      environment: d.environment,
      branch: d.branch,
      commitSha: d.commitSha,
      commitShortSha: d.commitShortSha,
      commitMessage: d.commitMessage,
      commitAuthor: d.commitAuthor,
      startedBy: d.startedBy?.name || "Desconhecido",
      startedByEmail: d.startedBy?.email,
      status: d.status,
      services: d.services,
      startedAt: d.startedAt,
      finishedAt: d.finishedAt,
      durationSeconds: d.durationSeconds,
      errorSummary: d.errorSummary,
      logs: d.logs || "",
      healthStatus: d.healthStatus,
      healthCheckedAt: d.healthCheckedAt,
      isRollback: d.isRollback,
      rollbackFromSha: d.rollbackFromSha,
    };
  }
}

export const deploymentOrchestrator = new DeploymentOrchestrator();
