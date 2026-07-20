/**
 * API Keys programáticas — hash SHA-256, prefixo nxf_live_, scopes.
 * Tenant sempre derivado da chave autenticada.
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { AppError } from "../lib/errors";
import { getTenantLimits } from "./entitlements";

export const API_SCOPES = [
  { id: "contacts:read", label: "Ler contatos" },
  { id: "contacts:write", label: "Criar/editar contatos" },
  { id: "conversations:read", label: "Ler conversas" },
  { id: "opportunities:read", label: "Ler oportunidades" },
  { id: "opportunities:write", label: "Criar/editar oportunidades" },
  { id: "tasks:read", label: "Ler tarefas" },
  { id: "tasks:write", label: "Criar/editar tarefas" },
] as const;

export type ApiScopeId = (typeof API_SCOPES)[number]["id"];
export const API_SCOPE_SET = new Set<string>(API_SCOPES.map((s) => s.id));

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateApiKeySecret(): { secret: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const secret = `nxf_live_${raw}`;
  const prefix = secret.slice(0, 16);
  return { secret, prefix, hash: hashApiKey(secret) };
}

export async function assertApiAccess(tenantId: string) {
  const { assertTenantCanUsePublicApi } = await import("./access-gate");
  await assertTenantCanUsePublicApi(tenantId);
  const limits = await getTenantLimits(tenantId);
  if (!limits.features.api) {
    throw new AppError(
      "API não incluída no seu plano atual. Faça upgrade para usar chaves de API.",
      403,
      "API_NOT_IN_PLAN"
    );
  }
}

export async function assertWebhookAccess(tenantId: string) {
  const { evaluateTenantOperationalGate } = await import("./access-gate");
  const gate = await evaluateTenantOperationalGate(tenantId);
  if (gate.operationalPaused || !gate.decision.capabilities.canDispatchWebhooks) {
    throw new AppError(
      "Webhooks pausados para esta empresa (acesso restrito ou bloqueado).",
      403,
      gate.code
    );
  }
  const limits = await getTenantLimits(tenantId);
  // Fonte de verdade: features.webhooks no plano; fallback por slug conhecido
  const allow =
    boolRaw(limits.features.raw.webhooks, false) ||
    limits.features.api ||
    ["pro", "business", "enterprise"].includes(limits.planSlug || "");
  if (!allow) {
    throw new AppError(
      "Webhooks não estão disponíveis no seu plano atual.",
      403,
      "WEBHOOKS_NOT_IN_PLAN"
    );
  }
}

function boolRaw(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

export async function getWebhookLimit(tenantId: string): Promise<number> {
  const limits = await getTenantLimits(tenantId);
  const n = Number(limits.features.raw.webhooksLimit);
  if (Number.isFinite(n) && n >= 0) return n;
  if (limits.features.api) return 20;
  if (limits.planSlug === "pro") return 5;
  if (limits.planSlug === "business" || limits.planSlug === "enterprise") return 50;
  return 1;
}

export async function getApiKeyLimit(tenantId: string): Promise<number> {
  const limits = await getTenantLimits(tenantId);
  const n = Number(limits.features.raw.apiKeysLimit);
  if (Number.isFinite(n) && n >= 0) return n;
  return limits.features.api ? 10 : 0;
}

export async function createApiKey(params: {
  tenantId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
  createdById?: string | null;
}) {
  await assertApiAccess(params.tenantId);
  const limit = await getApiKeyLimit(params.tenantId);
  const active = await prisma.apiKey.count({
    where: { tenantId: params.tenantId, revokedAt: null },
  });
  if (active >= limit) {
    throw new AppError(`Limite de ${limit} chave(s) de API no plano.`, 403, "API_KEY_LIMIT");
  }

  const scopes = params.scopes.filter((s) => API_SCOPE_SET.has(s));
  if (!scopes.length) {
    throw new AppError("Selecione ao menos um escopo válido.", 400);
  }

  const { secret, prefix, hash } = generateApiKeySecret();
  const row = await prisma.apiKey.create({
    data: {
      tenantId: params.tenantId,
      name: params.name.trim().slice(0, 80),
      keyPrefix: prefix,
      keyHash: hash,
      scopes: asInputJson(scopes),
      expiresAt: params.expiresAt || null,
      createdById: params.createdById || null,
    },
  });

  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    /** Só retornado uma vez */
    secret,
  };
}

export type AuthenticatedApiKey = {
  apiKeyId: string;
  tenantId: string;
  scopes: string[];
  name: string;
};

export async function authenticateApiKey(
  authorizationHeader?: string | null
): Promise<AuthenticatedApiKey | null> {
  if (!authorizationHeader) return null;
  let secret = authorizationHeader.trim();
  if (secret.toLowerCase().startsWith("bearer ")) {
    secret = secret.slice(7).trim();
  }
  if (!secret.startsWith("nxf_live_")) return null;

  const hash = hashApiKey(secret);
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  const scopes = Array.isArray(row.scopes)
    ? (row.scopes as string[])
    : [];

  // touch last used (fire-and-forget)
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => null);

  return {
    apiKeyId: row.id,
    tenantId: row.tenantId,
    scopes,
    name: row.name,
  };
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

export async function logApiUsage(params: {
  tenantId: string;
  apiKeyId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs?: number;
  ip?: string;
}) {
  try {
    await prisma.apiUsageLog.create({
      data: {
        tenantId: params.tenantId,
        apiKeyId: params.apiKeyId || undefined,
        method: params.method.slice(0, 10),
        path: params.path.slice(0, 200),
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        ip: params.ip?.slice(0, 64),
      },
    });
  } catch {
    /* ignore */
  }
}
