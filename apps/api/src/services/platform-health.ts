/**
 * Serviço Canônico de Saúde da Plataforma (Platform Health Service)
 *
 * Executa health checks reais e estruturados nas dependências de infraestrutura:
 * - API (Processo, Uptime, Memória) [CRITICAL]
 * - PostgreSQL (Query SELECT 1, latência, timeout) [CRITICAL]
 * - Redis (Ping, latência, timeout) [CRITICAL / OPTIONAL]
 * - WhatsApp Gateway (Infraestrutura do gateway) [OPTIONAL]
 * - Provider de IA (Validação leve de configuração) [OPTIONAL]
 * - E-mail (Modo local / Provedor externo) [OPTIONAL]
 *
 * Segurança: Nunca expõe secrets, senhas, tokens ou connection strings no DTO.
 */

import { prisma } from "../lib/prisma";
import { env, isWaGatewayReady } from "../lib/env";
import { getAiStatus } from "./ai";
import { getMailStatus } from "./security/mail";
import { isRedisCritical, getRedis, shouldUseRedis } from "./security/redis";

export type ServiceCriticality = "CRITICAL" | "OPTIONAL";
export type ServiceHealthStatus = "operational" | "degraded" | "down" | "not_configured";
export type OverallPlatformStatus = "operational" | "degraded" | "down";

export type ServiceHealthResult = {
  id: "api" | "postgres" | "redis" | "whatsapp" | "ai" | "mail" | string;
  name: string;
  criticality: ServiceCriticality;
  status: ServiceHealthStatus;
  latencyMs?: number | null;
  message?: string | null;
  impact: string;
  checkedAt: string;
};

export type PlatformHealthDTO = {
  overall: OverallPlatformStatus;
  checkedAt: string;
  env: string;
  summary: {
    operational: number;
    degraded: number;
    down: number;
    notConfigured: number;
    criticalDown: number;
    total: number;
  };
  services: ServiceHealthResult[];
  /** Compatibilidade com consumidores anteriores do frontend */
  dependencies: Array<{
    id: string;
    name: string;
    tier: ServiceCriticality;
    status: ServiceHealthStatus;
    impact: string;
    detail?: string;
    latencyMs?: number | null;
  }>;
};

/** Executa uma promise com timeout seguro */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutErrorMsg: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutErrorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/** Formata segundos de uptime em texto legível */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** 1. Health Check da API */
async function checkApiHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const start = performance.now();
  
  const memory = process.memoryUsage();
  const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memory.heapTotal / 1024 / 1024);
  const uptime = formatUptime(process.uptime());
  const latencyMs = Math.round(performance.now() - start);

  return {
    id: "api",
    name: "NexaFlow API",
    criticality: "CRITICAL",
    status: "operational",
    latencyMs,
    message: `Uptime: ${uptime} · Memória: ${heapUsedMb}MB / ${heapTotalMb}MB`,
    impact: "Plataforma inteira",
    checkedAt: now,
  };
}

/** 2. Health Check do PostgreSQL */
async function checkPostgresHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const start = performance.now();
  
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      2500,
      "Timeout ao consultar o banco de dados (> 2.5s)"
    );
    const latencyMs = Math.round(performance.now() - start);
    
    // Latência acima de 500ms é considerada degradada
    if (latencyMs > 500) {
      return {
        id: "postgres",
        name: "PostgreSQL",
        criticality: "CRITICAL",
        status: "degraded",
        latencyMs,
        message: `Latência elevada na execução de consultas (${latencyMs}ms).`,
        impact: "Persistência e autenticação",
        checkedAt: now,
      };
    }

    return {
      id: "postgres",
      name: "PostgreSQL",
      criticality: "CRITICAL",
      status: "operational",
      latencyMs,
      message: "Conexão ativa e consultas respondendo normalmente.",
      impact: "Persistência e autenticação",
      checkedAt: now,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const isTimeout = err instanceof Error && err.message.includes("Timeout");
    return {
      id: "postgres",
      name: "PostgreSQL",
      criticality: "CRITICAL",
      status: "down",
      latencyMs,
      message: isTimeout
        ? "Tempo limite excedido ao comunicar com PostgreSQL."
        : "Não foi possível conectar ao banco de dados PostgreSQL.",
      impact: "Persistência e autenticação",
      checkedAt: now,
    };
  }
}

