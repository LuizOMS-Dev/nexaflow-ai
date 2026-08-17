import { prisma } from "../../lib/prisma";
import { encryptSecret, decryptSecret } from "../security/crypto";

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

export type TestConnectionResult = {
  success: boolean;
  message: string;
  state: EasyPanelState;
  details?: {
    urlAccessible: boolean;
    authValid: boolean;
    projectFound: boolean;
    serviceFound: boolean;
  };
};

export class EasyPanelClient {
  private customBaseUrl?: string;
  private customToken?: string;
  private customProject?: string;
  private customService?: string;

  constructor(opts?: {
    baseUrl?: string;
    token?: string;
    projectName?: string;
    serviceName?: string;
  }) {
    this.customBaseUrl = opts?.baseUrl;
    this.customToken = opts?.token;
    this.customProject = opts?.projectName;
    this.customService = opts?.serviceName;
  }

  async getEffectiveConfig(): Promise<{
    baseUrl: string;
    token: string;
    projectName: string;
    serviceName: string;
  }> {
    try {
      const setting = await prisma.platformSetting.findUnique({
        where: { key: "easypanel_config" },
      });
      if (setting?.value && typeof setting.value === "object") {
        const v = setting.value as any;
        const decryptedToken = v.encryptedToken
          ? decryptSecret(v.encryptedToken).plain
          : "";
        if (v.url && decryptedToken) {
          return {
            baseUrl: v.url.trim().replace(/\/+$/, ""),
            token: decryptedToken.trim(),
            projectName: v.projectName || process.env.EASYPANEL_PROJECT || "i9atendimento",
            serviceName: v.serviceName || process.env.EASYPANEL_SERVICE || "nexaflow",
          };
        }
      }
    } catch {}

    return {
      baseUrl: (this.customBaseUrl || process.env.EASYPANEL_URL || "").trim().replace(/\/+$/, ""),
      token: (
        this.customToken ||
        process.env.EASYPANEL_API_TOKEN ||
        process.env.EASYPANEL_API_KEY ||
        ""
      ).trim(),
      projectName: this.customProject || process.env.EASYPANEL_PROJECT || "i9atendimento",
      serviceName: this.customService || process.env.EASYPANEL_SERVICE || "nexaflow",
    };
  }

  async isConfigured(): Promise<boolean> {
    const cfg = await this.getEffectiveConfig();
    return Boolean(cfg.baseUrl && cfg.token);
  }

