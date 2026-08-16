export type EasyPanelState =
  | "CONNECTED"
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "UNAVAILABLE";

export type EasyPanelConnectionStatus = {
  state: EasyPanelState;
  connected: boolean;
  url?: string;
  projectName: string;
  serviceName: string;
  serviceType: string;
  hasUrl: boolean;
  hasToken: boolean;
  error?: string;
};

export class EasyPanelClient {
  private readonly baseUrl: string;
  private readonly token: string;
  public readonly defaultProject: string;
  public readonly defaultService: string;

  constructor(opts?: {
    baseUrl?: string;
    token?: string;
    projectName?: string;
    serviceName?: string;
  }) {
    this.baseUrl = (opts?.baseUrl || process.env.EASYPANEL_URL || "").trim().replace(/\/+$/, "");
    this.token = (
      opts?.token ||
      process.env.EASYPANEL_API_TOKEN ||
      process.env.EASYPANEL_API_KEY ||
      ""
    ).trim();
    this.defaultProject = opts?.projectName || process.env.EASYPANEL_PROJECT || "i9atendimento";
    this.defaultService = opts?.serviceName || process.env.EASYPANEL_SERVICE || "nexaflow";
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  private async trpc<T = any>(
    procedure: string,
    input?: Record<string, unknown>,
    method: "GET" | "POST" = "POST"
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error(
        "Configuração do EasyPanel incompleta no backend (EASYPANEL_URL ou EASYPANEL_API_TOKEN não definidos)."
      );
    }

    const proc = procedure.replace(/^\//, "");
    const url = new URL(`${this.baseUrl}/api/trpc/${proc}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    let res: Response;
    if (method === "GET") {
      if (input && Object.keys(input).length > 0) {
        url.searchParams.set("input", JSON.stringify({ json: input }));
      }
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ json: input ?? {} }),
        signal: AbortSignal.timeout(20000),
      });
    }

    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      // Sanitiza qualquer secret que possa vir na mensagem de erro do EasyPanel
      const cleanMsg = (json?.error?.message || json?.error || text || "")
        .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, "Bearer [REDACTED]")
        .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
        .slice(0, 500);

      const err = new Error(`EasyPanel (${proc}) falhou com status ${res.status}: ${cleanMsg}`);
      (err as any).statusCode = res.status;
      throw err;
    }

    return json?.result?.data?.json ?? json?.result?.data ?? json;
  }

  async checkConnection(): Promise<EasyPanelConnectionStatus> {
    if (!this.isConfigured()) {
      return {
        state: "NOT_CONFIGURED",
        connected: false,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
        hasUrl: Boolean(this.baseUrl),
        hasToken: Boolean(this.token),
        error: "Configure a integração com o EasyPanel para realizar deployments.",
      };
    }

    try {
      await this.trpc("projects.listProjects", {}, "GET");
      return {
        state: "CONNECTED",
        connected: true,
        url: this.baseUrl,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
        hasUrl: true,
        hasToken: true,
      };
    } catch (e: any) {
      const isAuth = e?.statusCode === 401 || e?.statusCode === 403 || /unauthorized|auth|forbidden/i.test(e?.message || "");
      return {
        state: isAuth ? "AUTH_FAILED" : "UNAVAILABLE",
        connected: false,
        url: this.baseUrl,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
        hasUrl: true,
        hasToken: true,
        error: isAuth
          ? "Erro de autenticação: credencial EasyPanel inválida."
          : e instanceof Error ? e.message : "Erro ao conectar com o EasyPanel",
      };
    }
  }

  async inspectService(projectName = this.defaultProject, serviceName = this.defaultService) {
    return this.trpc(
      "services.compose.inspectService",
      { projectName, serviceName },
      "POST"
    );
  }

  async deployService(projectName = this.defaultProject, serviceName = this.defaultService) {
    return this.trpc(
      "services.compose.deployService",
      { projectName, serviceName },
      "POST"
    );
  }

  async restartService(projectName = this.defaultProject, serviceName = this.defaultService) {
    return this.trpc(
      "services.compose.restartService",
      { projectName, serviceName },
      "POST"
    );
  }
}

export const easyPanelClient = new EasyPanelClient();
