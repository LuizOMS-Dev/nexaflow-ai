/**
 * Validação de API keys — nunca aceitar vazio/placeholder como "ok".
 */
import type { AiProviderId } from "./types";

const PLACEHOLDERS = [
  "your-api-key",
  "sua-chave",
  "change-me",
  "xxx",
  "sk-xxxx",
  "gsk_xxxx",
  "test",
  "demo",
  "null",
  "undefined",
  "••••",
];

/** Formato mínimo esperado por provedor (prefixo + comprimento). */
export function looksLikeProviderKey(provider: AiProviderId, apiKey: string): {
  ok: boolean;
  message?: string;
} {
  const key = (apiKey || "").trim();
  if (!key) {
    return { ok: false, message: "Informe a API Key do provedor." };
  }
  if (key.length < 16) {
    return { ok: false, message: "A API Key parece incompleta (muito curta)." };
  }
  const lower = key.toLowerCase();
  if (PLACEHOLDERS.some((p) => lower === p || lower.includes(p))) {
    return { ok: false, message: "Informe uma API Key real, não um placeholder." };
  }
  // só máscara
  if (/^[\u2022•*xX.\-_\s]+$/.test(key) || key.includes("••••")) {
    return { ok: false, message: "Cole a chave completa, não a versão mascarada." };
  }

  switch (provider) {
    case "groq":
      if (!/^gsk_/i.test(key)) {
        return { ok: false, message: "Chaves Groq costumam começar com gsk_." };
      }
      break;
    case "openai":
      if (!/^sk-/i.test(key)) {
        return { ok: false, message: "Chaves OpenAI costumam começar com sk-." };
      }
      break;
    case "xai":
      if (!/^xai-/i.test(key) && !/^sk-/i.test(key)) {
        // xAI tem variado; não bloquear se for longa o suficiente
        if (key.length < 20) {
          return { ok: false, message: "API Key xAI parece inválida." };
        }
      }
      break;
    case "openrouter":
      if (!/^sk-or-/i.test(key) && !/^sk-/i.test(key)) {
        if (key.length < 20) {
          return { ok: false, message: "API Key OpenRouter parece inválida." };
        }
      }
      break;
    case "mistral":
      if (key.length < 20) {
        return { ok: false, message: "API Key Mistral parece incompleta." };
      }
      break;
    case "anthropic":
      if (!/^sk-ant-/i.test(key)) {
        return { ok: false, message: "Chaves Anthropic costumam começar com sk-ant-." };
      }
      break;
    case "gemini":
      if (key.length < 20) {
        return { ok: false, message: "API Key Gemini parece incompleta." };
      }
      break;
    default:
      break;
  }

  return { ok: true };
}
