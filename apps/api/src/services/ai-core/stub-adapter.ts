/**
 * Adapter stub para providers ainda não homologados (Anthropic nativo, Gemini nativo).
 * Não finge compatibilidade: generate/health retornam erro operacional claro.
 */
import type {
  AIProviderAdapter,
  AiCapability,
  AiProviderId,
  GenerateTextParams,
  GenerateTextResult,
  ModelCatalogEntry,
  ProviderHealth,
} from "./types";
import { PROVIDER_META, modelsForProvider } from "./catalog";

export function createStubAdapter(providerId: AiProviderId): AIProviderAdapter {
  const meta = PROVIDER_META[providerId];
  return {
    providerId,
    providerName: meta.name,
    capabilities(): AiCapability[] {
      return meta.capabilities;
    },
    listModels(): ModelCatalogEntry[] {
      return modelsForProvider(providerId, false);
    },
    async validateCredentials(_apiKey?: string, _baseUrl?: string, _model?: string): Promise<ProviderHealth> {
      return {
        ok: false,
        provider: providerId,
        message: `${meta.name} ainda não está homologado nativamente na NexaFlow. Use OpenRouter ou aguarde o adapter.`,
      };
    },
    async healthCheck(apiKey?: string, baseUrl?: string, model?: string): Promise<ProviderHealth> {
      return this.validateCredentials(apiKey || "", baseUrl, model);
    },
    async generate(
      _params: GenerateTextParams & { apiKey: string; baseUrl?: string; model: string }
    ): Promise<GenerateTextResult> {
      throw Object.assign(
        new Error(
          `MODEL_CAPABILITY_NOT_SUPPORTED: o adapter nativo de ${meta.name} ainda não está disponível.`
        ),
        { code: "MODEL_CAPABILITY_NOT_SUPPORTED" }
      );
    },
    normalizeError(err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { code: "PROVIDER_NOT_READY", message: msg, retryable: false };
    },
  };
}