/** 3. Health Check do Redis */
async function checkRedisHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const redisCritical = isRedisCritical();
  const criticality: ServiceCriticality = redisCritical ? "CRITICAL" : "OPTIONAL";
  const impact = redisCritical ? "Sessões e filas de background" : "Cache opcional";

  if (!shouldUseRedis()) {
    return {
      id: "redis",
      name: "Redis",
      criticality: "OPTIONAL",
      status: "not_configured",
      latencyMs: null,
      message: "Redis não configurado. Sessões e rate limits operam em memória local.",
      impact: "Cache opcional",
      checkedAt: now,
    };
  }

  const start = performance.now();
  try {
    const redis = await withTimeout(
      getRedis(),
      2000,
      "Timeout ao inicializar conexão Redis"
    );

    if (!redis) {
      return {
        id: "redis",
        name: "Redis",
        criticality,
        status: redisCritical ? "down" : "not_configured",
        latencyMs: null,
        message: "Conexão com Redis não estabelecida.",
        impact,
        checkedAt: now,
      };
    }

    const pong = await withTimeout(redis.ping(), 2000, "Timeout no ping do Redis");
    const latencyMs = Math.round(performance.now() - start);

    if (pong !== "PONG") {
      return {
        id: "redis",
        name: "Redis",
        criticality,
        status: "degraded",
        latencyMs,
        message: "Resposta inesperada do servidor Redis.",
        impact,
        checkedAt: now,
      };
    }

    if (latencyMs > 250) {
      return {
        id: "redis",
        name: "Redis",
        criticality,
        status: "degraded",
        latencyMs,
        message: `Latência elevada na comunicação com Redis (${latencyMs}ms).`,
        impact,
        checkedAt: now,
      };
    }

    return {
      id: "redis",
      name: "Redis",
      criticality,
      status: "operational",
      latencyMs,
      message: "Conexão ativa e operações respondendo normalmente.",
      impact,
      checkedAt: now,
    };
  } catch {
    const latencyMs = Math.round(performance.now() - start);
    return {
      id: "redis",
      name: "Redis",
      criticality,
      status: redisCritical ? "down" : "degraded",
      latencyMs,
      message: "Serviço Redis indisponível ou inacessível.",
      impact,
      checkedAt: now,
    };
  }
}

