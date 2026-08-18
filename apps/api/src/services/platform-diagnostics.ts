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
    windowLabel: "Janela móvel das últimas 24 horas",
    generatedAt: new Date().toISOString(),
    metrics: {
      activityEvents: audit24h,
      webhookFailures: webhookFailed24h,
      webhookPending,
      whatsappChannels: waProblemChannels,
      aiExecutions: aiUsage24h,
      securityEvents: securityEvents24h,
      apiCalls: apiUsage24h > 0 ? apiUsage24h : null,
      isApiInstrumented: apiUsage24h > 0,
    },
    flatMetrics: {
      activityEvents: audit24h,
      webhookFailures: webhookFailed24h,
      webhookPending,
      whatsappChannels: waProblemChannels,
      aiExecutions: aiUsage24h,
      securityEvents: securityEvents24h,
      apiCalls: apiUsage24h > 0 ? apiUsage24h : null,
    },
  };
}

const AUDIT_ACTION_MAP: Record<string, string> = {
  // Deploy
  "deployment.started": "Implantação iniciada",
  "deployment.success": "Implantação concluída com sucesso",
  "deployment.failed": "Falha na implantação",
  "deployment.rollback": "Reversão de implantação acionada",
  "deployment.logs_cleared": "Histórico de implantações limpo",
  "github_updates.cleared": "Histórico recente do GitHub limpo",
  "github_updates.clear_requested": "Limpeza de atualizações do GitHub solicitada",
  // Auth & MFA
  "auth.login": "Login administrativo realizado",
  "auth.logout": "Logout efetuado",
  "auth.mfa_enabled": "Autenticação de dois fatores ativada",
  "auth.mfa_disabled": "Autenticação de dois fatores desativada",
  "auth.password_changed": "Senha alterada",
  "auth.password_reset": "Senha redefinida",
  // Admin Plans
  "admin.plan.create": "Plano comercial criado",
  "admin.plan.update": "Plano comercial atualizado",
  "admin.plan.duplicate": "Plano comercial duplicado",
  "admin.plan.archive": "Plano comercial arquivado",
  // Admin Finance & Costs
  "admin.cost.create": "Custo operacional registrado",
  "admin.cost.update": "Custo operacional atualizado",
  "admin.cost.delete": "Custo operacional removido",
  "admin.subscription.update": "Assinatura de empresa atualizada",
  "admin.subscription.cancel": "Assinatura de empresa cancelada",
  // Admin Releases
  "admin.release.create": "Versão do sistema publicada",
  "admin.release.update": "Versão do sistema atualizada",
  "admin.release.delete": "Versão do sistema removida",
  // Admin Leads
  "admin.lead.convert": "Lead comercial convertido em empresa",
  "admin.lead.status_change": "Status do lead comercial atualizado",
  "admin.lead.update": "Dados do lead comercial atualizados",
  "admin.lead.delete": "Lead comercial removido",
  // Admin Impersonate & Audit
  "admin.impersonate": "Acesso como empresa iniciado",
  "admin.impersonate.stop": "Acesso como empresa finalizado",
  "admin.audit.cleared": "Histórico de auditoria limpo",
  // Tenant & Users
  "tenant.create": "Empresa cadastrada",
  "tenant.update": "Dados da empresa atualizados",
  "tenant.suspend": "Empresa suspensa",
  "tenant.reactivate": "Empresa reativada",
  "tenant.block": "Empresa bloqueada",
  "user.create": "Usuário cadastrado",
  "user.update": "Usuário atualizado",
  "user.delete": "Usuário removido",
  "user.impersonate": "Acesso como empresa iniciado",
  "user.impersonate.stop": "Acesso como empresa finalizado",
};

export function formatAuditAction(action: string): string {
  if (AUDIT_ACTION_MAP[action]) return AUDIT_ACTION_MAP[action];
  if (action.includes(".") || action.includes("_")) {
    return action
      .replace(/_/g, " ")
      .split(".")
      .map((part) => part.trim().charAt(0).toUpperCase() + part.trim().slice(1))
      .join(" › ");
  }
  return action;
}

