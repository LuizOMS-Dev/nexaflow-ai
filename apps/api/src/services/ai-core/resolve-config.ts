/**
 * Resolve runtime de IA: PLATFORM vs TENANT (BYOK).
 * NIA e tarefas de plataforma → sempre PLATFORM.
 * Agentes / tenant AI → TENANT se BYOK; senão platform_managed (env).
 */
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { decryptSecret } from "../security/crypto";
import type { AiProviderId, AiRuntimeConfig, AiScope, CredentialMode } from "./types";
import { PROVIDER_META, defaultModelFor, findModel } from "./catalog";

function platformFromEnv(): AiRuntimeConfig | null {
  if (!env.aiProvider || !env.aiApiKey) return null;
  const provider = env.aiProvider as AiProviderId;
  if (!PROVIDER_META[provider]) return null;
  return {
    scope: "platform",
    provider,
    model: env.aiModel || defaultModelFor(provider),
    apiKey: env.aiApiKey,
    baseUrl: env.aiBaseUrl || PROVIDER_META[provider].defaultBaseUrl,
    credentialMode: "platform_managed",
  };
}

/** Preferência: override do agente (se válido no provider) → modelo da empresa → default. */
function pickModel(
  provider: AiProviderId,
  agentOverride?: string | null,
  tenantModel?: string | null,
  platformModel?: string | null
): string {
  const o = (agentOverride || "").trim();
  if (o && findModel(provider, o)) return o;
  const t = (tenantModel || "").trim();
  if (t && findModel(provider, t)) return t;
  if (t) return t; // permite IDs custom (OpenRouter etc.)
  const p = (platformModel || "").trim();
  if (p) return p;
  return defaultModelFor(provider);
}

export type TenantAiConfigRow = {
  provider: string;
  model: string;
  credentialMode: string;
  apiKeyEnc: string | null;
  baseUrl: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  enabled: boolean;
};

/** Lê config do tenant (tabela TenantAiConfig). */
export async function loadTenantAiConfig(tenantId: string): Promise<TenantAiConfigRow | null> {
  try {
    const row = await prisma.tenantAiConfig.findUnique({ where: { tenantId } });
    return row;
  } catch {
    // migration ainda não aplicada
    return null;
  }
}

/**
 * Resolve credenciais + provider para um escopo.
 * agentModelOverride: só modelo, herda provider do tenant/platform.
 */
export async function resolveAiRuntime(params: {
  scope: AiScope;
  tenantId?: string | null;
  agentModelOverride?: string | null;
}): Promise<AiRuntimeConfig | null> {
  const platform = platformFromEnv();

  if (params.scope === "platform") {
    return platform;
  }

  const tenantId = params.tenantId;
  if (!tenantId) return platform;

  const row = await loadTenantAiConfig(tenantId);
  if (!row || !row.enabled) {
    // platform_managed: usa env da NexaFlow + modelo da empresa se houver
    if (!platform) return null;
    return {
      ...platform,
      scope: "tenant",
      tenantId,
      credentialMode: "platform_managed",
      model: pickModel(
        platform.provider,
        params.agentModelOverride,
        null,
        platform.model
      ),
    };
  }

  const provider = row.provider as AiProviderId;
  if (!PROVIDER_META[provider]?.productionReady) {
    // provider não homologado → cai no platform se existir
    return platform
      ? {
          ...platform,
          scope: "tenant",
          tenantId,
          credentialMode: "platform_managed",
          model: pickModel(
            platform.provider,
            params.agentModelOverride,
            row.model,
            platform.model
          ),
        }
      : null;
  }

  let apiKey = "";
  let credentialMode: CredentialMode = (row.credentialMode as CredentialMode) || "platform_managed";

  if (credentialMode === "byok" && row.apiKeyEnc) {
    try {
      apiKey = decryptSecret(row.apiKeyEnc).plain;
    } catch {
      apiKey = "";
    }
  }

  if (!apiKey) {
    // BYOK sem chave ou platform_managed → env da plataforma + modelo da empresa
    if (!platform) return null;
    return {
      ...platform,
      scope: "tenant",
      tenantId,
      credentialMode: "platform_managed",
      model: pickModel(
        platform.provider,
        params.agentModelOverride,
        row.model,
        platform.model
      ),
      fallbackProvider: (row.fallbackProvider as AiProviderId) || null,
      fallbackModel: row.fallbackModel,
    };
  }

  return {
    scope: "tenant",
    tenantId,
    provider,
    model: pickModel(provider, params.agentModelOverride, row.model, defaultModelFor(provider)),
    apiKey,
    baseUrl: row.baseUrl || PROVIDER_META[provider].defaultBaseUrl,
    credentialMode: "byok",
    fallbackProvider: (row.fallbackProvider as AiProviderId) || null,
    fallbackModel: row.fallbackModel,
  };
}

/** Resolve modelo preferido do agente com o provider atual (sem hardcode cross-provider). */
export function resolveModelForProvider(
  provider: AiProviderId,
  preferred?: string | null,
  fallback?: string
): string {
  const def = fallback || defaultModelFor(provider);
  if (!preferred?.trim()) return def;
  const p = preferred.trim();
  // se o ID parece de outro ecossistema, usa default do provider ativo
  const looksOpenAI = /^(gpt-|o1|o3)/i.test(p);
  const looksGrok = /grok/i.test(p);
  const looksLlama = /llama|mixtral|gemma|qwen/i.test(p);
  if (provider === "groq" && (looksOpenAI || looksGrok) && !looksLlama) return def;
  if (provider === "openai" && (looksGrok || looksLlama)) return def;
  if (provider === "xai" && (looksLlama || looksOpenAI)) return def;
  return p;
}
