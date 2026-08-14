/**
 * Adapter genérico OpenAI-compatible (Groq, OpenAI, xAI, OpenRouter, Mistral, …).
 */
import OpenAI from "openai";
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
import { looksLikeProviderKey } from "./credentials";

export function createOpenAICompatibleAdapter(providerId: AiProviderId): AIProviderAdapter {
  const meta = PROVIDER_META[providerId];
  if (!meta.openaiCompatible) {
    throw new Error(`Provider ${providerId} is not OpenAI-compatible`);
  }

  function client(apiKey: string, baseUrl?: string) {
    return new OpenAI({
      apiKey,
      baseURL: baseUrl || meta.defaultBaseUrl,
      defaultHeaders:
        providerId === "openrouter"
          ? {
              "HTTP-Referer": process.env.APP_PUBLIC_URL || "https://nexaflow.ai",
              "X-Title": "NexaFlow",
            }
          : undefined,
      // falha rápido se auth inválida
      timeout: 20_000,
      maxRetries: 0,
    });
  }

  function normalizeError(err: unknown): { code: string; message: string; retryable: boolean } {
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      typeof err === "object" && err && "status" in err
        ? Number((err as { status?: number }).status)
        : undefined;
    if (status === 401 || /\b401\b|unauthorized|invalid.?api.?key|incorrect api key|authentication/i.test(msg)) {
      return { code: "PROVIDER_AUTH", message: "Chave de API inválida ou não autorizada.", retryable: false };
    }
    if (status === 403 || /\b403\b|forbidden|permission/i.test(msg)) {
      return { code: "PROVIDER_FORBIDDEN", message: "Acesso negado pelo provedor de IA.", retryable: false };
    }
    if (status === 429 || /\b429\b|rate limit|tokens per day|TPD|quota/i.test(msg)) {
      return { code: "PROVIDER_RATE_LIMIT", message: "Limite do provedor de IA atingido.", retryable: true };
    }
    if (status === 404 || /model.?not.?found|does not exist/i.test(msg)) {
      return {
        code: "PROVIDER_MODEL",
        message: "Modelo não encontrado neste provedor. Verifique o modelo padrão.",
        retryable: false,
      };
    }
    return {
      code: "PROVIDER_ERROR",
      message: msg.slice(0, 180) || "Falha ao chamar o provedor de IA.",
      retryable: true,
    };
  }

  return {
    providerId,
    providerName: meta.name,
    capabilities(): AiCapability[] {
      return meta.capabilities;
    },
    listModels(): ModelCatalogEntry[] {
      return modelsForProvider(providerId, false);
    },
    async validateCredentials(apiKey: string, baseUrl?: string, model?: string): Promise<ProviderHealth> {
      return this.healthCheck(apiKey, baseUrl, model);
    },
    async healthCheck(apiKey: string, baseUrl?: string, model?: string): Promise<ProviderHealth> {
      const started = Date.now();
      // Modelo EXPLÍCITO do usuário tem prioridade — nunca “inventar” o primeiro do catálogo se veio outro
      const catalog = modelsForProvider(providerId, false);
      const requested = (model || "").trim();
      const known = requested ? catalog.find((m) => m.modelId === requested) : null;
      const modelId =
        known?.modelId ||
        requested ||
        catalog.find((m) => m.enabled && m.productionReady)?.modelId ||
        catalog[0]?.modelId;
      const modelLabel = known?.displayName || modelId || "modelo";
      const format = looksLikeProviderKey(providerId, apiKey);
      if (!format.ok) {
        return {
          ok: false,
          provider: providerId,
          message: format.message || "API Key inválida.",
          modelTried: modelId,
        };
      }
      if (!modelId) {
        return {
          ok: false,
          provider: providerId,
          message: "Nenhum modelo disponível para testar neste provedor.",
          modelTried: undefined,
        };
      }
      try {
        const c = client(apiKey.trim(), baseUrl);
        const completion = await c.chat.completions.create({
          model: modelId,
          max_tokens: 8,
          temperature: 0,
          messages: [{ role: "user", content: "Responda apenas: ok" }],
        });
        // Exige resposta real do provedor (não aceitar “sucesso vazio”)
        const choice = completion.choices?.[0];
        const hasId = Boolean(completion.id);
        const hasChoice = Boolean(choice);
        const usedModel = completion.model || modelId;
        if (!hasId && !hasChoice) {
          return {
            ok: false,
            provider: providerId,
            latencyMs: Date.now() - started,
            message: `O provedor não retornou uma resposta válida (modelo ${modelLabel}).`,
            modelTried: usedModel,
          };
        }
        return {
          ok: true,
          provider: providerId,
          latencyMs: Date.now() - started,
          message: `Conexão com ${meta.name} OK · modelo ${modelLabel}${usedModel && usedModel !== modelId ? ` (${usedModel})` : ""}.`,
          modelTried: usedModel,
        };
      } catch (err) {
        const n = normalizeError(err);
        return {
          ok: false,
          provider: providerId,
          latencyMs: Date.now() - started,
          message: `${n.message} (modelo ${modelLabel})`,
          modelTried: modelId,
        };
      }
    },
    async generate(
      params: GenerateTextParams & { apiKey: string; baseUrl?: string; model: string }
    ): Promise<GenerateTextResult> {
      const c = client(params.apiKey, params.baseUrl);
      const messages = params.messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            content: m.content,
            tool_call_id: m.toolCallId || "tool",
          };
        }
        if (m.toolCalls?.length) {
          return {
            role: "assistant" as const,
            content: m.content || null,
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: JSON.stringify(t.arguments || {}) },
            })),
          };
        }
        return {
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        };
      });

      try {
        const completion = await c.chat.completions.create({
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          response_format:
            params.responseFormat === "json_object" ? { type: "json_object" } : undefined,
          tools: params.tools?.length
            ? params.tools.map((t) => ({
                type: "function" as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters || { type: "object", properties: {} },
                },
              }))
            : undefined,
        });

        const choice = completion.choices[0]?.message;
        const toolCalls =
          choice?.tool_calls?.map((tc) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              args = {};
            }
            return { id: tc.id, name: tc.function.name, arguments: args };
          }) || undefined;

        return {
          content: (choice?.content || "").trim(),
          provider: providerId,
          model: params.model,
          usage: {
            inputTokens: completion.usage?.prompt_tokens,
            outputTokens: completion.usage?.completion_tokens,
            totalTokens: completion.usage?.total_tokens,
          },
          toolCalls,
          finishReason: completion.choices[0]?.finish_reason || undefined,
        };
      } catch (err) {
        const n = normalizeError(err);
        const e = new Error(n.message);
        (e as Error & { code?: string }).code = n.code;
        throw e;
      }
    },
    normalizeError,
  };
}
