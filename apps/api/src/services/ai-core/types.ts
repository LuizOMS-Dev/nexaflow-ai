/**
 * NexaFlow AI Core — tipos canônicos (independentes de provider).
 */

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "xai"
  | "mistral";

export type AiCapability =
  | "TEXT"
  | "STREAMING"
  | "TOOLS"
  | "STRUCTURED_OUTPUT"
  | "VISION"
  | "EMBEDDINGS"
  | "PARALLEL_TOOL_CALLS"
  | "REASONING";

export type AiScope = "platform" | "tenant";

export type CredentialMode = "platform_managed" | "byok";

export type NexaFlowRole = "system" | "user" | "assistant" | "tool";

export type NexaFlowMessage = {
  role: NexaFlowRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: NexaFlowToolCall[];
};

export type NexaFlowToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type NexaFlowToolDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type GenerateTextParams = {
  messages: NexaFlowMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: NexaFlowToolDefinition[];
  /** JSON schema hint for structured mode */
  responseFormat?: "text" | "json_object";
};

export type GenerateTextResult = {
  content: string;
  provider: AiProviderId;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  toolCalls?: NexaFlowToolCall[];
  finishReason?: string;
  raw?: unknown;
};

export type AiRuntimeConfig = {
  scope: AiScope;
  provider: AiProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
  credentialMode: CredentialMode;
  /** tenantId quando scope=tenant */
  tenantId?: string;
  fallbackProvider?: AiProviderId | null;
  fallbackModel?: string | null;
};

export type ProviderHealth = {
  ok: boolean;
  provider: AiProviderId;
  latencyMs?: number;
  message: string;
  modelTried?: string;
};

export type ModelCatalogEntry = {
  provider: AiProviderId;
  modelId: string;
  displayName: string;
  enabled: boolean;
  capabilities: AiCapability[];
  contextWindow?: number;
  /** Se false, adapter ainda não homologado em produção */
  productionReady: boolean;
};

export type ProviderMeta = {
  id: AiProviderId;
  name: string;
  /** OpenAI-compatible chat completions API */
  openaiCompatible: boolean;
  defaultBaseUrl: string;
  productionReady: boolean;
  capabilities: AiCapability[];
};

export interface AIProviderAdapter {
  readonly providerId: AiProviderId;
  readonly providerName: string;
  capabilities(): AiCapability[];
  listModels(): ModelCatalogEntry[];
  validateCredentials(apiKey: string, baseUrl?: string, model?: string): Promise<ProviderHealth>;
  generate(params: GenerateTextParams & { apiKey: string; baseUrl?: string; model: string }): Promise<GenerateTextResult>;
  /** model opcional — se omitido, usa o primeiro do catálogo (legado). Preferir sempre o modelo selecionado. */
  healthCheck(apiKey: string, baseUrl?: string, model?: string): Promise<ProviderHealth>;
  normalizeError(err: unknown): { code: string; message: string; retryable: boolean };
}