const SECURITY_EVENT_MAP: Record<string, { label: string; severity: "INFO" | "WARNING" | "DANGER" }> = {
  LOGIN_SUCCESS: { label: "Login realizado com sucesso", severity: "INFO" },
  LOGIN_FAILURE: { label: "Falha de autenticação", severity: "WARNING" },
  LOGIN_FAILED: { label: "Falha de autenticação", severity: "WARNING" },
  LOGOUT: { label: "Sessão encerrada", severity: "INFO" },
  MFA_CHALLENGE_ISSUED: { label: "Desafio MFA emitido", severity: "INFO" },
  MFA_VERIFY_SUCCESS: { label: "MFA validado com sucesso", severity: "INFO" },
  MFA_VERIFY_FAIL: { label: "Falha na validação do código MFA", severity: "WARNING" },
  MFA_DISABLED: { label: "Autenticação de dois fatores desativada", severity: "WARNING" },
  REFRESH_REUSE: { label: "Reutilização indevida de refresh token", severity: "DANGER" },
  TOKEN_REVOKED: { label: "Token de autenticação revogado", severity: "INFO" },
  IMPERSONATION_START: { label: "Acesso como empresa iniciado", severity: "WARNING" },
  IMPERSONATION_STOP: { label: "Acesso como empresa finalizado", severity: "INFO" },
  IMPERSONATION_END: { label: "Acesso como empresa finalizado", severity: "INFO" },
  PASSWORD_RESET_REQUEST: { label: "Solicitação de redefinição de senha", severity: "INFO" },
  PASSWORD_RESET_SUCCESS: { label: "Senha redefinida com sucesso", severity: "INFO" },
  ACCOUNT_LOCKED: { label: "Conta bloqueada preventivamente", severity: "DANGER" },
  SUSPICIOUS_IP: { label: "Origem ou IP suspeito detectado", severity: "WARNING" },
  RATE_LIMIT_EXCEEDED: { label: "Limite de requisições excedido", severity: "WARNING" },
  CSRF_VIOLATION: { label: "Violação de segurança CSRF detectada", severity: "DANGER" },
  UNAUTHORIZED_ADMIN_ACCESS: { label: "Tentativa de acesso administrativo não autorizado", severity: "DANGER" },
};

export function formatSecurityEvent(eventType: string): { label: string; severity: "INFO" | "WARNING" | "DANGER" } {
  if (SECURITY_EVENT_MAP[eventType]) return SECURITY_EVENT_MAP[eventType];
  const isDanger = /DANGER|CRITICAL|BREACH|ATTACK|INJECT|REUSE|VIOLATION|LOCKED/i.test(eventType);
  const isWarn = /WARN|FAIL|BLOCK|SUSPICIOUS|LIMIT|UNAUTHORIZED/i.test(eventType);
  return {
    label: eventType.replace(/_/g, " "),
    severity: isDanger ? "DANGER" : isWarn ? "WARNING" : "INFO",
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
      eventLabel: formatAuditAction(l.action),
      message: formatAuditAction(l.action),
      actor: l.user?.name || l.user?.email || "Sistema NexaFlow",
      tenantId: l.tenantId,
      tenantName: l.tenant?.name || "Global / Plataforma",
      userId: l.userId,
      userName: l.user?.name ?? null,
      entity: l.entity,
      entityId: l.entityId,
      metadata: redactMetadata(l.metadata),
      ip: l.ip || "—",
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
      endpointHint: d.endpoint?.url
        ? redactString(d.endpoint.url.replace(/\?.*$/, ""), 80)
        : null,
    })),
  };
}

