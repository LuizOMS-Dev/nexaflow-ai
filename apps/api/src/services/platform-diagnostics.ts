/**
 * Diagnóstico da plataforma — agrega fontes REAIS existentes.
 * Não inventa métricas. Não expõe secrets.
 */
import { prisma } from "../lib/prisma";
import { redactMetadata, redactString, maskApiKeyPrefix } from "./platform-log-redaction";

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

export async function getDiagnosticsOverview() {
  const since = dayAgo();

  const [
    audit24h,
    webhookFailed24h,
    webhookPending,
    waProblemChannels,
    aiUsage24h,
    securityEvents24h,
    apiUsage24h,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({
      where: {
        createdAt: { gte: since },
        OR: [{ success: false }, { status: { in: ["failed", "retrying"] } }],
      },
    }),
    prisma.webhookDelivery.count({
      where: { status: { in: ["pending", "retrying"] } },
    }),
    prisma.channel.count({
      where: { type: "WHATSAPP", isActive: true },
    }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: since } } }),
    prisma.securityEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.apiUsageLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  return {
    period: "24h",
    generatedAt: new Date().toISOString(),
    metrics: {
      activityEvents: audit24h,
      webhookFailures: webhookFailed24h,
      webhookPending,
      whatsappChannels: waProblemChannels,
      aiExecutions: aiUsage24h,
      securityEvents: securityEvents24h,
      apiCalls: apiUsage24h,
    },
  };
}

export async function getDiagnosticActivity(params: {
  take?: number;
  cursor?: string;
  tenantId?: string;
  q?: string;
}) {
  const take = Math.min(params.take ?? 40, 100);
  const where: Record<string, unknown> = {};
  if (params.tenantId) where.tenantId = params.tenantId;
  if (params.q) {
    where.OR = [
      { action: { contains: params.q, mode: "insensitive" } },
      { entity: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
    ...(params.cursor
      ? { skip: 1, cursor: { id: params.cursor } }
      : {}),
  });

  return {
    items: items.map((l) => ({
      id: l.id,
      timestamp: l.createdAt,
      severity: "INFO" as const,
      module: "audit",
      event: l.action,
      message: l.action,
      tenantId: l.tenantId,
      tenantName: l.tenant?.name ?? null,
      userId: l.userId,
      userName: l.user?.name ?? null,
      entity: l.entity,
      entityId: l.entityId,
      metadata: redactMetadata(l.metadata),
      ip: l.ip,
    })),
    nextCursor: items.length === take ? items[items.length - 1]?.id ?? null : null,
  };
}

export async function getDiagnosticWebhooks(params: { take?: number; tenantId?: string }) {
  const take = Math.min(params.take ?? 40, 100);
  const items = await prisma.webhookDelivery.findMany({
    where: params.tenantId ? { tenantId: params.tenantId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      endpoint: { select: { id: true, name: true, url: true, tenantId: true } },
    },
  });

  return {
    items: items.map((d) => ({
      id: d.id,
      timestamp: d.createdAt,
      severity: d.success ? ("INFO" as const) : ("ERROR" as const),
      module: "webhook",
      event: d.event,
      message: d.success
        ? `Webhook ${d.event} entregue`
        : redactString(d.error || `Webhook falhou (${d.statusCode ?? "?"})`, 200),
      tenantId: d.tenantId,
      status: d.status,
      statusCode: d.statusCode,
      attempts: d.attempts,
      durationMs: d.durationMs,
      endpointName: d.endpoint?.name ?? null,
      // nunca URL completa com secrets de query
      endpointHint: d.endpoint?.url
        ? redactString(d.endpoint.url.replace(/\?.*$/, ""), 80)
        : null,
    })),
  };
}

export async function getDiagnosticWhatsApp() {
  const channels = await prisma.channel.findMany({
    where: { type: "WHATSAPP" },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      tenantId: true,
      name: true,
      externalId: true,
      isActive: true,
      updatedAt: true,
      config: true,
      tenant: { select: { name: true } },
    },
  });

  // Status canônico por canal (sem vazar sessão/credenciais)
  const { mapRuntimeToCanonical, asConfigSafe } = await import("./whatsapp/connection-status").then(
    async () => {
      const cs = await import("./whatsapp/connection-status");
      const types = await import("./whatsapp/types");
      return {
        mapRuntimeToCanonical: cs.mapRuntimeToCanonical,
        asConfigSafe: types.asConfig,
      };
    }
  );

  return {
    items: channels.map((c) => {
      const cfg = asConfigSafe(c.config);
      const lastError =
        cfg && typeof cfg === "object" && "lastError" in cfg
          ? String((cfg as { lastError?: string }).lastError || "")
          : null;
      const runtimeState =
        cfg && typeof cfg === "object" && "status" in cfg
          ? String((cfg as { status?: string }).status || "")
          : null;
      const status = mapRuntimeToCanonical({
        hasChannel: true,
        runtimeState,
        lastError,
        liveOpen: false,
      });
      return {
        id: c.id,
        tenantId: c.tenantId,
        tenantName: c.tenant?.name ?? null,
        name: c.name,
        instanceHint: c.externalId ? String(c.externalId).slice(0, 24) : null,
        status,
        isActive: c.isActive,
        updatedAt: c.updatedAt,
        lastError: lastError ? redactString(lastError, 160) : null,
        severity:
          status === "CONNECTED"
            ? ("INFO" as const)
            : status === "RECONNECTING" || status === "CONNECTING"
              ? ("WARNING" as const)
              : status === "NOT_CONFIGURED"
                ? ("INFO" as const)
                : ("ERROR" as const),
      };
    }),
  };
}

