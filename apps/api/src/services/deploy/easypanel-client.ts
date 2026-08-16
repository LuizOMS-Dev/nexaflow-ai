export type EasyPanelConnectionStatus = {
  connected: boolean;
  url?: string;
  projectName: string;
  serviceName: string;
  serviceType: string;
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
      throw new Error(`EasyPanel (${proc}) falhou com status ${res.status}: ${cleanMsg}`);
    }

    return json?.result?.data?.json ?? json?.result?.data ?? json;
  }

  async checkConnection(): Promise<EasyPanelConnectionStatus> {
    if (!this.isConfigured()) {
      return {
        connected: false,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
        error: "Credenciais do EasyPanel não configuradas no servidor.",
      };
    }

    try {
      await this.trpc("projects.listProjects", {}, "GET");
      return {
        connected: true,
        url: this.baseUrl,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
      };
    } catch (e) {
      return {
        connected: false,
        url: this.baseUrl,
        projectName: this.defaultProject,
        serviceName: this.defaultService,
        serviceType: "compose",
        error: e instanceof Error ? e.message : "Erro ao conectar com o EasyPanel",
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
