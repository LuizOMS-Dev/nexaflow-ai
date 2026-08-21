import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError, assertFound } from "../lib/errors";
import { env, isWaGatewayReady } from "../lib/env";
import {
  asConfig,
  getConnector,
  ingestInboundMessage,
  ingestExternalOutboundMessage,
  parseWahaWebhook,
  type WhatsAppProvider,
} from "../services/whatsapp";
import { normalizeQrInput } from "../services/qrcode";
import { resolveWhatsAppQr } from "../services/whatsapp/qr";
import { isTrueSuperadmin } from "../services/security/rbac";
import { registerBaileysInboundIngest } from "../services/whatsapp/baileys-inbound";

/** URL que o browser usa (localhost / domínio público) */
function publicApiUrl() {
  return process.env.API_URL || `http://localhost:${env.port}`;
}

/**
 * URL interna para webhooks entre containers Docker.
 * WAHA (container) deve chamar a API por nome de serviço, não localhost.
 */
function webhookBaseUrl() {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.API_URL ||
    `http://localhost:${env.port}`
  );
}

function sanitizeChannel(ch: {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  externalId: string | null;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
}) {
  const config = asConfig(ch.config);
  // Nunca devolve apiKey/baseUrl do gateway para o cliente
  return {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    isActive: ch.isActive,
    externalId: ch.externalId,
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
    config: {
      provider: config.provider,
      status: config.status,
      phone: config.phone || null,
      qrcode: config.qrcode || null,
      qrUpdatedAt: config.qrUpdatedAt || null,
      lastError: config.lastError || null,
      mode: config.mode || "platform",
      riskAcknowledged: Boolean(config.riskAcknowledged),
    },
  };
}