export async function getDiagnosticWhatsApp() {
  const { env, isWaGatewayReady } = await import("../lib/env");
  const provider = env.waGatewayProvider || "baileys";

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

  let connectedCount = 0;
  let reconnectingCount = 0;
  let disconnectedCount = 0;

  const items = channels.map((c) => {
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

    if (status === "CONNECTED") connectedCount++;
    else if (status === "CONNECTING" || status === "RECONNECTING") reconnectingCount++;
    else disconnectedCount++;

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
  });

  return {
    gateway: {
      provider,
      mode: provider === "baileys" || provider === "simulated" ? "embedded" : "external",
      configured: isWaGatewayReady(),
    },
    summary: {
      totalChannels: channels.length,
      connected: connectedCount,
      reconnecting: reconnectingCount,
      disconnected: disconnectedCount,
    },
    items,
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
  const since = dayAgo();

  const [items, count24h, errors24h] = await Promise.all([
    prisma.apiUsageLog.findMany({
      where: params.tenantId ? { tenantId: params.tenantId } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        apiKey: { select: { id: true, keyPrefix: true, name: true } },
      },
    }),
    prisma.apiUsageLog.count({
      where: {
        createdAt: { gte: since },
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      },
    }),
    prisma.apiUsageLog.count({
      where: {
        createdAt: { gte: since },
        statusCode: { gte: 400 },
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      },
    }),
  ]);

  const mem = process.memoryUsage();
  let heapLimitMb = 1400;
  try {
    const v8 = await import("node:v8");
    const stats = v8.getHeapStatistics();
    heapLimitMb = Math.round(stats.heap_size_limit / 1024 / 1024);
  } catch {
    heapLimitMb = 1400;
  }
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const externalMb = Math.round(mem.external / 1024 / 1024);
  const arrayBuffersMb = Math.round((mem.arrayBuffers || 0) / 1024 / 1024);
  const uptimeSec = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  return {
    runtime: {
      readiness: "OPERATIONAL" as const,
      uptimeSeconds: uptimeSec,
      uptimeFormatted: `${hours}h ${minutes}m ${uptimeSec % 60}s`,
      heapUsedMb,
      heapTotalMb,
      heapLimitMb,
      rssMb,
      externalMb,
      arrayBuffersMb,
      nodeVersion: process.version,
      platform: process.platform,
    },
    telemetry: {
      totalCalls24h: count24h,
      errors24h,
      isInstrumented: count24h > 0,
      note: count24h === 0 ? "Sem chamadas registradas na tabela de uso de API nas últimas 24h." : null,
    },
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
    items: items.map((e) => {
      const formatted = formatSecurityEvent(e.type);
      return {
        id: e.id,
        timestamp: e.createdAt,
        severity: formatted.severity,
        module: "security",
        event: e.type,
        eventLabel: formatted.label,
        message: formatted.label,
        tenantId: e.tenantId,
        userId: e.userId,
        userName: e.user?.name ?? null,
        ip: e.ip,
        metadata: redactMetadata(e.metadata),
      };
    }),
  };
}

export async function getPlatformHealthDetailed() {
  const { getPlatformHealth } = await import("./platform-health");
  return getPlatformHealth();
}

export type DiagnosticCheckStatus = "OK" | "WARNING" | "FAILURE" | "NOT_CONFIGURED" | "NOT_APPLICABLE";
export type DiagnosticCriticality = "CRITICAL" | "IMPORTANT" | "OPTIONAL";
export type DiagnosticCheckGroup = "core" | "database" | "cache" | "communications" | "ai" | "email" | "integrations";

