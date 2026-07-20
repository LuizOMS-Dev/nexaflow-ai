import type { AiProviderId, AIProviderAdapter } from "./types";
import { createOpenAICompatibleAdapter } from "./openai-compatible-adapter";
import { createStubAdapter } from "./stub-adapter";

const cache = new Map<AiProviderId, AIProviderAdapter>();

export function getAdapter(providerId: AiProviderId): AIProviderAdapter {
  let a = cache.get(providerId);
  if (a) return a;
  switch (providerId) {
    case "openai":
    case "groq":
    case "xai":
    case "openrouter":
    case "mistral":
      a = createOpenAICompatibleAdapter(providerId);
      break;
    case "anthropic":
    case "gemini":
      a = createStubAdapter(providerId);
      break;
    default:
      a = createStubAdapter("gemini");
  }
  cache.set(providerId, a);
  return a;
}