/** 4. Health Check do WhatsApp Gateway */
async function checkWhatsAppGatewayHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const provider = env.waGatewayProvider || "baileys";

  if (provider === "simulated") {
    return {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      criticality: "OPTIONAL",
      status: "operational",
      latencyMs: 1,
      message: "Gateway simulado ativo para desenvolvimento e testes.",
      impact: "Canais WhatsApp dos tenants",
      checkedAt: now,
    };
  }

  if (provider === "baileys") {
    return {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      criticality: "OPTIONAL",
      status: "operational",
      latencyMs: 1,
      message: "Gateway Baileys ativo no núcleo da aplicação.",
      impact: "Canais WhatsApp dos tenants",
      checkedAt: now,
    };
  }

  // Se provider for Evolution ou WAHA
  if (!isWaGatewayReady() || !env.waGatewayUrl) {
    return {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      criticality: "OPTIONAL",
      status: "not_configured",
      latencyMs: null,
      message: "URL do gateway WhatsApp não configurada.",
      impact: "Canais WhatsApp dos tenants",
      checkedAt: now,
    };
  }

  const start = performance.now();
  try {
    const cleanUrl = env.waGatewayUrl.replace(/\/+$/, "");
    const healthUrl = `${cleanUrl}/health`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(env.waGatewayApiKey ? { apikey: env.waGatewayApiKey } : {}),
      },
    }).finally(() => clearTimeout(timer));

    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      return {
        id: "whatsapp",
        name: "WhatsApp Gateway",
        criticality: "OPTIONAL",
        status: latencyMs > 1500 ? "degraded" : "operational",
        latencyMs,
        message: `Gateway ${provider.toUpperCase()} conectado e respondendo.`,
        impact: "Canais WhatsApp dos tenants",
        checkedAt: now,
      };
    }

    return {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      criticality: "OPTIONAL",
      status: "degraded",
      latencyMs,
      message: `Gateway respondeu com status HTTP ${res.status}.`,
      impact: "Canais WhatsApp dos tenants",
      checkedAt: now,
    };
  } catch {
    const latencyMs = Math.round(performance.now() - start);
    return {
      id: "whatsapp",
      name: "WhatsApp Gateway",
      criticality: "OPTIONAL",
      status: "down",
      latencyMs,
      message: `Servidor do gateway ${provider.toUpperCase()} inacessível.`,
      impact: "Canais WhatsApp dos tenants",
      checkedAt: now,
    };
  }
}

/** 5. Health Check do Provider de IA (Validação Leve sem gasto de tokens) */
async function checkAiProviderHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const aiStatus = getAiStatus();

  if (!aiStatus.configured) {
    return {
      id: "ai",
      name: "Provider de IA",
      criticality: "OPTIONAL",
      status: "not_configured",
      latencyMs: null,
      message: "Provedor de inteligência artificial não configurado.",
      impact: "Agentes, NIA e respostas automáticas",
      checkedAt: now,
    };
  }

  const providerName = (aiStatus.provider || "IA").toUpperCase();
  const modelName = aiStatus.model || "padrão";

  return {
    id: "ai",
    name: "Provider de IA",
    criticality: "OPTIONAL",
    status: "operational",
    latencyMs: null,
    message: `Provedor ${providerName} (${modelName}) configurado e ativo.`,
    impact: "Agentes, NIA e respostas automáticas",
    checkedAt: now,
  };
}

/** 6. Health Check do E-mail */
async function checkMailHealth(): Promise<ServiceHealthResult> {
  const now = new Date().toISOString();
  const mail = getMailStatus();

  if (!mail.configured || mail.provider === "none") {
    return {
      id: "mail",
      name: "E-mail",
      criticality: "OPTIONAL",
      status: "not_configured",
      latencyMs: null,
      message: "Provedor de entrega de e-mails não configurado.",
      impact: "Convites e recuperação de senha",
      checkedAt: now,
    };
  }

  if (mail.provider === "log" || mail.provider === "console") {
    return {
      id: "mail",
      name: "E-mail",
      criticality: "OPTIONAL",
      status: "not_configured",
      latencyMs: null,
      message: "Modo local ativo: mensagens são registradas internamente, sem entrega externa.",
      impact: "Convites e recuperação de senha",
      checkedAt: now,
    };
  }

  if (mail.canSend) {
    const providerName = mail.provider.charAt(0).toUpperCase() + mail.provider.slice(1);
    return {
      id: "mail",
      name: "E-mail",
      criticality: "OPTIONAL",
      status: "operational",
      latencyMs: null,
      message: `Provedor ${providerName} configurado e pronto para entrega.`,
      impact: "Convites e recuperação de senha",
      checkedAt: now,
    };
  }

  return {
    id: "mail",
    name: "E-mail",
    criticality: "OPTIONAL",
    status: "not_configured",
    latencyMs: null,
    message: "Configuração de e-mail incompleta.",
    impact: "Convites e recuperação de senha",
    checkedAt: now,
  };
}