export async function whatsappRoutes(app: FastifyInstance) {
  registerBaileysInboundIngest();
  /**
   * Fonte única de verdade — status operacional do WhatsApp do tenant.
   * Não expõe credenciais / session keys.
   */
  app.get("/whatsapp/status", { preHandler: [app.requireTenant] }, async (request) => {
    const { hasPermission } = await import("../services/security/permissions");
    const u = request.user;
    const can =
      hasPermission(u.role, u.platformRole, "channels.manage", { impersonating: Boolean(u.imp) }) ||
      hasPermission(u.role, u.platformRole, "reports.read", { impersonating: Boolean(u.imp) }) ||
      hasPermission(u.role, u.platformRole, "conversations.read", {
        impersonating: Boolean(u.imp),
      });
    if (!can) throw new AppError("Sem permissão", 403, "FORBIDDEN");

    const { getTenantWhatsAppStatus } = await import("../services/whatsapp/connection-status");
    // probe=0 desliga consulta ao gateway; padrão = auto (Evolution/WAHA com probe leve)
    const q = (request.query as { probe?: string })?.probe;
    const probe = q === "0" ? false : q === "1" ? true : undefined;
    return getTenantWhatsAppStatus(request.user.tenantId!, { probe });
  });

  /**
   * Diagnóstico operacional (sem secrets / session keys).
   */
  app.get(
    "/whatsapp/channels/:id/diagnostics",
    { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] },
    async (request) => {
      const { id } = request.params as { id: string };
      const channel = assertFound(
        await prisma.channel.findFirst({
          where: { id, tenantId: request.user.tenantId!, type: "WHATSAPP" },
        })
      );
      const config = asConfig(channel.config);
      const instanceName = String(config.instanceName || config.session || "");
      const { getSessionDiagnostics } = await import("../services/whatsapp/baileys-manager");
      const { getDispatchMetrics } = await import("../services/whatsapp/message-dispatch");
      const diag = instanceName
        ? getSessionDiagnostics(instanceName)
        : {
            instanceName: "",
            status: "close" as const,
            health: "DOWN" as const,
            connected: false,
            hasPersistedAuth: false,
            phone: null,
            reconnectCount24h: 0,
            lastError: "Sem instanceName",
            uptimeSeconds: null,
            lastActivityAt: null,
          };

      return {
        channelId: channel.id,
        name: channel.name,
        provider: config.provider || "baileys",
        // ações distintas (documentação para UI)
        actions: {
          reconnect: "Recria socket mantendo credenciais",
          disconnectSocket: "Encerra socket sem logout no aparelho",
          logout: "Logout real no WhatsApp (exige novo QR)",
          removeChannel: "Remove canal do tenant",
        },
        diagnostics: {
          ...diag,
          // nunca retorna paths de auth, keys, tokens
          queue: getDispatchMetrics(),
        },
      };
    }
  );

  /**
   * Status do gateway da plataforma (se o servidor está pronto)
   */
  app.get("/whatsapp/gateway", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async () => {
    const ready = isWaGatewayReady();
    const isNative = env.waGatewayProvider === "baileys";
    return {
      ready,
      provider: env.waGatewayProvider,
      mode: "platform",
      message: ready
        ? isNative
          ? "WhatsApp nativo ativo. Clique em Conectar e escaneie o QR no celular."
          : "Gateway WhatsApp da plataforma ativo. Clientes só precisam escanear o QR."
        : "Gateway não configurado. Defina WA_GATEWAY_PROVIDER=baileys ou WA_GATEWAY_URL.",
      // não expõe URL/key
      configured: ready,
    };
  });

  app.get("/whatsapp/channels", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    const channels = await prisma.channel.findMany({
      where: { tenantId: request.user.tenantId!, type: "WHATSAPP" },
      orderBy: { createdAt: "desc" },
    });
    return channels.map(sanitizeChannel);
  });

  /**
   * Conectar WhatsApp — fluxo SaaS:
   * - Usa Evolution/WAHA CENTRAL do servidor NexaFlow
   * - Cliente só clica e escaneia QR (não coloca API)
   */
  app.post("/whatsapp/connect", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && !isTrueSuperadmin(request.user)) {
      throw new AppError("Sem permissão", 403);
    }

    const body = z
      .object({
        name: z.string().min(2).default("WhatsApp"),
        /** Só superadmin / avançado: forçar provedor próprio */
        mode: z.enum(["platform", "custom", "simulated"]).default("platform"),
        customBaseUrl: z.string().url().optional(),
        customApiKey: z.string().optional(),
        customProvider: z.enum(["waha", "baileys"]).optional(),
        riskAcknowledged: z.boolean().default(true),
      })
      .parse(request.body || {});

    const tenantId = request.user.tenantId!;

    // Resolve onde criar a instância
    let provider: WhatsAppProvider = "simulated";
    let baseUrl = "";
    let apiKey = "";
    let mode: "platform" | "custom" | "simulated" = body.mode;

    if (body.mode === "simulated" || env.waGatewayProvider === "simulated") {
      provider = "simulated";
      mode = "simulated";
    } else if (body.mode === "custom") {
      // Avançado: cliente traz o próprio servidor (opcional)
      if (request.user.role !== "ADMIN" && !isTrueSuperadmin(request.user)) {
        throw new AppError("Sem permissão para gateway próprio", 403);
      }
      if (!body.customBaseUrl || !body.customProvider) {
        throw new AppError("Informe URL e provedor do gateway próprio", 400);
      }
      if (!body.riskAcknowledged) {
        throw new AppError("Aceite os riscos do conector não oficial", 400, "RISK_REQUIRED");
      }
      provider = body.customProvider;
      baseUrl = body.customBaseUrl;
      apiKey = body.customApiKey || "";
      mode = "custom";
    } else {
      // PADRÃO: gateway central da plataforma (Baileys nativo ou WAHA)
      if (!isWaGatewayReady()) {
        // fallback amigável para dev sem gateway
        if (process.env.NODE_ENV !== "production") {
          provider = "simulated";
          mode = "simulated";
        } else {
          throw new AppError(
            "WhatsApp da plataforma indisponível no momento. Contate o suporte.",
            503,
            "GATEWAY_UNAVAILABLE"
          );
        }
      } else if (env.waGatewayProvider === "baileys") {
        provider = "baileys";
        baseUrl = "";
        apiKey = "";
        mode = "platform";
      } else {
        provider = "waha";
        baseUrl = env.waGatewayUrl;
        apiKey = env.waGatewayApiKey;
        mode = "platform";
      }
    }

    // 1 instância por canal, isolada por tenant
    const instanceName = `nf-${tenantId.slice(0, 10)}-${Date.now().toString(36)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40);

    /**
     * Reconexão: se existe canal WhatsApp inativo (desconectado), reutiliza o slot.
     * Só conta no limite canais isActive — desconectar libera, conectar de novo é livre.
     */
    const reusable = await prisma.channel.findFirst({
      where: { tenantId, type: "WHATSAPP", isActive: false },
      orderBy: { updatedAt: "desc" },
    });

    let channel;
    if (reusable) {
      const prev = asConfig(reusable.config);
      channel = await prisma.channel.update({
        where: { id: reusable.id },
        data: {
          name: body.name || reusable.name,
          isActive: true,
          externalId: instanceName,
          config: {
            provider,
            mode,
            baseUrl: mode === "simulated" ? undefined : baseUrl,
            apiKey: mode === "simulated" ? undefined : apiKey,
            instanceName,
            session: instanceName,
            riskAcknowledged: true,
            status: "connecting",
            everConnected: prev.everConnected === true,
            lastConnectedAt: prev.lastConnectedAt || null,
            qrcode: null,
            phone: null,
            lastError: null,
          },
        },
      });
    } else {
      const { assertCanAddChannel } = await import("../services/entitlements");
      await assertCanAddChannel(tenantId);

      channel = await prisma.channel.create({
        data: {
          tenantId,
          type: "WHATSAPP",
          name: body.name,
          isActive: true,
          externalId: instanceName,
          config: {
            provider,
            mode,
            baseUrl: mode === "simulated" ? undefined : baseUrl,
            apiKey: mode === "simulated" ? undefined : apiKey,
            instanceName,
            session: instanceName,
            riskAcknowledged: true,
            status: "connecting",
          },
        },
      });
    }

    // meta para alertas LOGGED_OUT / circuit breaker
    try {
      const { bindWhatsAppSessionMeta } = await import("../services/whatsapp/wa-alerts");
      bindWhatsAppSessionMeta(instanceName, {
        tenantId,
        channelId: channel.id,
        channelName: channel.name,
      });
    } catch {
      /* ignore */
    }

    const webhookUrl =
      provider === "waha"
        ? `${webhookBaseUrl()}/webhooks/waha/${channel.id}`
        : undefined;

    try {
      let activeProvider = provider;
      let activeMode = mode;
      let activeBaseUrl = baseUrl;
      let activeApiKey = apiKey;

      let nextConfig: Record<string, unknown> = {
        provider: activeProvider,
        mode: activeMode,
        instanceName,
        session: instanceName,
      };

      try {
        const connector = getConnector(activeProvider);
        nextConfig = {
          ...(await connector.createInstance({
            provider: activeProvider,
            baseUrl: activeBaseUrl,
            apiKey: activeApiKey,
            instanceName,
            session: instanceName,
            riskAcknowledged: true,
            webhookUrl,
            mode: activeMode,
          })),
        };

        try {
          const qr = await connector.getQr({
            ...nextConfig,
            baseUrl: activeBaseUrl,
            apiKey: activeApiKey,
            instanceName,
            session: instanceName,
            provider: activeProvider,
          } as never);
          if (qr.qrcode) nextConfig.qrcode = qr.qrcode;
          if (qr.state) nextConfig.status = qr.state;
        } catch {
          // QR pode chegar via webhook
        }
      } catch (gatewayErr) {
        // Gateway central offline → demo (dev) ou erro claro (prod)
        const msg = gatewayErr instanceof Error ? gatewayErr.message : "Gateway offline";
        if (activeMode === "platform" && process.env.NODE_ENV !== "production") {
          activeProvider = "simulated";
          activeMode = "simulated";
          activeBaseUrl = "";
          activeApiKey = "";
          nextConfig = {
            provider: "simulated",
            mode: "simulated",
            instanceName,
            session: instanceName,
            status: "open",
            phone: "simulacao",
            lastError: `Gateway offline (${msg}). Usando demonstração local.`,
          };
        } else if (activeMode === "platform") {
          throw new AppError(
            "Serviço de WhatsApp temporariamente indisponível. Tente em instantes.",
            503,
            "GATEWAY_OFFLINE"
          );
        } else {
          throw gatewayErr;
        }
      }

      let qrcode = (nextConfig.qrcode as string) || null;
      const resolved = await resolveWhatsAppQr({ existing: qrcode });
      qrcode = resolved.qrcode;

      if (activeProvider === "simulated" && !qrcode) {
        const { generateQrDataUrl } = await import("../services/qrcode");
        qrcode = await generateQrDataUrl(
          `nexaflow-demo://${instanceName}?tenant=${tenantId.slice(0, 8)}`
        );
        nextConfig.status = nextConfig.status || "open";
        nextConfig.phone = nextConfig.phone || "simulacao";
      }



      // Snapshot de status real do gateway
      let phone: string | null = null;
      let liveStatus = String(nextConfig.status || "connecting");
      try {
        const st = await getConnector(activeProvider).getStatus({
          ...nextConfig,
          provider: activeProvider,
          baseUrl: activeBaseUrl,
          apiKey: activeApiKey,
          instanceName,
        } as never);
        if (st.state) liveStatus = st.state;
        if (st.phone) phone = st.phone;
      } catch {
        /* ignore */
      }

      const updated = await prisma.channel.update({
        where: { id: channel.id },
        data: {
          isActive: true,
          config: {
            ...nextConfig,
            provider: activeProvider,
            mode: activeMode,
            baseUrl: activeMode === "simulated" ? undefined : activeBaseUrl,
            apiKey: activeMode === "simulated" ? undefined : activeApiKey,
            instanceName,
            session: instanceName,
            webhookUrl: activeMode === "simulated" ? undefined : webhookUrl,
            qrcode,
            qrSource: resolved.source,
            qrUpdatedAt: new Date().toISOString(),
            riskAcknowledged: true,
            status: liveStatus,
            phone: phone || nextConfig.phone || null,
            everConnected: liveStatus === "open" ? true : Boolean(nextConfig.everConnected),
            lastConnectedAt:
              liveStatus === "open" ? new Date().toISOString() : nextConfig.lastConnectedAt || null,
          },
          externalId: instanceName,
        },
      });

      return {
        ...sanitizeChannel(updated),
        message:
          activeMode === "platform"
            ? "Escaneie o QR com o WhatsApp da empresa. Nada de API para configurar."
            : activeMode === "simulated"
              ? "Modo demonstração: o gateway real sobe no servidor (Evolution). O cliente só vê o QR."
              : "Conexão com gateway próprio criada.",
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : "Falha ao conectar";
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          config: {
            provider,
            mode,
            instanceName,
            status: "close",
            lastError: message,
            riskAcknowledged: true,
            webhookUrl,
          },
        },
      });
      throw new AppError(message, 502, "WHATSAPP_CONNECT_FAILED");
    }
  });

  app.get("/whatsapp/channels/:id/status", { preHandler: [app.requireTenant, app.requirePermission("channels.manage")] }, async (request) => {
    const { id } = request.params as { id: string };
    const channel = assertFound(
      await prisma.channel.findFirst({
        where: { id, tenantId: request.user.tenantId!, type: "WHATSAPP" },
      })
    );

    const config = asConfig(channel.config);

    // Garante provider/credenciais do gateway platform se faltarem no config antigo
    if (config.mode === "platform" || (!config.mode && (env.waGatewayProvider === "baileys" || env.waGatewayUrl))) {
      config.provider = (config.provider || env.waGatewayProvider) as WhatsAppProvider;
      if (config.provider !== "baileys" && config.provider !== "simulated") {
        config.baseUrl = config.baseUrl || env.waGatewayUrl;
        config.apiKey = config.apiKey || env.waGatewayApiKey;
      }
    }

    if (config.provider === "simulated") {
      let qrcode = (config.qrcode as string) || null;
      if (!qrcode) {
        const { generateQrDataUrl } = await import("../services/qrcode");
        qrcode = await generateQrDataUrl(`nexaflow-demo://${config.instanceName || id}`);
      }
      return {
        state: "open",
        phone: config.phone || "simulacao",
        qrcode,
        qrExpiresIn: null,
        provider: "simulated",
        mode: config.mode || "simulated",
        secure: true,
      };
    }

    try {
      const connector = getConnector(config.provider);
      const status = await connector.getStatus(config);
      let qrcode: string | null = null;
      let qrExpiresIn: number | null = null;

      if (status.state !== "open") {
        const qr = await connector.getQr(config);
        const resolved = await resolveWhatsAppQr({
          existing: qr.qrcode || (config.qrcode as string),
        });
        qrcode = resolved.qrcode;
        qrExpiresIn = 45;
      }

      const { asInputJson } = await import("../lib/json");
      const nextConfig = {
        ...config,
        status: status.state,
        phone: status.phone || config.phone,
        qrcode,
        qrUpdatedAt: qrcode
          ? new Date().toISOString()
          : typeof config.qrUpdatedAt === "string"
            ? config.qrUpdatedAt
            : null,
        lastError: null,
      };
      await prisma.channel.update({
        where: { id },
        data: {
          config: asInputJson(nextConfig),
        },
      });

      return {
        state: status.state,
        phone: status.phone || config.phone || null,
        qrcode,
        qrExpiresIn,
        provider: config.provider,
        mode: config.mode || "platform",
        secure: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar status";
      const fallback = await normalizeQrInput((config.qrcode as string) || null);
      return {
        state: "unknown",
        phone: config.phone || null,
        qrcode: fallback.dataUrl,
        provider: config.provider,
        mode: config.mode || "platform",
        error: message,
      };
    }
  });

  /** Logout no gateway em background — nunca bloqueia o botão do painel. */
  function logoutChannelBackground(
    request: { log: { warn: (o: unknown, m: string) => void } },
    config: ReturnType<typeof asConfig>
  ) {
    const provider = String(config.provider || "simulated");
    if (provider === "simulated" || provider === "cloud_api") return;

    const cfg = {
      ...config,
      baseUrl:
        (config.baseUrl as string) ||
        (provider === "waha" || config.mode === "platform" ? env.waGatewayUrl : "") ||
        "",
      apiKey:
        (config.apiKey as string) ||
        (provider === "waha" || config.mode === "platform" ? env.waGatewayApiKey : "") ||
        "",
    };

    void Promise.race([
      getConnector(provider).logout(cfg),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]).catch((err) => {
      request.log.warn({ err }, "whatsapp logout failed (background)");
    });
  }

  app.post("/whatsapp/channels/:id/disconnect", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && !isTrueSuperadmin(request.user)) {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const channel = assertFound(
      await prisma.channel.findFirst({
        where: { id, tenantId: request.user.tenantId!, type: "WHATSAPP" },
      })
    );
    const config = asConfig(channel.config);
    // Atualiza DB primeiro; logout em background
    logoutChannelBackground(request, config);

    const nextConfig = {
      provider: config.provider || "waha",
      mode: config.mode || "platform",
      instanceName: config.instanceName,
      session: config.session || config.instanceName,
      status: "close",
      qrcode: null,
      phone: null,
      lastError: null,
      riskAcknowledged: true,
    };

    const updated = await prisma.channel.update({
      where: { id },
      data: {
        isActive: false,
        config: nextConfig as object,
      },
    });
    return sanitizeChannel(updated);
  });

  // POST remove (mais compatível com browser que DELETE)
  app.post("/whatsapp/channels/:id/remove", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    if (request.user.role !== "ADMIN" && !isTrueSuperadmin(request.user)) {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const channel = assertFound(
      await prisma.channel.findFirst({
        where: { id, tenantId: request.user.tenantId!, type: "WHATSAPP" },
      })
    );
    const config = asConfig(channel.config);
    logoutChannelBackground(request, config);

    await prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { channelId: id },
        data: { channelId: null },
      });
      await tx.channel.delete({ where: { id } });
    });

    return { ok: true };
  });

  app.delete("/whatsapp/channels/:id", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    // alias do remove
    if (request.user.role !== "ADMIN" && !isTrueSuperadmin(request.user)) {
      throw new AppError("Sem permissão", 403);
    }
    const { id } = request.params as { id: string };
    const channel = assertFound(
      await prisma.channel.findFirst({
        where: { id, tenantId: request.user.tenantId!, type: "WHATSAPP" },
      })
    );
    logoutChannelBackground(request, asConfig(channel.config));
    await prisma.$transaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { channelId: id },
        data: { channelId: null },
      });
      await tx.channel.delete({ where: { id } });
    });
    return { ok: true };
  });

  app.post("/qr/generate", { preHandler: [app.requireSection("CHANNELS"), app.requirePermission("channels.manage")] }, async (request) => {
    const body = z
      .object({
        payload: z.string().min(1).max(2048),
        width: z.number().int().min(128).max(512).optional(),
      })
      .parse(request.body);

    if (/api[_-]?key|password|secret|token\s*[:=]/i.test(body.payload)) {
      throw new AppError("Payload de QR não pode conter segredos", 400, "QR_UNSAFE_PAYLOAD");
    }

    const { generateQrDataUrl } = await import("../services/qrcode");
    const dataUrl = await generateQrDataUrl(body.payload, { width: body.width || 320 });
    return { dataUrl, expiresIn: null, engine: "qrcode" };
  });

  /**
   * Valida webhook de gateway (Evolution/WAHA).
   * Aceita: header x-api-key / apikey / Authorization Bearer
   * ou query ?apikey= iguais a WA_GATEWAY_API_KEY / config.webhookSecret.
   * Se nenhum secret global/canal estiver configurado em development, permite (homolog).
   * Em production exige secret.
   */
  function assertWebhookAuthorized(
    request: {
      headers: Record<string, unknown>;
      query?: unknown;
      ip?: string;
    },
    config: ReturnType<typeof asConfig>
  ) {
    const expected = typeof config.webhookSecret === "string" ? config.webhookSecret.trim() : "";
    if (!expected) {
      // Se não há secret configurado especificamente neste canal, aceita o webhook do gateway
      return;
    }
    const hdr = request.headers || {};
    const q = (request.query || {}) as Record<string, unknown>;
    const provided =
      (typeof hdr["x-api-key"] === "string" && hdr["x-api-key"]) ||
      (typeof hdr["apikey"] === "string" && hdr["apikey"]) ||
      (typeof hdr["authorization"] === "string" &&
        String(hdr["authorization"]).replace(/^Bearer\s+/i, "")) ||
      (typeof q.apikey === "string" && q.apikey) ||
      (typeof q.token === "string" && q.token) ||
      "";

    if (provided && provided === expected) return;
    if (env.nodeEnv !== "production") return;
    if (!provided || provided !== expected) {
      throw new AppError("Webhook não autorizado", 401, "WEBHOOK_UNAUTHORIZED");
    }
  }

  async function handleInboundWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
    channelIdParam?: string
  ) {
    const q = (request.query || {}) as Record<string, unknown>;
    const body = request.body;
    const root = (body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const payload = (root.payload || root.data || root) as Record<string, unknown>;

    const identifier =
      channelIdParam ||
      (typeof q.channelId === "string" ? q.channelId : "") ||
      (typeof root.session === "string" ? root.session : "") ||
      (typeof root.instance === "string" ? root.instance : "") ||
      (typeof root.instanceName === "string" ? root.instanceName : "") ||
      (typeof payload.session === "string" ? payload.session : "") ||
      (typeof payload.instance === "string" ? payload.instance : "") ||
      (typeof payload.instanceName === "string" ? payload.instanceName : "");

    let channel = null;
    const idTrim = (identifier || "").trim();

    if (idTrim) {
      channel = await prisma.channel.findFirst({
        where: {
          OR: [
            { id: idTrim },
            { externalId: idTrim },
            { config: { path: ["instanceName"], equals: idTrim } },
            { config: { path: ["session"], equals: idTrim } },
            { config: { path: ["phone"], equals: idTrim.replace(/\D/g, "") } },
          ],
        },
      });
    }

    if (!channel) {
      const activeChannels = await prisma.channel.findMany({
        where: { type: "WHATSAPP" },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        take: 50,
      });

      if (idTrim) {
        const target = idTrim.toLowerCase();
        for (const ch of activeChannels) {
          const cfg = asConfig(ch.config);
          const cfgInst = (cfg.instanceName || cfg.session || "")?.toString().trim().toLowerCase();
          const extId = (ch.externalId || "")?.toString().trim().toLowerCase();
          if (
            cfgInst === target ||
            extId === target ||
            (cfgInst && target.includes(cfgInst)) ||
            (extId && target.includes(extId))
          ) {
            channel = ch;
            break;
          }
        }
      }

      if (!channel) {
        const strictlyActive = activeChannels.filter((c) => c.isActive);
        if (strictlyActive.length === 1) {
          channel = strictlyActive[0];
        } else if (activeChannels.length === 1) {
          channel = activeChannels[0];
        }
      }
    }

    if (!channel) {
      request.log.warn({ identifier }, "[webhook/whatsapp] Canal não encontrado para webhook");
      return reply.code(200).send({ ok: false, warning: "CHANNEL_NOT_FOUND" });
    }

    const config = asConfig(channel.config);
    try {
      assertWebhookAuthorized(request, config);
    } catch (err) {
      if (err instanceof AppError) {
        request.log.warn({ code: err.code }, "[webhook/whatsapp] Webhook secret check failed");
        return reply.code(err.statusCode).send({ ok: false, code: err.code });
      }
      throw err;
    }

    const parsed = parseWahaWebhook(request.body);
    const { asInputJson } = await import("../lib/json");

    if (parsed.connection?.state) {
      const s = parsed.connection.state.toUpperCase();
      const state =
        s.includes("WORKING") || s.includes("OPEN")
          ? "open"
          : s.includes("SCAN") || s.includes("START")
            ? "connecting"
            : "close";
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          config: asInputJson({
            ...config,
            status: state,
            phone: parsed.connection.phone || config.phone || null,
            qrcode: state === "open" ? null : config.qrcode,
          }),
        },
      });
    }

    if (parsed.qrcode) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          config: asInputJson({
            ...config,
            qrcode: parsed.qrcode,
            qrUpdatedAt: new Date().toISOString(),
          }),
        },
      });
    }

    let processedCount = 0;
    for (const msg of parsed.messages) {
      if (msg.fromMe) {
        try {
          await ingestExternalOutboundMessage({
            tenantId: channel.tenantId,
            channelId: channel.id,
            phone: msg.phone,
            content: msg.content,
            externalId: msg.externalId,
            mediaUrl: msg.mediaUrl,
            mediaMime: msg.mediaMime,
            mediaFilename: msg.mediaFilename,
            chatId: msg.chatId,
            from: msg.from,
            remoteJid: msg.remoteJid,
            remoteJidAlt: msg.remoteJidAlt,
            addressingMode: msg.addressingMode,
            providerTimestamp: msg.providerTimestamp,
          });
          processedCount++;
        } catch (err) {
          request.log.error(
            { err, phone: msg.phone },
            "[webhook/whatsapp] Ingest de mensagem externa fromMe falhou"
          );
        }
        continue;
      }
      try {
        await ingestInboundMessage({
          tenantId: channel.tenantId,
          channelId: channel.id,
          phone: msg.phone,
          name: msg.name,
          content: msg.content,
          externalId: msg.externalId,
          mediaUrl: msg.mediaUrl,
          mediaMime: msg.mediaMime,
          mediaFilename: msg.mediaFilename,
          chatId: msg.chatId,
          from: msg.from,
          remoteJid: msg.remoteJid,
          remoteJidAlt: msg.remoteJidAlt,
          addressingMode: msg.addressingMode,
          providerTimestamp: msg.providerTimestamp,
        });
        processedCount++;
      } catch (err) {
        request.log.error(
          { err, phone: msg.phone },
          "[webhook/whatsapp] Ingest de mensagem falhou"
        );
      }
    }

    if (parsed.acks && parsed.acks.length > 0) {
      for (const ack of parsed.acks) {
        try {
          const msg = await prisma.message.findFirst({
            where: {
              externalId: ack.externalId,
              conversation: { tenantId: channel.tenantId },
            },
          });
          if (msg) {
            const currentMeta = (msg.metadata || {}) as Record<string, unknown>;
            const isFailed = ack.status === "FAILED";
            const isDelivered = ack.status === "DELIVERED";
            const isRead = ack.status === "READ";

            const updated = await prisma.message.update({
              where: { id: msg.id },
              data: {
                deliveredAt: isDelivered || isRead ? (msg.deliveredAt || new Date()) : msg.deliveredAt,
                readAt: isRead ? (msg.readAt || new Date()) : msg.readAt,
                metadata: asInputJson({
                  ...currentMeta,
                  deliveryStatus: ack.status,
                  deliveryError: isFailed ? (ack.error || "Falha reportada pelo WhatsApp") : null,
                  sendError: isFailed ? (ack.error || true) : null,
                  ackValue: ack.ack,
                  ackName: ack.ackName,
                  ackUpdatedAt: new Date().toISOString(),
                }),
              },
            });

            const { broadcastToTenant } = await import("../ws/hub");
            broadcastToTenant(channel.tenantId, "message.created", {
              conversationId: msg.conversationId,
              message: updated,
            });
          }
        } catch (err) {
          request.log.error({ err, ack }, "[webhook/whatsapp] ACK processing failed");
        }
      }
    }

    return { ok: true, processed: processedCount, acks: parsed.acks?.length || 0 };
  }

  app.post("/webhooks/waha/:channelId", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    return handleInboundWebhook(request, reply, channelId);
  });

  app.post("/webhooks/waha", async (request, reply) => {
    return handleInboundWebhook(request, reply);
  });

  app.post("/webhooks/evolution/:channelId", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    return handleInboundWebhook(request, reply, channelId);
  });

  app.post("/webhooks/evolution", async (request, reply) => {
    return handleInboundWebhook(request, reply);
  });
}
