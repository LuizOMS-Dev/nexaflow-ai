import { env } from "../../lib/env";
import { hasMinSecretEntropy } from "./crypto";

export type GuardIssue = {
  code: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  message: string;
};

const DEFAULT_SECRETS = [
  "dev-secret-change-me-nexaflow-change-in-prod",
  "dev-cookie-secret",
  "change-me",
];

/**
 * Validação fail-closed de produção.
 * Retorna issues; em production o bootstrap deve exit(1) se houver CRITICAL.
 */
export function collectProductionIssues(opts?: {
  redisOk?: boolean | null;
  skipRedis?: boolean;
}): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const isProd = env.nodeEnv === "production";

  if (!isProd) {
    // Em dev, apenas avisos soft se secrets default
    if (DEFAULT_SECRETS.includes(env.jwtSecret)) {
      issues.push({
        code: "DEV_JWT_DEFAULT",
        severity: "MEDIUM",
        message: "JWT_SECRET default em desenvolvimento (ok para dev, proibido em prod).",
      });
    }
    return issues;
  }

  if (!process.env.JWT_SECRET || DEFAULT_SECRETS.includes(env.jwtSecret)) {
    issues.push({
      code: "JWT_SECRET_INVALID",
      severity: "CRITICAL",
      message: "JWT_SECRET ausente, default ou inseguro em production.",
    });
  } else if (!hasMinSecretEntropy(env.jwtSecret, 32)) {
    issues.push({
      code: "JWT_SECRET_WEAK",
      severity: "CRITICAL",
      message: "JWT_SECRET com entropia insuficiente (mín. 32 chars, sem padrões fracos).",
    });
  }

  if (!process.env.COOKIE_SECRET && !process.env.JWT_SECRET) {
    issues.push({
      code: "COOKIE_SECRET_MISSING",
      severity: "CRITICAL",
      message: "COOKIE_SECRET ausente em production.",
    });
  } else if (!hasMinSecretEntropy(env.cookieSecret, 24)) {
    issues.push({
      code: "COOKIE_SECRET_WEAK",
      severity: "HIGH",
      message: "COOKIE_SECRET fraco.",
    });
  }

  if (!process.env.ENCRYPTION_KEY || !hasMinSecretEntropy(env.encryptionKey, 32)) {
    issues.push({
      code: "ENCRYPTION_KEY_INVALID",
      severity: "CRITICAL",
      message: "ENCRYPTION_KEY ausente ou fraca (necessária para TOTP em repouso).",
    });
  }

  const cors = (env.corsOrigin || "").trim();
  if (!cors || cors === "*" || cors.includes("localhost")) {
    issues.push({
      code: "CORS_INSECURE",
      severity: "CRITICAL",
      message: "CORS_ORIGIN vazio, * ou localhost em production.",
    });
  }

  if (!opts?.skipRedis) {
    if (process.env.RATE_LIMIT_REDIS === "0" && process.env.ALLOW_MEMORY_RATE_LIMIT !== "1") {
      issues.push({
        code: "RATE_LIMIT_MEMORY",
        severity: "CRITICAL",
        message:
          "Rate limit em memória em production. Defina REDIS_URL ou ALLOW_MEMORY_RATE_LIMIT=1 (não recomendado).",
      });
    }
    if (opts?.redisOk === false) {
      issues.push({
        code: "REDIS_UNAVAILABLE",
        severity: "CRITICAL",
        message: "Redis necessário indisponível em production.",
      });
    }
  }

  if (process.env.ALLOW_DEMO_ACCOUNTS === "1") {
    issues.push({
      code: "DEMO_ACCOUNTS_ALLOWED",
      severity: "HIGH",
      message: "ALLOW_DEMO_ACCOUNTS=1 em production.",
    });
  }

  if (process.env.SEED_DEMO_ENABLED === "true" || process.env.SEED_DEMO_ENABLED === "1") {
    issues.push({
      code: "SEED_DEMO_ENABLED",
      severity: "HIGH",
      message: "SEED_DEMO_ENABLED em production — seeds de demo devem ser desligados.",
    });
  }

  if (!env.databaseUrl || !/^postgres(ql)?:\/\//i.test(env.databaseUrl)) {
    issues.push({
      code: "DATABASE_URL_INVALID",
      severity: "CRITICAL",
      message: "DATABASE_URL ausente ou não-Postgres em production.",
    });
  }

  const appUrl = (env.appPublicUrl || "").toLowerCase();
  if (!appUrl || appUrl.includes("localhost") || !appUrl.startsWith("https://")) {
    issues.push({
      code: "APP_PUBLIC_URL_INSECURE",
      severity: "HIGH",
      message: "APP_PUBLIC_URL deve ser HTTPS público em production (convites/reset).",
    });
  }

  if (env.mailProvider === "none" || env.mailProvider === "log" || env.mailProvider === "console") {
    issues.push({
      code: "MAIL_DISABLED",
      severity: "HIGH",
      message: "MAIL_PROVIDER não entrega e-mails — convites e reset de senha ficariam indisponíveis.",
    });
  } else if (env.mailProvider === "resend" && !env.mailApiKey) {
    issues.push({
      code: "MAIL_KEY_MISSING",
      severity: "HIGH",
      message: "MAIL_PROVIDER=resend sem MAIL_API_KEY/RESEND_API_KEY.",
    });
  } else if (env.mailProvider === "resend" && /onboarding@resend\.dev/i.test(env.mailFrom)) {
    issues.push({
      code: "MAIL_FROM_PLACEHOLDER",
      severity: "HIGH",
      message: "MAIL_FROM ainda usa o remetente de teste onboarding@resend.dev.",
    });
  }

  const apiUrl = (env.apiUrl || "").toLowerCase();
  if (!apiUrl || apiUrl.includes("localhost") || !apiUrl.startsWith("https://")) {
    issues.push({
      code: "API_URL_INSECURE",
      severity: "HIGH",
      message: "API_URL deve ser HTTPS público em production (webhooks e integrações).",
    });
  }

  if (
    ["evolution", "waha"].includes(env.waGatewayProvider) &&
    (!env.waGatewayApiKey || env.waGatewayApiKey === "nexaflow-evolution-key")
  ) {
    issues.push({
      code: "WHATSAPP_GATEWAY_KEY_DEFAULT",
      severity: "CRITICAL",
      message: "A chave do gateway WhatsApp está ausente ou usa o valor local padrão.",
    });
  }

  if (!env.superadminMfaRequired) {
    issues.push({
      code: "SUPERADMIN_MFA_OPTIONAL",
      severity: "CRITICAL",
      message:
        "SUPERADMIN_MFA_REQUIRED desligado em production. Defina SUPERADMIN_MFA_REQUIRED=1.",
    });
  }

  // Testes nunca devem apontar para o mesmo DATABASE_URL de produção
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    issues.push({
      code: "TEST_IN_PROD_CONTEXT",
      severity: "CRITICAL",
      message: "Execução de testes detectada com NODE_ENV de produção.",
    });
  }

  return issues;
}

export function assertProductionSafe(opts?: { redisOk?: boolean | null }) {
  const issues = collectProductionIssues(opts);
  const blockers = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
  if (blockers.length && env.nodeEnv === "production") {
    const msg = blockers.map((b) => `[${b.code}] ${b.message}`).join("\n");
    throw new Error(`PRODUCTION SECURITY FAIL-CLOSED:\n${msg}`);
  }
  return issues;
}
