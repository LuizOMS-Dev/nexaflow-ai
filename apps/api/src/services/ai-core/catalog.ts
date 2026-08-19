/**
 * Catálogo de providers e modelos (atualizável sem migrations).
 * productionReady=false → aparece como "em breve" se não implementado de verdade.
 */
import type { AiCapability, AiProviderId, ModelCatalogEntry, ProviderMeta } from "./types";

const TEXT_TOOLS: AiCapability[] = ["TEXT", "STREAMING", "TOOLS", "STRUCTURED_OUTPUT"];
const TEXT_BASIC: AiCapability[] = ["TEXT", "STREAMING"];

export const PROVIDER_META: Record<AiProviderId, ProviderMeta> = {
  groq: {
    id: "groq",
    name: "Groq",
    openaiCompatible: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    productionReady: true,
    capabilities: TEXT_TOOLS,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    openaiCompatible: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    productionReady: true,
    capabilities: [...TEXT_TOOLS, "VISION", "EMBEDDINGS", "PARALLEL_TOOL_CALLS"],
  },
  xai: {
    id: "xai",
    name: "xAI",
    openaiCompatible: true,
    defaultBaseUrl: "https://api.x.ai/v1",
    productionReady: true,
    capabilities: TEXT_TOOLS,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    openaiCompatible: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    productionReady: true,
    capabilities: TEXT_TOOLS,
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    openaiCompatible: true,
    defaultBaseUrl: "https://api.mistral.ai/v1",
    productionReady: true,
    capabilities: TEXT_TOOLS,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    openaiCompatible: false,
    defaultBaseUrl: "https://api.anthropic.com",
    productionReady: false,
    capabilities: TEXT_BASIC,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    openaiCompatible: false,
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    productionReady: false,
    capabilities: TEXT_BASIC,
  },
};

/** Modelos conhecidos — fonte única (não espalhar IDs no código de negócio). */
export const MODEL_CATALOG: ModelCatalogEntry[] = [
  // Groq — modelos de produção atuais (Llama 3.1/3.3 saíram de linha em 16/08/2026)
  {
    provider: "groq",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B (recomendado para atendimento)",
    enabled: true,
    capabilities: TEXT_TOOLS,
    contextWindow: 131072,
    productionReady: true,
  },
  {
    provider: "groq",
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B (máxima qualidade)",
    enabled: true,
    capabilities: TEXT_TOOLS,
    contextWindow: 131072,
    productionReady: true,
  },
  {
    provider: "groq",
    modelId: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B",
    enabled: true,
    capabilities: TEXT_TOOLS,
    contextWindow: 131072,
    productionReady: true,
  },
  // OpenAI
  {
    provider: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    enabled: true,
    capabilities: [...TEXT_TOOLS, "VISION", "PARALLEL_TOOL_CALLS"],
    contextWindow: 128000,
    productionReady: true,
  },
  {
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    enabled: true,
    capabilities: [...TEXT_TOOLS, "VISION", "PARALLEL_TOOL_CALLS"],
    contextWindow: 128000,
    productionReady: true,
  },
  // xAI
  {
    provider: "xai",
    modelId: "grok-4.5",
    displayName: "Grok 4.5",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  {
    provider: "xai",
    modelId: "grok-2-latest",
    displayName: "Grok 2",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  // OpenRouter (exemplos)
  {
    provider: "openrouter",
    modelId: "openai/gpt-4o-mini",
    displayName: "OpenRouter · GPT-4o mini",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  {
    provider: "openrouter",
    modelId: "anthropic/claude-3.5-sonnet",
    displayName: "OpenRouter · Claude 3.5 Sonnet",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  // Mistral
  {
    provider: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  {
    provider: "mistral",
    modelId: "mistral-large-latest",
    displayName: "Mistral Large",
    enabled: true,
    capabilities: TEXT_TOOLS,
    productionReady: true,
  },
  // Anthropic / Gemini — catalogados mas adapter ainda não production-ready
  {
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-latest",
    displayName: "Claude 3.5 Sonnet",
    enabled: false,
    capabilities: TEXT_BASIC,
    productionReady: false,
  },
  {
    provider: "gemini",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    enabled: false,
    capabilities: TEXT_BASIC,
    productionReady: false,
  },
];

export function listImplementedProviders(): ProviderMeta[] {
  return Object.values(PROVIDER_META).filter((p) => p.productionReady);
}

export function listAllProviders(): ProviderMeta[] {
  return Object.values(PROVIDER_META);
}

export function modelsForProvider(provider: AiProviderId, onlyEnabled = true): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter(
    (m) => m.provider === provider && (!onlyEnabled || (m.enabled && m.productionReady))
  );
}

export function findModel(provider: AiProviderId, modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.provider === provider && m.modelId === modelId);
}

export function modelSupports(provider: AiProviderId, modelId: string, cap: AiCapability): boolean {
  const m = findModel(provider, modelId);
  if (m) return m.capabilities.includes(cap);
  // desconhecido: assume TEXT apenas
  return cap === "TEXT";
}

export function defaultModelFor(provider: AiProviderId): string {
  const first = modelsForProvider(provider)[0];
  return first?.modelId || "unknown";
}

/** IDs Groq descontinuados → modelo de produção atual. */
const GROQ_MODEL_ALIASES: Record<string, string> = {
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama-3.1-70b-versatile": "openai/gpt-oss-120b",
  "mixtral-8x7b-32768": "openai/gpt-oss-20b",
  "gemma2-9b-it": "openai/gpt-oss-20b",
  "qwen/qwen3-32b": "qwen/qwen3.6-27b",
};

export function canonicalizeGroqModel(modelId: string): string {
  const id = (modelId || "").trim();
  return GROQ_MODEL_ALIASES[id] || id;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••••••${key.slice(-4)}`;
}