export async function getDiagnosticAi(params: { take?: number; tenantId?: string }) {
  const take = Math.min(params.take ?? 40, 100);
  const where = params.tenantId ? { tenantId: params.tenantId } : {};
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  const [items, agg24h, byPurpose, byModel, failures1h] = await Promise.all([
    prisma.aiUsageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.aiUsageLog.aggregate({
      where: { ...where, createdAt: { gte: since24h } },
      _sum: { tokensIn: true, tokensOut: true, credits: true },
      _count: true,
    }),
    prisma.aiUsageLog.groupBy({
      by: ["purpose"],
      where: { ...where, createdAt: { gte: since24h } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true, credits: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["provider", "model"],
      where: { ...where, createdAt: { gte: since24h } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true, credits: true },
    }),
    prisma.aiUsageLog.count({
      where: {
        ...where,
        createdAt: { gte: since1h },
        OR: [
          { model: { in: ["rate_limited", "error_fallback", "offline"] } },
          { purpose: { in: ["whatsapp_rate_limit", "whatsapp_provider_error"] } },
          { provider: { in: ["rate_limited", "unstable", "error"] } },
        ],
      },
    }),
  ]);

  const groqLive = await probeGroqLiveUsage();

  return {
    summary: {
      period: "24h",
      calls: agg24h._count,
      tokensIn: agg24h._sum.tokensIn ?? 0,
      tokensOut: agg24h._sum.tokensOut ?? 0,
      tokensTotal: (agg24h._sum.tokensIn ?? 0) + (agg24h._sum.tokensOut ?? 0),
      credits: agg24h._sum.credits ?? 0,
      failuresLast1h: failures1h,
    },
    byPurpose: byPurpose
      .map((p) => ({
        purpose: p.purpose || "(sem purpose)",
        calls: p._count._all,
        tokensIn: p._sum.tokensIn ?? 0,
        tokensOut: p._sum.tokensOut ?? 0,
        credits: p._sum.credits ?? 0,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 20),
    byModel: byModel
      .map((m) => ({
        provider: m.provider || "?",
        model: m.model || "?",
        calls: m._count._all,
        tokensIn: m._sum.tokensIn ?? 0,
        tokensOut: m._sum.tokensOut ?? 0,
        credits: m._sum.credits ?? 0,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 20),
    groqLive,
    items: items.map((u) => ({
      id: u.id,
      timestamp: u.createdAt,
      severity:
        u.model === "rate_limited" || u.provider === "rate_limited"
          ? ("WARNING" as const)
          : u.model === "error_fallback" || u.provider === "error"
            ? ("ERROR" as const)
            : ("INFO" as const),
      module: "ai",
      event: u.purpose || "ai.usage",
      message: `${u.purpose || "geral"} · ${u.provider || "?"}/${u.model || "?"} · in=${u.tokensIn} out=${u.tokensOut} · cr=${u.credits}`,
      tenantId: u.tenantId,
      provider: u.provider,
      model: u.model,
      tokensIn: u.tokensIn,
      tokensOut: u.tokensOut,
      credits: u.credits,
      purpose: u.purpose,
    })),
  };
}

/**
 * Probe ao vivo no Groq: headers de rate limit (sem vazar a key).
 * 1 chamada mínima — conta no TPM; use com parcimônia.
 */
export async function probeGroqLiveUsage(): Promise<{
  ok: boolean;
  configured: boolean;
  model: string | null;
  message: string;
  limits: {
    remainingRequests: string | null;
    limitRequests: string | null;
    remainingTokens: string | null;
    limitTokens: string | null;
    resetRequests: string | null;
    resetTokens: string | null;
  } | null;
  latencyMs: number | null;
}> {
  const { env } = await import("../lib/env");
  if (env.aiProvider !== "groq" || !env.aiApiKey) {
    return {
      ok: false,
      configured: false,
      model: null,
      message: "Groq não é o provedor ativo da plataforma ou a chave não está configurada.",
      limits: null,
      latencyMs: null,
    };
  }
  const model = env.aiModel || "llama-3.1-8b-instant";
  const started = Date.now();
  try {
    const res = await fetch(`${env.aiBaseUrl || "https://api.groq.com/openai/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        temperature: 0,
        messages: [{ role: "user", content: "ok" }],
      }),
    });
    const latencyMs = Date.now() - started;
    const h = res.headers;
    const limits = {
      remainingRequests: h.get("x-ratelimit-remaining-requests"),
      limitRequests: h.get("x-ratelimit-limit-requests"),
      remainingTokens: h.get("x-ratelimit-remaining-tokens"),
      limitTokens: h.get("x-ratelimit-limit-tokens"),
      resetRequests: h.get("x-ratelimit-reset-requests"),
      resetTokens: h.get("x-ratelimit-reset-tokens"),
    };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        configured: true,
        model,
        message: `Groq HTTP ${res.status}: ${body.slice(0, 160)}`,
        limits,
        latencyMs,
      };
    }
    return {
      ok: true,
      configured: true,
      model,
      message: "Probe Groq OK — limites abaixo (headers oficiais).",
      limits,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      model,
      message: err instanceof Error ? err.message : "Falha no probe Groq",
      limits: null,
      latencyMs: Date.now() - started,
    };
  }
}

export async function getDiagnosticApi(params: { take?: number; tenantId?: string }) {
  const take = Math.min(params.take ?? 40, 100);
  const items = await prisma.apiUsageLog.findMany({
    where: params.tenantId ? { tenantId: params.tenantId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      apiKey: { select: { id: true, keyPrefix: true, name: true } },
    },
  });

  return {
    items: items.map((u) => ({
      id: u.id,
      timestamp: u.createdAt,
      severity: u.statusCode && u.statusCode >= 500 ? ("ERROR" as const) : u.statusCode && u.statusCode >= 400 ? ("WARNING" as const) : ("INFO" as const),
      module: "api",
      event: `${u.method} ${u.path}`,
      message: `${u.method} ${u.path} → ${u.statusCode ?? "?"}`,
      tenantId: u.tenantId,
      method: u.method,
      path: u.path,
      statusCode: u.statusCode,
      durationMs: u.durationMs,
      apiKeyId: u.apiKeyId,
      apiKeyHint: maskApiKeyPrefix(u.apiKey?.keyPrefix),
    })),
  };
}

export async function getDiagnosticSecurity(params: { take?: number }) {
  const take = Math.min(params.take ?? 40, 100);
  const items = await prisma.securityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    items: items.map((e) => ({
      id: e.id,
      timestamp: e.createdAt,
      severity:
        /BLOCK|FAIL|ATTACK|INJECT/i.test(e.type) ? ("WARNING" as const) : ("INFO" as const),
      module: "security",
      event: e.type,
      message: e.type,
      tenantId: e.tenantId,
      userId: e.userId,
      userName: e.user?.name ?? null,
      ip: e.ip,
      metadata: redactMetadata(e.metadata),
    })),
  };
}

export async function getPlatformHealthDetailed() {
  const { getPlatformHealth } = await import("./platform-health");
  return getPlatformHealth();
}

export type DiagnosticCheckStatus = "OK" | "WARNING" | "FAILURE" | "NOT_CONFIGURED" | "NOT_APPLICABLE";
export type DiagnosticCheckGroup = "core" | "database" | "cache" | "communications" | "ai" | "email" | "integrations";

export type DiagnosticCheckResult = {
  id: string;
  group: DiagnosticCheckGroup;
  groupLabel: string;
  title: string;
  status: DiagnosticCheckStatus;
  summary: string;
  details?: Record<string, unknown> | null;
  latencyMs?: number | null;
  checkedAt: string;
  recommendation?: string | null;
};

export type SystemDiagnosticsDTO = {
  overallStatus: "OK" | "WARNING" | "FAILURE";
  checkedAt: string;
  durationMs: number;
  summary: {
    total: number;
    ok: number;
    warning: number;
    failure: number;
    notConfigured: number;
  };
  checks: DiagnosticCheckResult[];
};

export async function runSystemDiagnostics(): Promise<SystemDiagnosticsDTO> {
  const startTime = performance.now();
  const checkedAt = new Date().toISOString();

  const { env, isWaGatewayReady } = await import("../lib/env");
  const { getAiStatus } = await import("./ai");
  const { getMailStatus } = await import("./security/mail");
  const { isRedisCritical, getRedis, shouldUseRedis } = await import("./security/redis");

  // Executa todos os checks de diagnóstico em paralelo
  const [
    coreCheck,
    dbCheck,
    redisCheck,
    waCheck,
    aiCheck,
    mailCheck,
    deployCheck,
  ] = await Promise.allSettled([
    // 1. API & Runtime
    (async (): Promise<DiagnosticCheckResult> => {
      const t0 = performance.now();
      const mem = process.memoryUsage();
      const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
      const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      const latencyMs = Math.round(performance.now() - t0);
      const uptimeSec = Math.floor(process.uptime());

      const isHighMem = heapUsedMb > 700;

      return {
        id: "core_api",
        group: "core",
        groupLabel: "Núcleo & API",
        title: "API & Processo Runtime",
        status: isHighMem ? "WARNING" : "OK",
        summary: `API ativa · Uptime: ${uptimeSec}s · Heap: ${heapUsedMb}MB / ${heapTotalMb}MB (RSS: ${rssMb}MB)`,
        details: {
          nodeVersion: process.version,
          platform: process.platform,
          uptimeSeconds: uptimeSec,
          heapUsedMb,
          heapTotalMb,
          rssMb,
          env: env.nodeEnv,
        },
        latencyMs,
        checkedAt,
        recommendation: isHighMem ? "Consumo de memória elevado no processo Node. Monitore possíveis vazamentos." : null,
      };
    })(),

    // 2. Banco de Dados PostgreSQL
    (async (): Promise<DiagnosticCheckResult> => {
      const t0 = performance.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        const latencyMs = Math.round(performance.now() - t0);
        const isSlow = latencyMs > 500;

        return {
          id: "database_postgres",
          group: "database",
          groupLabel: "Banco de Dados",
          title: "PostgreSQL & Conexão",
          status: isSlow ? "WARNING" : "OK",
          summary: isSlow
            ? `PostgreSQL conectado, mas com latência elevada (${latencyMs}ms).`
            : `PostgreSQL conectado e respondendo normalmente (${latencyMs}ms).`,
          details: {
            query: "SELECT 1",
            latencyMs,
            engine: "PostgreSQL",
            status: "CONNECTED",
          },
          latencyMs,
          checkedAt,
          recommendation: isSlow ? "Verifique gargalos de rede ou concorrência no pool de conexões do banco." : null,
        };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - t0);
        return {
          id: "database_postgres",
          group: "database",
          groupLabel: "Banco de Dados",
          title: "PostgreSQL & Conexão",
          status: "FAILURE",
          summary: "Falha de conexão com o banco de dados PostgreSQL.",
          details: {
            error: err instanceof Error ? redactString(err.message, 120) : "db_connection_error",
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: "Verifique se o container PostgreSQL está em execução e acessível.",
        };
      }
    })(),

    // 3. Redis & Cache
    (async (): Promise<DiagnosticCheckResult> => {
      const t0 = performance.now();
      const critical = isRedisCritical();

      if (!shouldUseRedis()) {
        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: "NOT_CONFIGURED",
          summary: "Redis não configurado. Sessões e rate limits operam em memória local.",
          details: {
            mode: "in-memory",
            critical,
          },
          latencyMs: null,
          checkedAt,
          recommendation: null,
        };
      }

      try {
        const redis = await getRedis();
        if (!redis) {
          return {
            id: "cache_redis",
            group: "cache",
            groupLabel: "Cache & Filas",
            title: "Redis & Cache Distribuído",
            status: critical ? "FAILURE" : "NOT_CONFIGURED",
            summary: "Não foi possível conectar ao servidor Redis.",
            details: {
              mode: "redis",
              connected: false,
            },
            latencyMs: Math.round(performance.now() - t0),
            checkedAt,
            recommendation: "Verifique a variável REDIS_URL e a conectividade com a porta do Redis.",
          };
        }

        const pong = await redis.ping();
        const latencyMs = Math.round(performance.now() - t0);
        const isSlow = latencyMs > 250;

        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: pong === "PONG" ? (isSlow ? "WARNING" : "OK") : "FAILURE",
          summary: pong === "PONG"
            ? (isSlow ? `Redis respondendo com latência elevada (${latencyMs}ms).` : `Redis conectado com sucesso (${latencyMs}ms).`)
            : "Resposta inválida ao comando PING no Redis.",
          details: {
            ping: pong,
            latencyMs,
            critical,
          },
          latencyMs,
          checkedAt,
          recommendation: isSlow ? "Verifique latência de rede entre a aplicação e o Redis." : null,
        };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - t0);
        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: critical ? "FAILURE" : "WARNING",
          summary: "Serviço Redis inacessível ou com erro.",
          details: {
            error: err instanceof Error ? redactString(err.message, 120) : "redis_error",
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: "Verifique se o serviço Redis está ativo na infraestrutura.",
        };
      }
    })(),

    // 4. WhatsApp Gateway
    (async (): Promise<DiagnosticCheckResult> => {
      const t0 = performance.now();
      const provider = env.waGatewayProvider || "baileys";

      if (provider === "simulated" || provider === "baileys") {
        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: "OK",
          summary: provider === "baileys"
            ? "Gateway Baileys embutido ativo com persistência de sessões."
            : "Gateway simulado ativo para desenvolvimento/testes.",
          details: {
            provider,
            mode: "embedded",
            ready: true,
          },
          latencyMs: 1,
          checkedAt,
          recommendation: null,
        };
      }

      if (!isWaGatewayReady() || !env.waGatewayUrl) {
        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: "NOT_CONFIGURED",
          summary: "URL do gateway WhatsApp não configurada.",
          details: {
            provider,
            ready: false,
          },
          latencyMs: null,
          checkedAt,
          recommendation: "Configure WA_GATEWAY_URL para habilitar o envio via Evolution/WAHA.",
        };
      }

      try {
        const cleanUrl = env.waGatewayUrl.replace(/\/+$/, "");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${cleanUrl}/health`, {
          method: "GET",
          signal: controller.signal,
          headers: env.waGatewayApiKey ? { apikey: env.waGatewayApiKey } : {},
        }).finally(() => clearTimeout(timer));

        const latencyMs = Math.round(performance.now() - t0);

        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: res.ok ? "OK" : "WARNING",
          summary: res.ok
            ? `Gateway ${provider.toUpperCase()} conectado e respondendo (${latencyMs}ms).`
            : `Gateway ${provider.toUpperCase()} retornou status HTTP ${res.status}.`,
          details: {
            provider,
            statusCode: res.status,
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: !res.ok ? "Verifique os logs do servidor de WhatsApp Gateway." : null,
        };
      } catch {
        const latencyMs = Math.round(performance.now() - t0);
        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: "FAILURE",
          summary: `Servidor do gateway WhatsApp (${provider}) inacessível.`,
          details: {
            provider,
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: "Verifique se o serviço do gateway WhatsApp está online e a URL está correta.",
        };
      }
    })(),

    // 5. Provider de IA
    (async (): Promise<DiagnosticCheckResult> => {
      const aiStatus = getAiStatus();

      if (!aiStatus.configured) {
        return {
          id: "ai_provider",
          group: "ai",
          groupLabel: "Inteligência Artificial",
          title: "Provedor de IA & Modelos",
          status: "NOT_CONFIGURED",
          summary: "Provedor de IA não configurado.",
          details: {
            configured: false,
          },
          latencyMs: null,
          checkedAt,
          recommendation: "Defina AI_API_KEY e AI_PROVIDER caso deseje utilizar recursos de NIA e agentes.",
        };
      }

      const providerName = (aiStatus.provider || "IA").toUpperCase();
      const modelName = aiStatus.model || "padrão";

      return {
        id: "ai_provider",
        group: "ai",
        groupLabel: "Inteligência Artificial",
        title: "Provedor de IA & Modelos",
        status: "OK",
        summary: `Provedor ${providerName} (${modelName}) configurado e ativo.`,
        details: {
          provider: aiStatus.provider,
          model: aiStatus.model,
          configured: true,
        },
        latencyMs: null,
        checkedAt,
        recommendation: null,
      };
    })(),

    // 6. E-mail
    (async (): Promise<DiagnosticCheckResult> => {
      const mail = getMailStatus();

      if (!mail.configured || mail.provider === "none") {
        return {
          id: "email_service",
          group: "email",
          groupLabel: "E-mail & Entregas",
          title: "Serviço de E-mail",
          status: "NOT_CONFIGURED",
          summary: "Provedor de entrega de e-mails não configurado.",
          details: {
            provider: mail.provider,
            canSend: false,
          },
          latencyMs: null,
          checkedAt,
          recommendation: "Configure RESEND_API_KEY ou MAIL_PROVIDER para habilitar envios de convites por e-mail.",
        };
      }

      if (mail.provider === "log" || mail.provider === "console") {
        return {
          id: "email_service",
          group: "email",
          groupLabel: "E-mail & Entregas",
          title: "Serviço de E-mail",
          status: "NOT_CONFIGURED",
          summary: "Modo local ativo: mensagens são registradas internamente sem envio externo.",
          details: {
            provider: "log",
            canSend: false,
          },
          latencyMs: null,
          checkedAt,
          recommendation: null,
        };
      }

      return {
        id: "email_service",
        group: "email",
        groupLabel: "E-mail & Entregas",
        title: "Serviço de E-mail",
        status: mail.canSend ? "OK" : "WARNING",
        summary: mail.canSend
          ? `Provedor ${mail.provider.toUpperCase()} configurado e pronto para envios.`
          : "Configuração de e-mail incompleta.",
        details: {
          provider: mail.provider,
          canSend: mail.canSend,
        },
        latencyMs: null,
        checkedAt,
        recommendation: !mail.canSend ? "Verifique as chaves de API do provedor de e-mails." : null,
      };
    })(),

    // 7. Deploy & Infraestrutura (GitHub / EasyPanel)
    (async (): Promise<DiagnosticCheckResult> => {
      const t0 = performance.now();
      try {
        const { GitHubClient } = await import("./deploy/github-client");
        const { EasyPanelClient } = await import("./deploy/easypanel-client");

        const ghClient = new GitHubClient();
        const epClient = new EasyPanelClient();

        const [ghTest, epTest] = await Promise.allSettled([
          ghClient.testConnection(),
          epClient.checkConnection(),
        ]);

        const ghResult = ghTest.status === "fulfilled" ? ghTest.value : { state: "UNAVAILABLE", success: false };
        const epResult = epTest.status === "fulfilled" ? epTest.value : { state: "UNAVAILABLE", success: false };

        const latencyMs = Math.round(performance.now() - t0);

        const hasAnyFailure = ghResult.state === "AUTH_FAILED" || epResult.state === "AUTH_FAILED";
        const allConfiguredAndOk = ghResult.state === "CONNECTED" && epResult.state === "CONNECTED";
        const isNotConfigured = ghResult.state === "NOT_CONFIGURED" && epResult.state === "NOT_CONFIGURED";

        const status: DiagnosticCheckStatus = isNotConfigured
          ? "NOT_CONFIGURED"
          : hasAnyFailure
          ? "FAILURE"
          : allConfiguredAndOk
          ? "OK"
          : "WARNING";

        return {
          id: "deploy_integrations",
          group: "integrations",
          groupLabel: "Deploy & DevOps",
          title: "Integrações GitHub & EasyPanel",
          status,
          summary: isNotConfigured
            ? "Credenciais de deploy (GitHub / EasyPanel) não configuradas."
            : allConfiguredAndOk
            ? `Integrações de deploy conectadas com sucesso (${latencyMs}ms).`
            : "Integrações de deploy operando com avisos ou configuração parcial.",
          details: {
            githubState: ghResult.state,
            easypanelState: epResult.state,
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: hasAnyFailure ? "Verifique tokens de autenticação do GitHub e EasyPanel em /admin/deploy." : null,
        };
      } catch {
        const latencyMs = Math.round(performance.now() - t0);
        return {
          id: "deploy_integrations",
          group: "integrations",
          groupLabel: "Deploy & DevOps",
          title: "Integrações GitHub & EasyPanel",
          status: "WARNING",
          summary: "Não foi possível verificar status das integrações de deploy.",
          details: {
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: null,
        };
      }
    })(),
  ]);

  const checks: DiagnosticCheckResult[] = [];

  const fallbackDefs: Array<{ id: string; group: DiagnosticCheckGroup; groupLabel: string; title: string }> = [
    { id: "core_api", group: "core", groupLabel: "Núcleo & API", title: "API & Processo Runtime" },
    { id: "database_postgres", group: "database", groupLabel: "Banco de Dados", title: "PostgreSQL & Conexão" },
    { id: "cache_redis", group: "cache", groupLabel: "Cache & Filas", title: "Redis & Cache Distribuído" },
    { id: "whatsapp_gateway", group: "communications", groupLabel: "Comunicação", title: "Gateway WhatsApp" },
    { id: "ai_provider", group: "ai", groupLabel: "Inteligência Artificial", title: "Provedor de IA & Modelos" },
    { id: "email_service", group: "email", groupLabel: "E-mail & Entregas", title: "Serviço de E-mail" },
    { id: "deploy_integrations", group: "integrations", groupLabel: "Deploy & DevOps", title: "Integrações GitHub & EasyPanel" },
  ];

  const results = [coreCheck, dbCheck, redisCheck, waCheck, aiCheck, mailCheck, deployCheck];

  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      checks.push(res.value);
    } else {
      const def = fallbackDefs[i];
      checks.push({
        id: def.id,
        group: def.group,
        groupLabel: def.groupLabel,
        title: def.title,
        status: "FAILURE",
        summary: "Falha interna ao executar diagnóstico.",
        details: null,
        latencyMs: null,
        checkedAt,
        recommendation: "Verifique os logs da aplicação para mais detalhes.",
      });
    }
  });

  let ok = 0;
  let warning = 0;
  let failure = 0;
  let notConfigured = 0;

  for (const c of checks) {
    if (c.status === "OK") ok++;
    else if (c.status === "WARNING") warning++;
    else if (c.status === "FAILURE") failure++;
    else if (c.status === "NOT_CONFIGURED") notConfigured++;
  }

  const overallStatus = failure > 0 ? "FAILURE" : warning > 0 ? "WARNING" : "OK";
  const durationMs = Math.round(performance.now() - startTime);

  return {
    overallStatus,
    checkedAt,
    durationMs,
    summary: {
      total: checks.length,
      ok,
      warning,
      failure,
      notConfigured,
    },
    checks,
  };
}

