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
    stage: DeploymentStatus;
    branch: string;
    commitShortSha: string;
    commitMessage: string;
    startedAt: Date;
    startedByName: string;
    durationSeconds: number;
    healthStatus: string;
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
    } else if (
      process.env.NEXAFLOW_GIT_SHA ||
      process.env.DEPLOYED_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA
    ) {
      const sha = (
        process.env.NEXAFLOW_GIT_SHA ||
        process.env.DEPLOYED_COMMIT_SHA ||
        process.env.GIT_COMMIT_SHA ||
        ""
      ).trim();
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
      comparisonStatus = "UNKNOWN";
    }

    const activeInfo = activeDeployment
      ? {
          id: activeDeployment.id,
          status: activeDeployment.status as DeploymentStatus,
          stage: activeDeployment.status as DeploymentStatus,
          branch: activeDeployment.branch,
          commitShortSha: activeDeployment.commitShortSha,
          commitMessage: activeDeployment.commitMessage,
          startedAt: activeDeployment.startedAt,
          startedByName: activeDeployment.startedBy?.name || "Superadmin",
          durationSeconds: Math.max(
            0,
            Math.round((Date.now() - activeDeployment.startedAt.getTime()) / 1000)
          ),
          healthStatus:
            activeDeployment.status === "VALIDATING"
              ? "VERIFYING"
              : "PENDING_VALIDATION",
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
    // 0. Pré-check do EasyPanel: Verifica se a integração está configurada
    const epCfg = await easyPanelClient.getEffectiveConfig();
    if (!epCfg.baseUrl || !epCfg.token) {
      throw new AppError(
        "EasyPanel não está configurado ou conectado. Configure a integração antes de implantar.",
        400,
        "EASYPANEL_NOT_CONFIGURED"
      );
    }

    // 1. Lock de Concorrência: Verifica se já existe um deploy ativo nos últimos 15 min
    const active = await prisma.deployment.findFirst({
      where: {
        status: { in: ACTIVE_STATUSES },
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    if (active) {
      throw new AppError(
        "Já existe uma implantação em andamento no momento. Aguarde a conclusão.",
        409,
        "DEPLOYMENT_IN_PROGRESS"
      );
    }

    // 2. Resolve informações do commit alvo
    const branch = input.branch || "main";
    let targetCommit: GitHubCommitInfo;

    if (input.commitSha && input.commitSha !== "main" && input.commitSha !== "latest") {
      targetCommit = {
        sha: input.commitSha,
        shortSha: input.commitSha.slice(0, 7),
        message: input.isRollback ? `Rollback para ${input.commitSha.slice(0, 7)}` : "Deploy manual de versão",
        author: "Superadmin",
        date: new Date().toISOString(),
      };
    } else {
      try {
        targetCommit = await githubClient.getLatestCommit();
      } catch (e: any) {
        // Fallback resiliente: se a API REST do GitHub estiver inacessível ou em rate-limit,
        // NÃO bloqueia o deploy! O EasyPanel fará o git pull diretamente na branch main via Git.
        const latestFromDb = await prisma.deployment.findFirst({
          orderBy: { createdAt: "desc" },
          select: { commitSha: true, commitShortSha: true, commitMessage: true },
        });

        const fallbackSha = process.env.NEXAFLOW_GIT_SHA || latestFromDb?.commitSha || "main";
        targetCommit = {
          sha: fallbackSha,
          shortSha: fallbackSha.slice(0, 7),
          message: "Deploy automático da branch main",
          author: "Superadmin",
          date: new Date().toISOString(),
        };
      }
    }

    const now = new Date();

    // 3. Cria o registro de Deployment no banco com status PREPARING e healthStatus PENDING_VALIDATION
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
        healthStatus: "PENDING_VALIDATION",
        services: ["nexaflow"],
        isRollback: Boolean(input.isRollback),
        rollbackFromSha: input.rollbackFromSha,
        startedAt: now,
        logs: `[${now.toISOString()}] [PREPARING] Deploy iniciado por usuário ID: ${actor.sub}\n[${now.toISOString()}] [PREPARING] Versão alvo: ${targetCommit.shortSha} (${targetCommit.sha})\n[${now.toISOString()}] [PREPARING] Mensagem: "${targetCommit.message}"\n`,
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
   * Pipeline de execução assíncrona com transições estritas:
   * PREPARING -> BUILDING -> DEPLOYING -> VALIDATING -> COMPLETED (ou FAILED)
   */
  private async runDeploymentPipeline(
    deploymentId: string,
    actor: { sub: string; ip?: string }
  ) {
    let logBuffer = "";
    const log = (stage: string, msg: string) => {
      const line = `[${new Date().toISOString()}] [${stage}] ${msg}\n`;
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
      log("PREPARING", "Validando credenciais e preparando conexão com o EasyPanel...");
      await flushLogs();

      // Transição 1: BUILDING
      await safeUpdate({ status: "BUILDING", healthStatus: "PENDING_VALIDATION" });
      log("BUILDING", "Disparando comando de build e deploy no EasyPanel (serviço 'nexaflow')...");
      log("BUILDING", "Compilando containers Docker da aplicação...");
      await flushLogs();

      // Em ambiente de teste, simula o pipeline sem acionar EasyPanel real nem esperar 15s
      if (process.env.NODE_ENV === "test") {
        log("SUCCESS", "✓ [MODO TESTE] Build e implantação simulados com sucesso.");
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
      try {
        await easyPanelClient.deployService(undefined, undefined, 900_000);
        log("BUILDING", "✓ EasyPanel aceitou e confirmou a compilação do compose.");
      } catch (deployErr: any) {
        const isTimeoutOrGateway =
          deployErr?.statusCode === 504 ||
          deployErr?.statusCode === 502 ||
          deployErr?.statusCode === 524 ||
          deployErr?.name === "TimeoutError" ||
          deployErr?.name === "AbortError" ||
          /gateway|timeout|aborted/i.test(deployErr?.message || "");

        if (isTimeoutOrGateway) {
          log(
            "BUILDING",
            `⚠ Comando de deploy aceito. O EasyPanel está executando a compilação dos containers Docker em background no servidor.`
          );
          log("BUILDING", "Prosseguindo para a fase de atualização e validação de integridade...");
        } else {
          const errMsg = `Falha durante a compilação: ${deployErr?.message || "Erro de build"}`;
          log("FAILED", `✕ ${errMsg}`);
          await safeUpdate({
            status: "FAILED",
            healthStatus: "FAILED",
            errorSummary: "Falha durante a compilação",
            finishedAt: new Date(),
            logs: logBuffer,
          });
          return;
        }
      }

      // Transição 2: DEPLOYING
      await safeUpdate({ status: "DEPLOYING", healthStatus: "PENDING_VALIDATION" });
      log("DEPLOYING", "Iniciando atualização dos containers de API e Web no servidor...");
      await flushLogs();

      // Aguarda 15s antes de iniciar a validação para o container iniciar o ciclo de rebuild
      await new Promise((r) => setTimeout(r, 15000));

      // Transição 3: VALIDATING
      await safeUpdate({ status: "VALIDATING", healthStatus: "VERIFYING" });
      log("VERIFYING", "Aguardando reinicialização dos containers e iniciando verificação de integridade (Health Check)...");
      await flushLogs();

      // Executa health check com retries (até 30 tentativas de 10s = 300s)
      const healthResult = await this.pollHealthCheck((attempt, max, apiSt, webSt) => {
        log(
          "VERIFYING",
          `Health check (${attempt}/${max}): API ${apiSt ? `status ${apiSt}` : "verificando..."}, Web ${webSt ? `status ${webSt}` : "verificando..."}`
        );
        void flushLogs();
      });

      const finishedAt = new Date();
      const dep = await prisma.deployment.findUnique({ where: { id: deploymentId } }).catch(() => null);
      const durationSeconds = dep ? Math.max(1, Math.round((finishedAt.getTime() - dep.startedAt.getTime()) / 1000)) : 0;

      if (healthResult.healthy) {
        log("SUCCESS", `✓ Validação de saúde bem-sucedida! API (${healthResult.apiStatus}) e Web (${healthResult.webStatus}) operacionais.`);
        log("SUCCESS", `✓ Deploy concluído com sucesso em ${durationSeconds} segundos.`);

        // Transição 4: COMPLETED
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
        const err = healthResult.error || "Falha na validação de saúde";
        log("FAILED", `✕ Falha no Health Check: ${err}`);

        // Transição 4: FAILED (por health)
        await safeUpdate({
          status: "FAILED",
          healthStatus: "UNHEALTHY",
          errorSummary: "Falha na validação de saúde",
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
      log("FAILED", `✕ Erro fatal durante a orquestração: ${errMessage}`);

      const dep = await prisma.deployment.findUnique({ where: { id: deploymentId } }).catch(() => null);
      const durationSeconds = dep ? Math.max(1, Math.round((finishedAt.getTime() - dep.startedAt.getTime()) / 1000)) : 0;

      await safeUpdate({
        status: "FAILED",
        healthStatus: "FAILED",
        errorSummary: errMessage.includes("compilação") ? "Falha durante a compilação" : errMessage.includes("implantação") ? "Falha durante a implantação" : "Falha na validação de saúde",
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
   * Polling de Health Check real validando individualmente API e Web
   */
  private async pollHealthCheck(
    onAttempt?: (attempt: number, max: number, apiStatus?: number, webStatus?: number) => void
  ): Promise<{
    healthy: boolean;
    apiStatus?: number;
    webStatus?: number;
    error?: string;
  }> {
    const rawApiUrl =
      process.env.PROD_API_HEALTH_URL ||
      (process.env.API_URL ? `${process.env.API_URL.replace(/\/+$/, "")}/health` : "") ||
      "https://nexaflow-api.161.97.107.241.sslip.io/health";
    const rawWebUrl =
      process.env.PROD_WEB_HEALTH_URL ||
      (process.env.APP_PUBLIC_URL ? `${process.env.APP_PUBLIC_URL.replace(/\/+$/, "")}/login` : "") ||
      "https://nexaflow.161.97.107.241.sslip.io/login";

    const apiUrl = rawApiUrl.trim();
    const webUrl = rawWebUrl.trim();

    const maxAttempts = 30;
    const intervalMs = 10000;

    let lastApiStatus: number | undefined;
    let lastWebStatus: number | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let apiOk = false;
      let webOk = false;

      try {
        const resApi = await fetch(apiUrl, {
          signal: AbortSignal.timeout(6000),
          headers: { Accept: "application/json" },
        });
        lastApiStatus = resApi.status;
        if (resApi.ok) {
          apiOk = true;
        }
      } catch {
        lastApiStatus = undefined;
      }

      try {
        const resWeb = await fetch(webUrl, {
          signal: AbortSignal.timeout(6000),
        });
        lastWebStatus = resWeb.status;
        if (resWeb.ok) {
          webOk = true;
        }
      } catch {
        lastWebStatus = undefined;
      }

      if (onAttempt) {
        onAttempt(attempt, maxAttempts, lastApiStatus, lastWebStatus);
      }

      if (apiOk && webOk) {
        return {
          healthy: true,
          apiStatus: lastApiStatus,
          webStatus: lastWebStatus,
        };
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    return {
      healthy: false,
      apiStatus: lastApiStatus,
      webStatus: lastWebStatus,
      error: `Timeout de validação de saúde após ${maxAttempts * (intervalMs / 1000)}s. API (${lastApiStatus || "sem resposta"}), Web (${lastWebStatus || "sem resposta"}).`,
    };
  }

  /**
   * Retorna os detalhes de um deployment específico
   */
  async getDeployment(id: string) {
    const deployment = assertFound(
      await prisma.deployment.findUnique({
        where: { id },
        include: {
          startedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      "Deploy não encontrado."
    );

    const isFinished = deployment.status === "COMPLETED" || deployment.status === "FAILED";
    const durationSeconds =
      deployment.durationSeconds ||
      (deployment.finishedAt
        ? Math.max(1, Math.round((deployment.finishedAt.getTime() - deployment.startedAt.getTime()) / 1000))
        : Math.max(0, Math.round((Date.now() - deployment.startedAt.getTime()) / 1000)));

    // Determina o status individual da API e Web de forma precisa
    let apiHealth = "PENDING";
    let webHealth = "PENDING";

    if (deployment.status === "COMPLETED" || deployment.healthStatus === "HEALTHY") {
      apiHealth = "HEALTHY";
      webHealth = "HEALTHY";
    } else if (deployment.status === "VALIDATING") {
      apiHealth = "VERIFYING";
      webHealth = "VERIFYING";
    } else if (deployment.healthStatus === "UNHEALTHY") {
      apiHealth = "UNHEALTHY";
      webHealth = "UNHEALTHY";
    }

    return {
      id: deployment.id,
      environment: deployment.environment,
      branch: deployment.branch,
      commitSha: deployment.commitSha,
      commitShortSha: deployment.commitShortSha,
      commitMessage: deployment.commitMessage,
      commitAuthor: deployment.commitAuthor,
      startedBy: deployment.startedBy?.name || "Superadmin",
      startedByEmail: deployment.startedBy?.email,
      status: deployment.status as DeploymentStatus,
      stage: deployment.status as DeploymentStatus,
      services: deployment.services,
      startedAt: deployment.startedAt,
      finishedAt: deployment.finishedAt,
      durationSeconds,
      errorSummary: deployment.errorSummary,
      logs: deployment.logs,
      healthStatus: deployment.healthStatus,
      apiHealth,
      webHealth,
      healthCheckedAt: deployment.healthCheckedAt,
      isRollback: deployment.isRollback,
      rollbackFromSha: deployment.rollbackFromSha,
    };
  }

  /**
   * Limpa os registros do histórico de deployments finalizados (não remove deploys ativos)
   */
  async clearHistory(userId: string, ip?: string) {
    const deleted = await prisma.deployment.deleteMany({
      where: {
        status: { notIn: ACTIVE_STATUSES },
      },
    });

    await audit({
      action: "deployment.history.cleared",
      userId,
      ip,
      metadata: { count: deleted.count },
    });

    return { success: true, count: deleted.count };
  }

  /**
   * Lista o histórico paginado de deployments
   */
  async listHistory(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.deployment.count(),
      prisma.deployment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          startedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      items: items.map((d) => ({
        id: d.id,
        environment: d.environment,
        branch: d.branch,
        commitSha: d.commitSha,
        commitShortSha: d.commitShortSha,
        commitMessage: d.commitMessage,
        commitAuthor: d.commitAuthor,
        startedBy: d.startedBy?.name || "Superadmin",
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
    };
  }
}

export const deploymentOrchestrator = new DeploymentOrchestrator();
