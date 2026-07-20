/**
 * NexaFlow AI Provider Gateway — única porta de saída para LLMs.
 */
import type {
  AiCapability,
  AiRuntimeConfig,
  GenerateTextParams,
  GenerateTextResult,
  ProviderHealth,
} from "./types";
import { getAdapter } from "./registry";
import { modelSupports, findModel } from "./catalog";
import { resolveAiRuntime, resolveModelForProvider } from "./resolve-config";

export class AiGatewayError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiGatewayError";
  }
}

function assertCapability(runtime: AiRuntimeConfig, cap: AiCapability) {
  if (!modelSupports(runtime.provider, runtime.model, cap)) {
    throw new AiGatewayError(
      "MODEL_CAPABILITY_NOT_SUPPORTED",
      `O modelo selecionado (${runtime.model}) não oferece suporte a ${cap}.`
    );
  }
}

async function runWithFallback(
  runtime: AiRuntimeConfig,
  fn: (r: AiRuntimeConfig) => Promise<GenerateTextResult>
): Promise<GenerateTextResult> {
  try {
    return await fn(runtime);
  } catch (err) {
    if (!runtime.fallbackProvider || !runtime.fallbackModel) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    const retryable =
      /RATE_LIMIT|PROVIDER_ERROR|429|rate limit/i.test(msg) ||
      (err as { code?: string }).code === "PROVIDER_RATE_LIMIT";
    if (!retryable) throw err;

    // fallback usa mesma apiKey só se mesmo modo platform_managed e env — para BYOK, fallback no mesmo provider/key
    const fb: AiRuntimeConfig = {
      ...runtime,
      provider: runtime.fallbackProvider,
      model: runtime.fallbackModel,
    };
    // se fallback for outro provider, precisa de chave do env/platform — só se platform key disponível
    if (fb.provider !== runtime.provider && runtime.credentialMode === "byok") {
      throw err; // não misturar BYOK de um provider com outro sem chave
    }
    return fn(fb);
  }
}

/** Gera texto via adapter do runtime resolvido. */
export async function generateText(
  runtime: AiRuntimeConfig,
  params: GenerateTextParams
): Promise<GenerateTextResult> {
  if (!runtime.apiKey) {
    throw new AiGatewayError("AI_NOT_CONFIGURED", "Nenhum provedor de IA configurado.");
  }
  const model = resolveModelForProvider(runtime.provider, params.model || runtime.model, runtime.model);
  const rt = { ...runtime, model };

  if (params.tools?.length) {
    assertCapability(rt, "TOOLS");
  }
  if (params.responseFormat === "json_object") {
    // structured: se não suportar, ainda tenta JSON mode em adapters compatíveis — se catalog nega, erro
    if (!modelSupports(rt.provider, rt.model, "STRUCTURED_OUTPUT") && !modelSupports(rt.provider, rt.model, "TEXT")) {
      throw new AiGatewayError(
        "MODEL_CAPABILITY_NOT_SUPPORTED",
        "O modelo não suporta saída estruturada."
      );
    }
  }

  return runWithFallback(rt, async (r) => {
    const adapter = getAdapter(r.provider);
    return adapter.generate({
      ...params,
      model: r.model,
      apiKey: r.apiKey,
      baseUrl: r.baseUrl,
    });
  });
}

/** Resolve + generate em um passo (escopo platform/tenant). */
export async function generateForScope(params: {
  scope: "platform" | "tenant";
  tenantId?: string | null;
  agentModelOverride?: string | null;
  messages: GenerateTextParams["messages"];
  temperature?: number;
  maxTokens?: number;
  tools?: GenerateTextParams["tools"];
  responseFormat?: GenerateTextParams["responseFormat"];
  /** capabilities obrigatórias antes de chamar */
  require?: AiCapability[];
}): Promise<GenerateTextResult | null> {
  const runtime = await resolveAiRuntime({
    scope: params.scope,
    tenantId: params.tenantId,
    agentModelOverride: params.agentModelOverride,
  });
  if (!runtime) return null;

  for (const cap of params.require || []) {
    if (!modelSupports(runtime.provider, runtime.model, cap)) {
      throw new AiGatewayError(
        "MODEL_CAPABILITY_NOT_SUPPORTED",
        `O modelo selecionado não oferece suporte ao recurso necessário (${cap}).`
      );
    }
  }

  return generateText(runtime, {
    messages: params.messages,
    model: runtime.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    tools: params.tools,
    responseFormat: params.responseFormat,
  });
}

export async function testConnection(runtime: AiRuntimeConfig): Promise<ProviderHealth> {
  const adapter = getAdapter(runtime.provider);
  // Sempre o modelo do runtime (selecionado na UI / TenantAiConfig)
  return adapter.healthCheck(runtime.apiKey, runtime.baseUrl, runtime.model);
}

export function describeRuntime(runtime: AiRuntimeConfig | null) {
  if (!runtime) {
    return { configured: false, provider: null as string | null, model: null as string | null };
  }
  const entry = findModel(runtime.provider, runtime.model);
  return {
    configured: true,
    provider: runtime.provider,
    model: runtime.model,
    modelDisplayName: entry?.displayName || runtime.model,
    credentialMode: runtime.credentialMode,
    scope: runtime.scope,
  };
}
