import path from "path";
import { config } from "dotenv";

// Carrega .env da raiz do monorepo e do app
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(__dirname, "../../../../.env") });

// Não força SQLite — stack oficial é Postgres (Docker e produção).
// Em test, o setup.ts define DATABASE_URL isolado.

export type AiProvider = "groq" | "xai" | "openai";

function resolveAiProvider(): {
  provider: AiProvider | null;
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  if (process.env.GROQ_API_KEY) {
    return {
      provider: "groq",
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      model: process.env.GROQ_MODEL || process.env.AI_MODEL || "llama-3.1-8b-instant",
    };
  }
  if (process.env.XAI_API_KEY) {
    return {
      provider: "xai",
      apiKey: process.env.XAI_API_KEY,
      baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
      model: process.env.XAI_MODEL || process.env.AI_MODEL || "grok-4.5",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
    };
  }
  return { provider: null, apiKey: "", baseUrl: "", model: "heuristic" };
}

const ai = resolveAiProvider();
const nodeEnv = process.env.NODE_ENV || "development";

/** Defaults apenas em development — production falha no bootstrap se ausentes */
const DEV_JWT = "dev-secret-change-me-nexaflow-change-in-prod";
const DEV_COOKIE = "dev-cookie-secret";
const DEV_ENC = "dev-encryption-key-nexaflow-32b!!";

function envBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return defaultValue;
}

export const env = {
  nodeEnv,
  port: Number(process.env.API_PORT || 4000),
  host: process.env.API_HOST || "0.0.0.0",
  /** URL pública da API (webhooks, health docs) */
  apiUrl: (process.env.API_URL || `http://localhost:${process.env.API_PORT || 4000}`).replace(
    /\/$/,
    ""
  ),
  /** URL pública do front (links de convite / reset) */
  appPublicUrl: (process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  ),
  /** Lista de origins CSV; em dev aceita localhost:3000 */
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || (nodeEnv === "production" ? "" : DEV_JWT),
  /** Access token TTL (string fastify-jwt). Access real fixo 15m no session layer. */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  accessTokenMinutes: Math.min(
    60,
    Math.max(5, Number(process.env.ACCESS_TOKEN_MINUTES || 15) || 15)
  ),
  refreshTokenDays: Math.min(
    90,
    Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS || 30) || 30)
  ),
  /** Issuer/Audience fixos — não aceitar claims dinâmicos do cliente */
  jwtIssuer: process.env.JWT_ISSUER || "nexaflow-api",
  jwtAudience: process.env.JWT_AUDIENCE || "nexaflow-web",
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  cookieSecret:
    process.env.COOKIE_SECRET ||
    process.env.JWT_SECRET ||
    (nodeEnv === "production" ? "" : DEV_COOKIE),
  /** AES-256 material para secrets em repouso (TOTP) */
  encryptionKey: process.env.ENCRYPTION_KEY || (nodeEnv === "production" ? "" : DEV_ENC),
  /** Proxies confiáveis (CSV de IPs/CIDR). Vazio = trustProxy false em prod */
  trustProxy: process.env.TRUST_PROXY || (nodeEnv === "production" ? "loopback" : "true"),
  // 7MB: cobre data URL de avatar até 5MB binário
  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES || 7_340_032),
  maxPageSize: Number(process.env.MAX_PAGE_SIZE || 100),
  // IA multi-provedor (prioridade: Groq → xAI → OpenAI)
  aiProvider: ai.provider,
  aiApiKey: ai.apiKey,
  aiBaseUrl: ai.baseUrl,
  aiModel: ai.model,
  groqApiKey: process.env.GROQ_API_KEY || "",
  xaiApiKey: process.env.XAI_API_KEY || "",
  xaiBaseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
  xaiModel: process.env.XAI_MODEL || "grok-4.5",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "nexaflow-verify-token",
  waGatewayProvider: (process.env.WA_GATEWAY_PROVIDER || "baileys") as
    | "evolution"
    | "waha"
    | "baileys"
    | "simulated",
  waGatewayUrl: process.env.WA_GATEWAY_URL || process.env.EVOLUTION_BASE_URL || "",
  waGatewayApiKey:
    process.env.WA_GATEWAY_API_KEY || process.env.EVOLUTION_API_KEY || "nexaflow-evolution-key",
  storagePath: process.env.STORAGE_LOCAL_PATH || "./uploads",
  storageDriver: (process.env.STORAGE_DRIVER || "local").toLowerCase(),
  /** Sessões Baileys (volume persistente em produção) */
  waSessionsDir: process.env.WA_SESSIONS_DIR || "",
  /** Mail: log | none | resend */
  mailProvider: (
    process.env.MAIL_PROVIDER || (nodeEnv === "production" ? "none" : "log")
  ).toLowerCase(),
  mailApiKey: process.env.MAIL_API_KEY || process.env.RESEND_API_KEY || "",
  mailFrom:
    process.env.MAIL_FROM || process.env.RESEND_FROM || "NexaFlow <onboarding@resend.dev>",
  /** Destino das notificações de pedidos de demonstração do site público. */
  salesEmail: process.env.SALES_EMAIL || "",
  /**
   * Superadmin: MFA obrigatório para /admin.
   * - production: true (padrão)
   * - development: false (padrão) — facilita testes locais
   * Override: SUPERADMIN_MFA_REQUIRED=0|1|true|false
   */
  superadminMfaRequired: envBool(
    process.env.SUPERADMIN_MFA_REQUIRED,
    nodeEnv === "production"
  ),
  /** Limite de envios de campanha por execução síncrona (proteção) */
  campaignBatchLimit: Math.min(
    500,
    Math.max(10, Number(process.env.CAMPAIGN_BATCH_LIMIT || 100) || 100)
  ),
};

/** Gateway pronto: Baileys roda embutido; Evolution/WAHA precisam de URL */
export function isWaGatewayReady() {
  if (env.waGatewayProvider === "simulated") return true;
  if (env.waGatewayProvider === "baileys") return true;
  return Boolean(env.waGatewayUrl);
}