  private async trpc<T = any>(
    procedure: string,
    input?: Record<string, unknown>,
    method: "GET" | "POST" = "POST",
    overrideConfig?: { baseUrl: string; token: string }
  ): Promise<T> {
    const cfg = overrideConfig || (await this.getEffectiveConfig());
    if (!cfg.baseUrl || !cfg.token) {
      throw new Error(
        "Configuração do EasyPanel incompleta no backend (URL ou Token não definidos)."
      );
    }

    const proc = procedure.replace(/^\//, "");
    const url = new URL(`${cfg.baseUrl}/api/trpc/${proc}`);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${cfg.token}`,
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
      const cleanMsg = (json?.error?.message || json?.error || text || "")
        .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, "Bearer [REDACTED]")
        .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
        .slice(0, 500);

      const err = new Error(`EasyPanel (${proc}) falhou com status ${res.status}: ${cleanMsg}`);
      (err as any).statusCode = res.status;
      throw err;
    }

    return json?.json ?? json?.result?.data?.json ?? json?.result?.data ?? json;
  }

  async checkConnection(): Promise<EasyPanelConnectionStatus> {
    const cfg = await this.getEffectiveConfig();
    if (!cfg.baseUrl || !cfg.token) {
      return {
        state: "NOT_CONFIGURED",
        connected: false,
        projectName: cfg.projectName,
        serviceName: cfg.serviceName,
        serviceType: "compose",
        hasUrl: Boolean(cfg.baseUrl),
        hasToken: Boolean(cfg.token),
        error: "Configure a integração com o EasyPanel para realizar deployments.",
      };
    }

    try {
      await this.trpc("projects.listProjects", {}, "GET", cfg);
      return {
        state: "CONNECTED",
        connected: true,
        url: cfg.baseUrl,
        projectName: cfg.projectName,
        serviceName: cfg.serviceName,
        serviceType: "compose",
        hasUrl: true,
        hasToken: true,
      };
    } catch (e: any) {
      const isAuth =
        e?.statusCode === 401 ||
        e?.statusCode === 403 ||
        /unauthorized|auth|forbidden/i.test(e?.message || "");

      return {
        state: isAuth ? "AUTH_FAILED" : "UNAVAILABLE",
        connected: false,
        url: cfg.baseUrl,
        projectName: cfg.projectName,
        serviceName: cfg.serviceName,
        serviceType: "compose",
        hasUrl: true,
        hasToken: true,
        error: isAuth
          ? "Token inválido ou sem permissão."
          : "URL do EasyPanel inacessível.",
      };
    }
  }

  /**
   * Teste granular e real de conexão com EasyPanel
   */
  async testConnection(input: {
    url: string;
    token?: string;
    projectName: string;
    serviceName: string;
  }): Promise<TestConnectionResult> {
    const cleanUrl = input.url.trim().replace(/\/+$/, "");
    let token = (input.token || "").trim();

    if (!token) {
      const current = await this.getEffectiveConfig();
      token = current.token;
    }

    if (!cleanUrl) {
      return {
        success: false,
        state: "NOT_CONFIGURED",
        message: "URL do EasyPanel não fornecida.",
      };
    }

    if (!token) {
      return {
        success: false,
        state: "NOT_CONFIGURED",
        message: "Token de API do EasyPanel não fornecido.",
      };
    }

    const testConfig = { baseUrl: cleanUrl, token };

    // 1. Testa URL e Autenticação via listProjects
    let projects: any[] = [];
    try {
      const res = await this.trpc("projects.listProjects", {}, "GET", testConfig);
      projects = Array.isArray(res) ? res : res?.json || [];
    } catch (e: any) {
      const isAuth =
        e?.statusCode === 401 ||
        e?.statusCode === 403 ||
        /unauthorized|auth|forbidden/i.test(e?.message || "");
      if (isAuth) {
        return {
          success: false,
          state: "AUTH_FAILED",
          message: "Token inválido ou sem permissão.",
          details: { urlAccessible: true, authValid: false, projectFound: false, serviceFound: false },
        };
      }
      return {
        success: false,
        state: "UNAVAILABLE",
        message: "URL do EasyPanel inacessível.",
        details: { urlAccessible: false, authValid: false, projectFound: false, serviceFound: false },
      };
    }

    // 2. Valida Projeto
    const projectFound = projects.some(
      (p: any) => (p?.name || "").toLowerCase() === input.projectName.toLowerCase()
    );

    if (!projectFound) {
      return {
        success: false,
        state: "UNAVAILABLE",
        message: `Projeto '${input.projectName}' não encontrado no EasyPanel.`,
        details: { urlAccessible: true, authValid: true, projectFound: false, serviceFound: false },
      };
    }

    // 3. Valida Serviço Compose
    try {
      await this.trpc(
        "services.compose.inspectService",
        { projectName: input.projectName, serviceName: input.serviceName },
        "POST",
        testConfig
      );
    } catch (e: any) {
      return {
        success: false,
        state: "UNAVAILABLE",
        message: `Serviço '${input.serviceName}' não encontrado no projeto '${input.projectName}'.`,
        details: { urlAccessible: true, authValid: true, projectFound: true, serviceFound: false },
      };
    }

    return {
      success: true,
      state: "CONNECTED",
      message: "Conexão estabelecida com sucesso!",
      details: { urlAccessible: true, authValid: true, projectFound: true, serviceFound: true },
    };
  }

  /**
   * Salva as configurações de forma segura e criptografada
   */
  async saveConfig(input: {
    url: string;
    token?: string;
    projectName: string;
    serviceName: string;
  }) {
    const cleanUrl = input.url.trim().replace(/\/+$/, "");
    let token = (input.token || "").trim();

    if (!token) {
      const current = await this.getEffectiveConfig();
      token = current.token;
    }

    const encryptedToken = token ? encryptSecret(token) : null;

    await prisma.platformSetting.upsert({
      where: { key: "easypanel_config" },
      create: {
        key: "easypanel_config",
        value: {
          url: cleanUrl,
          projectName: input.projectName.trim(),
          serviceName: input.serviceName.trim(),
          encryptedToken,
          updatedAt: new Date().toISOString(),
        },
      },
      update: {
        value: {
          url: cleanUrl,
          projectName: input.projectName.trim(),
          serviceName: input.serviceName.trim(),
          encryptedToken,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true };
  }

  async inspectService(projectName?: string, serviceName?: string) {
    const cfg = await this.getEffectiveConfig();
    return this.trpc(
      "services.compose.inspectService",
      {
        projectName: projectName || cfg.projectName,
        serviceName: serviceName || cfg.serviceName,
      },
      "POST"
    );
  }

  async deployService(projectName?: string, serviceName?: string) {
    const cfg = await this.getEffectiveConfig();
    return this.trpc(
      "services.compose.deployService",
      {
        projectName: projectName || cfg.projectName,
        serviceName: serviceName || cfg.serviceName,
      },
      "POST"
    );
  }

  async restartService(projectName?: string, serviceName?: string) {
    const cfg = await this.getEffectiveConfig();
    return this.trpc(
      "services.compose.restartService",
      {
        projectName: projectName || cfg.projectName,
        serviceName: serviceName || cfg.serviceName,
      },
      "POST"
    );
  }
}

export const easyPanelClient = new EasyPanelClient();
