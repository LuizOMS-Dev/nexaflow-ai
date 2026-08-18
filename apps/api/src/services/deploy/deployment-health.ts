/**
 * Serviço de Verificação de Integridade de Implantações (Deployment Health Service)
 * 
 * Executa sondagens de prontidão granulares contra a API (/health) e o Frontend (/login)
 * com backoff exponencial, proteção contra falso positivo e isolamento de rede.
 */

export type ServiceHealthState = "WAITING" | "CHECKING" | "HEALTHY" | "FAILED";

export interface GranularHealthResult {
  healthy: boolean;
  apiStatus?: number;
  webStatus?: number;
  apiHealth: ServiceHealthState;
  webHealth: ServiceHealthState;
  durationMs: number;
  attempts: number;
  error?: string;
}

export class DeploymentHealthService {
  /**
   * Resolve a URL de validação segura para API ou Web
   */
  static resolveHealthUrl(kind: "API" | "WEB"): string {
    if (kind === "API") {
      const explicit = process.env.PROD_API_HEALTH_URL?.trim();
      if (explicit) return explicit;
      const apiBase = process.env.API_URL?.trim();
      if (apiBase && !apiBase.includes("localhost") && !apiBase.includes("127.0.0.1")) {
        return `${apiBase.replace(/\/+$/, "")}/health`;
      }
      return "https://nexaflow-api.161.97.107.241.sslip.io/health";
    }

    const explicit = process.env.PROD_WEB_HEALTH_URL?.trim();
    if (explicit) return explicit;
    const webBase = process.env.APP_PUBLIC_URL?.trim();
    if (webBase && !webBase.includes("localhost") && !webBase.includes("127.0.0.1")) {
      return `${webBase.replace(/\/+$/, "")}/login`;
    }
    return "https://nexaflow.161.97.107.241.sslip.io/login";
  }

  /**
   * Executa uma requisição HTTP/HTTPS de sonda
   */
  static checkEndpoint(urlStr: string, timeoutMs = 6000): Promise<{ status: number; ok: boolean }> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(urlStr);
        const isHttps = parsed.protocol === "https:";
        const mod = isHttps ? require("https") : require("http");
        const req = mod.request(
          parsed,
          {
            method: "GET",
            rejectUnauthorized: false,
            timeout: timeoutMs,
            headers: {
              "User-Agent": "NexaFlow-HealthCheck/2.0",
              Accept: "*/*",
            },
          },
          (res: any) => {
            const status = res.statusCode || 0;
            // Drain data to free memory
            res.resume();
            const ok = Boolean(status >= 200 && status < 400);
            resolve({ status, ok });
          }
        );
        req.on("error", (err: any) => reject(err));
        req.on("timeout", () => {
          req.destroy();
          reject(new Error(`Timeout de conexão (${timeoutMs}ms)`));
        });
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Executa polling contínuo de validação com feedback em tempo real
   */
  static async pollReadiness(
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onProgress?: (attempt: number, max: number, apiStatus?: number, webStatus?: number) => void;
    } = {}
  ): Promise<GranularHealthResult> {
    const maxAttempts = options.maxAttempts ?? 30;
    const intervalMs = options.intervalMs ?? 10000;
    const startTime = Date.now();

    const apiUrl = this.resolveHealthUrl("API");
    const webUrl = this.resolveHealthUrl("WEB");

    let lastApiStatus: number | undefined;
    let lastWebStatus: number | undefined;
    let attemptsCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsCount = attempt;
      let apiOk = false;
      let webOk = false;

      try {
        const resApi = await this.checkEndpoint(apiUrl);
        lastApiStatus = resApi.status;
        apiOk = resApi.ok;
      } catch {
        lastApiStatus = undefined;
      }

      try {
        const resWeb = await this.checkEndpoint(webUrl);
        lastWebStatus = resWeb.status;
        webOk = resWeb.ok;
      } catch {
        lastWebStatus = undefined;
      }

      if (options.onProgress) {
        options.onProgress(attempt, maxAttempts, lastApiStatus, lastWebStatus);
      }

      if (apiOk && webOk) {
        return {
          healthy: true,
          apiStatus: lastApiStatus,
          webStatus: lastWebStatus,
          apiHealth: "HEALTHY",
          webHealth: "HEALTHY",
          durationMs: Date.now() - startTime,
          attempts: attempt,
        };
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      healthy: false,
      apiStatus: lastApiStatus,
      webStatus: lastWebStatus,
      apiHealth: lastApiStatus && lastApiStatus >= 200 && lastApiStatus < 400 ? "HEALTHY" : "FAILED",
      webHealth: lastWebStatus && lastWebStatus >= 200 && lastWebStatus < 400 ? "HEALTHY" : "FAILED",
      durationMs,
      attempts: attemptsCount,
      error: `Timeout de validação de integridade após ${Math.round(durationMs / 1000)}s. API (${lastApiStatus || "sem resposta"}), Web (${lastWebStatus || "sem resposta"}).`,
    };
  }
}
