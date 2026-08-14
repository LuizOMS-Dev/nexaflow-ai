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
  const { getAiStatus } = await import("./ai");
  const { getMailStatus } = await import("./security/mail");
  const { isWaGatewayReady, env } = await import("../lib/env");
  const { isRedisCritical, getRedis, shouldUseRedis } = await import("./security/redis");

  let dbOk = false;
  let dbError: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? redactString(err.message, 100) : "db_error";
  }

  let redisOk: boolean | null = null;
  try {
    if (!shouldUseRedis()) redisOk = null;
    else {
      const redis = await getRedis();
      redisOk = redis ? (await redis.ping()) === "PONG" : false;
    }
  } catch {
    redisOk = false;
  }

  const mail = getMailStatus();
  const ai = getAiStatus();
  const redisCritical = isRedisCritical();
  const waReady = isWaGatewayReady();

  const deps = [
    {
      id: "api",
      name: "API",
      tier: "CRITICAL" as const,
      status: "operational" as const,
      impact: "Plataforma inteira",
    },
    {
      id: "postgres",
      name: "PostgreSQL",
      tier: "CRITICAL" as const,
      status: dbOk ? ("operational" as const) : ("down" as const),
      impact: "Persistência e autenticação",
      detail: dbError,
    },
    {
      id: "redis",
      name: "Redis",
      tier: redisCritical ? ("CRITICAL" as const) : ("OPTIONAL" as const),
      status:
        redisOk === null
          ? ("not_configured" as const)
          : redisOk
            ? ("operational" as const)
            : redisCritical
              ? ("down" as const)
              : ("degraded" as const),
      impact: redisCritical ? "Sessões / filas" : "Cache opcional",
    },
    {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      tier: "OPTIONAL" as const,
      status: waReady ? ("operational" as const) : ("not_configured" as const),
      impact: "Canais WhatsApp dos tenants",
    },
    {
      id: "ai",
      name: "Provider de IA",
      tier: "OPTIONAL" as const,
      status: ai.configured ? ("operational" as const) : ("not_configured" as const),
      impact: "Agentes, NIA e respostas automáticas",
      detail: ai.configured ? `Provider: ${ai.provider}` : "Não configurado",
    },
    {
      id: "mail",
      name: "E-mail",
      tier: "OPTIONAL" as const,
      status: mail.canSend ? ("operational" as const) : ("not_configured" as const),
      impact: "Convites e recuperação de senha",
      detail: mail.canSend
        ? `Provider: ${mail.provider}`
        : mail.provider === "log"
          ? "Modo local: registra no console, sem entrega externa"
          : "Provedor de entrega não configurado",
    },
  ];

  const criticalDown = deps.some((d) => d.tier === "CRITICAL" && d.status === "down");
  const anyDegraded = deps.some((d) => d.status === "degraded" || d.status === "down");

  return {
    overall: criticalDown ? "down" : anyDegraded ? "degraded" : "operational",
    generatedAt: new Date().toISOString(),
    env: env.nodeEnv,
    dependencies: deps,
  };
}