/**
 * Cálculo Único e Canônico do Status Geral da Plataforma
 *
 * Regra Semântica:
 * - Se qualquer serviço CRITICAL for DOWN => DOWN
 * - Se qualquer serviço CRITICAL for DEGRADED => DEGRADED
 * - Se todos os serviços CRITICAL forem OPERATIONAL:
 *   - Serviços OPTIONAL que estão NOT_CONFIGURED NÃO rebaixam o status geral (permanece OPERATIONAL).
 *   - Se um serviço OPTIONAL configurado estiver DOWN => DEGRADED (aviso operacional, sem derrubar a plataforma).
 *   - Caso contrário => OPERATIONAL.
 */
export function calculateOverallPlatformStatus(services: ServiceHealthResult[]): OverallPlatformStatus {
  const critical = services.filter((s) => s.criticality === "CRITICAL");

  if (critical.some((s) => s.status === "down")) {
    return "down";
  }

  if (critical.some((s) => s.status === "degraded")) {
    return "degraded";
  }

  const optionalConfiguredDown = services.some(
    (s) => s.criticality === "OPTIONAL" && s.status === "down"
  );
  if (optionalConfiguredDown) {
    return "degraded";
  }

  return "operational";
}

/**
 * Executa a sondagem completa de saúde da plataforma em paralelo
 */
export async function getPlatformHealth(): Promise<PlatformHealthDTO> {
  const checkedAt = new Date().toISOString();

  // Executa todos os checks de forma independente e paralela com Promise.allSettled
  const results = await Promise.allSettled([
    checkApiHealth(),
    checkPostgresHealth(),
    checkRedisHealth(),
    checkWhatsAppGatewayHealth(),
    checkAiProviderHealth(),
    checkMailHealth(),
  ]);

  const services: ServiceHealthResult[] = [];

  const fallbackDefs: Array<{ id: string; name: string; criticality: ServiceCriticality; impact: string }> = [
    { id: "api", name: "NexaFlow API", criticality: "CRITICAL", impact: "Plataforma inteira" },
    { id: "postgres", name: "PostgreSQL", criticality: "CRITICAL", impact: "Persistência e autenticação" },
    { id: "redis", name: "Redis", criticality: "CRITICAL", impact: "Sessões e filas" },
    { id: "whatsapp", name: "WhatsApp Gateway", criticality: "OPTIONAL", impact: "Canais WhatsApp dos tenants" },
    { id: "ai", name: "Provider de IA", criticality: "OPTIONAL", impact: "Agentes, NIA e respostas automáticas" },
    { id: "mail", name: "E-mail", criticality: "OPTIONAL", impact: "Convites e recuperação de senha" },
  ];

  results.forEach((res, index) => {
    if (res.status === "fulfilled") {
      services.push(res.value);
    } else {
      const def = fallbackDefs[index];
      services.push({
        id: def.id,
        name: def.name,
        criticality: def.criticality,
        status: def.criticality === "CRITICAL" ? "down" : "degraded",
        latencyMs: null,
        message: "Falha na sondagem interna de saúde.",
        impact: def.impact,
        checkedAt,
      });
    }
  });

  const overall = calculateOverallPlatformStatus(services);

  let operational = 0;
  let degraded = 0;
  let down = 0;
  let notConfigured = 0;
  let criticalDown = 0;

  for (const s of services) {
    if (s.status === "operational") operational++;
    else if (s.status === "degraded") degraded++;
    else if (s.status === "down") {
      down++;
      if (s.criticality === "CRITICAL") criticalDown++;
    } else if (s.status === "not_configured") notConfigured++;
  }

  return {
    overall,
    checkedAt,
    env: env.nodeEnv,
    summary: {
      operational,
      degraded,
      down,
      notConfigured,
      criticalDown,
      total: services.length,
    },
    services,
    dependencies: services.map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.criticality,
      status: s.status,
      impact: s.impact,
      detail: s.message || undefined,
      latencyMs: s.latencyMs,
    })),
  };
}