export type DiagnosticCheckResult = {
  id: string;
  group: DiagnosticCheckGroup;
  groupLabel: string;
  title: string;
  status: DiagnosticCheckStatus;
  criticality: DiagnosticCriticality;
  summary: string;
  evidence: string;
  impact: string;
  recommendation?: string | null;
  latencyMs?: number | null;
  checkedAt: string;
  technical?: Record<string, string | number | boolean | null | undefined>;
  details?: Record<string, unknown> | null;
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
      let heapLimitMb = 1400;
      try {
        const v8 = await import("node:v8");
        const stats = v8.getHeapStatistics();
        heapLimitMb = Math.round(stats.heap_size_limit / 1024 / 1024);
      } catch {
        heapLimitMb = 1400;
      }
      const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
      const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      const externalMb = Math.round(mem.external / 1024 / 1024);
      const arrayBuffersMb = Math.round((mem.arrayBuffers || 0) / 1024 / 1024);
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const uptimeFormatted = `${hours}h ${minutes}m ${uptimeSec % 60}s`;

      const isHighMem = heapUsedMb > 700;

      return {
        id: "core_api",
        group: "core",
        groupLabel: "Núcleo & API",
        title: "API & Processo Runtime",
        status: isHighMem ? "WARNING" : "OK",
        criticality: "CRITICAL",
        summary: `API ativa · Uptime: ${uptimeFormatted} · Heap: ${heapUsedMb} MB / ${heapTotalMb} MB (RSS: ${rssMb} MB)`,
        evidence: `Processo Node.js ${process.version} (${process.platform}) operacional com ${heapUsedMb} MB de heap em uso.`,
        impact: "Execução de rotas HTTP, processamento assíncrono e WebSocket.",
        technical: {
          "Versão do Node": process.version,
          "Plataforma": process.platform,
          "Uptime": uptimeFormatted,
          "Heap em Uso": `${heapUsedMb} MB`,
          "Heap Alocado": `${heapTotalMb} MB`,
          "Limite da Heap": `${heapLimitMb} MB`,
          "Memória RSS": `${rssMb} MB`,
          "Buffers": `${arrayBuffersMb} MB`,
          "External": `${externalMb} MB`,
        },
        details: {
          nodeVersion: process.version,
          platform: process.platform,
          uptimeSeconds: uptimeSec,
          heapUsedMb,
          heapTotalMb,
          heapLimitMb,
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
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        const isSlow = latencyMs > 500;

        return {
          id: "database_postgres",
          group: "database",
          groupLabel: "Banco de Dados",
          title: "PostgreSQL & Conexão",
          status: isSlow ? "WARNING" : "OK",
          criticality: "CRITICAL",
          summary: isSlow
            ? `PostgreSQL conectado, mas com latência elevada (${latencyMs}ms).`
            : `PostgreSQL conectado e respondendo normalmente (${latencyMs}ms).`,
          evidence: isSlow
            ? `Consulta SELECT 1 executada com sucesso, mas excedeu o limite recomendado de 500ms (${latencyMs}ms).`
            : `Consulta de integridade SELECT 1 executada com sucesso em ${latencyMs}ms.`,
          impact: "Persistência transacional, autenticação, multitenancy e auditoria.",
          technical: {
            "Comando de Teste": "SELECT 1",
            "Motor de Banco": "PostgreSQL",
            "Status da Conexão": "Conectado",
            "Latência da Consulta": `${latencyMs} ms`,
            "Timeout Aplicado": "2500 ms",
          },
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
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        const isTimeout = err instanceof Error && err.message.includes("Timeout");
        return {
          id: "database_postgres",
          group: "database",
          groupLabel: "Banco de Dados",
          title: "PostgreSQL & Conexão",
          status: "FAILURE",
          criticality: "CRITICAL",
          summary: "Falha de conexão com o banco de dados PostgreSQL.",
          evidence: isTimeout
            ? "Tempo limite de 2.5s excedido ao tentar executar consulta no PostgreSQL."
            : "Não foi possível estabelecer conexão com o banco de dados PostgreSQL.",
          impact: "Persistência transacional, autenticação, multitenancy e auditoria.",
          technical: {
            "Comando de Teste": "SELECT 1",
            "Status": isTimeout ? "Timeout" : "Erro de Conexão",
            "Latência": `${latencyMs} ms`,
          },
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
      const criticality: DiagnosticCriticality = critical ? "CRITICAL" : "OPTIONAL";

      if (!shouldUseRedis()) {
        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: "NOT_CONFIGURED",
          criticality: "OPTIONAL",
          summary: "Redis não configurado. Sessões e rate limits operam em memória local.",
          evidence: "Instância Redis não configurada no ambiente. O sistema está utilizando armazenamento em memória local.",
          impact: "Cache em memória local e rate limiting por instância.",
          technical: {
            "Modo Operacional": "Memória Local (In-Memory)",
            "Conexão Externa": "Desativada",
          },
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
            criticality,
            summary: "Não foi possível conectar ao servidor Redis.",
            evidence: "Cliente Redis não conseguiu estabelecer conexão inicial com o servidor.",
            impact: critical ? "Sessões distribuídas e filas de background." : "Cache opcional.",
            technical: {
              "Status": "Desconectado",
              "Modo": "Redis Distribuído",
            },
            details: {
              mode: "redis",
              connected: false,
            },
            latencyMs: Math.max(1, Math.round(performance.now() - t0)),
            checkedAt,
            recommendation: "Verifique a variável REDIS_URL e a conectividade com a porta do Redis.",
          };
        }

        const pong = await redis.ping();
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        const isSlow = latencyMs > 250;

        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: pong === "PONG" ? (isSlow ? "WARNING" : "OK") : "FAILURE",
          criticality,
          summary: pong === "PONG"
            ? (isSlow ? `Redis respondendo com latência elevada (${latencyMs}ms).` : `Redis conectado com sucesso (${latencyMs}ms).`)
            : "Resposta inválida ao comando PING no Redis.",
          evidence: pong === "PONG"
            ? `Comando PING executado com sucesso e resposta PONG recebida em ${latencyMs}ms.`
            : `Servidor Redis retornou resposta inesperada: ${pong}`,
          impact: critical ? "Sessões distribuídas, controle de taxa e filas." : "Cache distribuído.",
          technical: {
            "Comando de Probe": "PING",
            "Resposta do Servidor": pong,
            "Latência de Comunicação": `${latencyMs} ms`,
            "Timeout Aplicado": "2000 ms",
          },
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
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        return {
          id: "cache_redis",
          group: "cache",
          groupLabel: "Cache & Filas",
          title: "Redis & Cache Distribuído",
          status: critical ? "FAILURE" : "WARNING",
          criticality,
          summary: "Serviço Redis inacessível ou com erro.",
          evidence: "Falha ao enviar comando PING para a instância do Redis.",
          impact: critical ? "Sessões distribuídas e filas de background." : "Cache opcional.",
          technical: {
            "Status": "Inacessível",
            "Latência": `${latencyMs} ms`,
          },
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
          criticality: "IMPORTANT",
          summary: provider === "baileys"
            ? "Gateway Baileys embutido ativo com persistência de sessões."
            : "Gateway simulado ativo para desenvolvimento/testes.",
          evidence: provider === "baileys"
            ? "Módulo Baileys em execução com sessões segregadas por tenant."
            : "Instância simulada respondendo para testes de ambiente.",
          impact: "Envio e recepção de mensagens nos canais WhatsApp dos clientes.",
          technical: {
            "Provedor Ativo": provider === "baileys" ? "Baileys" : "Simulado",
            "Modo de Execução": "Embutido (Embedded)",
            "Isolamento": "Por empresa (Tenant)",
          },
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
          criticality: "OPTIONAL",
          summary: "URL do gateway WhatsApp não configurada.",
          evidence: "Variável WA_GATEWAY_URL não definida no ambiente.",
          impact: "Canais WhatsApp das empresas não poderão se conectar via gateway externo.",
          technical: {
            "Provedor": provider.toUpperCase(),
            "Status": "Não Configurado",
          },
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

        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        const isAuthError = res.status === 401 || res.status === 403;

        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: res.ok ? "OK" : "WARNING",
          criticality: "IMPORTANT",
          summary: res.ok
            ? `Gateway ${provider.toUpperCase()} conectado e respondendo (${latencyMs}ms).`
            : isAuthError
            ? "O Gateway WhatsApp respondeu, mas recusou a autenticação configurada (HTTP 401)."
            : `Gateway ${provider.toUpperCase()} retornou status HTTP ${res.status}.`,
          evidence: isAuthError
            ? "O servidor do gateway está acessível na rede, porém a credencial configurada foi recusada (HTTP 401 Unauthorized)."
            : res.ok
            ? `Endpoint /health do gateway respondeu com status HTTP ${res.status} OK.`
            : `Endpoint /health do gateway retornou código HTTP ${res.status}.`,
          impact: "As operações que exigem comunicação com o gateway podem falhar até a correção da chave.",
          technical: {
            "Provedor": provider.toUpperCase(),
            "Resposta HTTP": `${res.status} ${res.statusText || (isAuthError ? "Unauthorized" : "")}`.trim(),
            "Conectividade de Rede": "Acessível (Servidor respondeu)",
            "Status de Autenticação": isAuthError ? "Recusada" : res.ok ? "Aceita" : "Indefinida",
            "Latência": `${latencyMs} ms`,
            "Timeout Aplicado": "2500 ms",
          },
          details: {
            provider,
            statusCode: res.status,
            latencyMs,
            authFailed: isAuthError,
          },
          latencyMs,
          checkedAt,
          recommendation: isAuthError
            ? "Verifique a chave de autenticação ou as permissões de acesso nas configurações do gateway WhatsApp."
            : !res.ok
            ? "Verifique os logs do servidor de WhatsApp Gateway."
            : null,
        };
      } catch {
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        return {
          id: "whatsapp_gateway",
          group: "communications",
          groupLabel: "Comunicação",
          title: "Gateway WhatsApp",
          status: "FAILURE",
          criticality: "IMPORTANT",
          summary: `Servidor do gateway WhatsApp (${provider}) inacessível.`,
          evidence: "Não foi possível conectar ao servidor do gateway no tempo limite de 2.5s.",
          impact: "Canais WhatsApp das empresas não conseguem transacionar mensagens.",
          technical: {
            "Provedor": provider.toUpperCase(),
            "Conectividade": "Inacessível / Timeout",
            "Latência": `${latencyMs} ms`,
          },
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
          criticality: "OPTIONAL",
          summary: "Provedor de IA não configurado.",
          evidence: "Nenhum provedor de inteligência artificial configurado no ambiente.",
          impact: "Recursos que dependem de IA (agentes, NIA e automações inteligentes) permanecem inativos.",
          technical: {
            "Provedor": "Não definido",
            "Probe Pago": "Não realizado",
            "Consumo de Tokens": "0 tokens",
          },
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
        criticality: "OPTIONAL",
        summary: `Provedor ${providerName} (${modelName}) configurado e ativo.`,
        evidence: `Provedor ${providerName} inicializado com modelo padrão ${modelName}.`,
        impact: "Agentes autônomos e assistente NIA operando normalmente.",
        technical: {
          "Provedor": providerName,
          "Modelo Padrão": modelName,
          "Status de Configuração": "Ativo",
        },
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
          criticality: "OPTIONAL",
          summary: "Provedor de entrega de e-mails não configurado.",
          evidence: "Nenhum provedor de entrega de e-mails configurado no ambiente.",
          impact: "Convites e recuperação de senhas não serão enviados.",
          technical: {
            "Provedor": "Nenhum",
            "Status": "Desativado",
          },
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
          criticality: "OPTIONAL",
          summary: "Modo local ativo: Mensagens são registradas no log interno, sem entrega externa.",
          evidence: "Modo local ativo: e-mails de convite e recuperação são registrados no console/log interno para desenvolvimento.",
          impact: "E-mails reais não são entregues para caixas de entrada externas.",
          technical: {
            "Modo Operacional": "Local (Log / Console)",
            "Entrega Externa": "Desativada",
            "Persistência Interna": "Ativa",
          },
          details: {
            provider: "log",
            canSend: false,
          },
          latencyMs: null,
          checkedAt,
          recommendation: "Para habilitar envios reais por e-mail, configure um provedor externo como Resend ou SMTP.",
        };
      }

      return {
        id: "email_service",
        group: "email",
        groupLabel: "E-mail & Entregas",
        title: "Serviço de E-mail",
        status: mail.canSend ? "OK" : "WARNING",
        criticality: "OPTIONAL",
        summary: mail.canSend
          ? `Provedor ${mail.provider.toUpperCase()} configurado e pronto para envios.`
          : "Configuração de e-mail incompleta.",
        evidence: `Provedor ${mail.provider.toUpperCase()} configurado com credenciais válidas.`,
        impact: "Envio transacional de convites e recuperação de senhas ativo.",
        technical: {
          "Provedor": mail.provider.toUpperCase(),
          "Status de Envio": mail.canSend ? "Pronto" : "Incompleto",
        },
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

        const latencyMs = Math.max(1, Math.round(performance.now() - t0));

        const ghConnected = ghResult.state === "CONNECTED";
        const epConnected = epResult.state === "CONNECTED";
        const isNotConfigured = ghResult.state === "NOT_CONFIGURED" && epResult.state === "NOT_CONFIGURED";
        const hasAnyFailure = ghResult.state === "AUTH_FAILED" || epResult.state === "AUTH_FAILED";

        const status: DiagnosticCheckStatus = isNotConfigured
          ? "NOT_CONFIGURED"
          : hasAnyFailure
          ? "FAILURE"
          : (ghConnected && epConnected)
          ? "OK"
          : "WARNING";

        const summary = isNotConfigured
          ? "Credenciais de deploy (GitHub / EasyPanel) não configuradas."
          : (ghConnected && epConnected)
          ? `Integrações de deploy conectadas com sucesso (${latencyMs}ms).`
          : hasAnyFailure
          ? "Falha de autenticação em uma ou mais integrações de deploy."
          : "Integrações de deploy operando com configuração parcial ou avisos.";

        const evidence = `GitHub (${ghConnected ? "Conectado" : ghResult.state}) · EasyPanel (${epConnected ? "Conectado" : epResult.state})`;
        const impact = "Sincronização de código, verificação de versões e deploys no EasyPanel.";

        return {
          id: "deploy_integrations",
          group: "integrations",
          groupLabel: "Deploy & DevOps",
          title: "Integrações GitHub & EasyPanel",
          status,
          criticality: "IMPORTANT",
          summary,
          evidence,
          impact,
          technical: {
            "GitHub": ghConnected ? "Conectado" : ghResult.state,
            "EasyPanel": epConnected ? "Conectado" : epResult.state,
            "Latência": `${latencyMs} ms`,
          },
          details: {
            github: {
              state: ghResult.state,
              connected: ghConnected,
              label: ghConnected ? "Operacional" : ghResult.state === "AUTH_FAILED" ? "Falha de autenticação" : ghResult.state === "NOT_CONFIGURED" ? "Não configurado" : "Indisponível",
            },
            easypanel: {
              state: epResult.state,
              connected: epConnected,
              label: epConnected ? "Operacional" : epResult.state === "AUTH_FAILED" ? "Falha de autenticação" : epResult.state === "NOT_CONFIGURED" ? "Não configurado" : "Indisponível",
            },
            latencyMs,
          },
          latencyMs,
          checkedAt,
          recommendation: hasAnyFailure ? "Verifique tokens de autenticação do GitHub e EasyPanel em /admin/deploy." : null,
        };
      } catch {
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        return {
          id: "deploy_integrations",
          group: "integrations",
          groupLabel: "Deploy & DevOps",
          title: "Integrações GitHub & EasyPanel",
          status: "WARNING",
          criticality: "IMPORTANT",
          summary: "Não foi possível verificar status das integrações de deploy.",
          evidence: "Falha ao consultar endpoints de status de deploy.",
          impact: "Sincronização de código e deploys automatizados.",
          technical: {
            "Status": "Aviso",
            "Latência": `${latencyMs} ms`,
          },
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

  const fallbackDefs: Array<{
    id: string;
    group: DiagnosticCheckGroup;
    groupLabel: string;
    title: string;
    criticality: DiagnosticCriticality;
  }> = [
    { id: "core_api", group: "core", groupLabel: "Núcleo & API", title: "API & Processo Runtime", criticality: "CRITICAL" },
    { id: "database_postgres", group: "database", groupLabel: "Banco de Dados", title: "PostgreSQL & Conexão", criticality: "CRITICAL" },
    { id: "cache_redis", group: "cache", groupLabel: "Cache & Filas", title: "Redis & Cache Distribuído", criticality: "CRITICAL" },
    { id: "whatsapp_gateway", group: "communications", groupLabel: "Comunicação", title: "Gateway WhatsApp", criticality: "IMPORTANT" },
    { id: "ai_provider", group: "ai", groupLabel: "Inteligência Artificial", title: "Provedor de IA & Modelos", criticality: "OPTIONAL" },
    { id: "email_service", group: "email", groupLabel: "E-mail & Entregas", title: "Serviço de E-mail", criticality: "OPTIONAL" },
    { id: "deploy_integrations", group: "integrations", groupLabel: "Deploy & DevOps", title: "Integrações GitHub & EasyPanel", criticality: "IMPORTANT" },
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
        criticality: def.criticality,
        summary: "Falha interna ao executar diagnóstico.",
        evidence: "Exceção inesperada na execução da rotina de probe.",
        impact: "Não foi possível mensurar o estado operacional desta dependência.",
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

  const criticalFailure = checks.some((c) => c.criticality === "CRITICAL" && c.status === "FAILURE");
  const criticalWarning = checks.some((c) => c.criticality === "CRITICAL" && c.status === "WARNING");
  const importantFailure = checks.some((c) => c.criticality === "IMPORTANT" && c.status === "FAILURE");

  const overallStatus = criticalFailure
    ? "FAILURE"
    : criticalWarning || importantFailure || warning > 0
    ? "WARNING"
    : "OK";

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

