import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  PROVIDER_META,
  defaultModelFor,
  findModel,
  listImplementedProviders,
  maskApiKey,
  modelSupports,
  modelsForProvider,
} from "./catalog";
import { getAdapter } from "./registry";
import { resolveModelForProvider } from "./resolve-config";
import { looksLikeProviderKey } from "./credentials";

describe("ai-core credentials", () => {
  it("rejeita chave vazia ou placeholder", () => {
    expect(looksLikeProviderKey("groq", "").ok).toBe(false);
    expect(looksLikeProviderKey("groq", "gsk_xxxx").ok).toBe(false);
    expect(looksLikeProviderKey("groq", "••••••••").ok).toBe(false);
    expect(looksLikeProviderKey("openai", "sk-short").ok).toBe(false);
  });

  it("aceita formato razoável de Groq/OpenAI", () => {
    expect(looksLikeProviderKey("groq", "gsk_" + "a".repeat(40)).ok).toBe(true);
    expect(looksLikeProviderKey("openai", "sk-" + "b".repeat(40)).ok).toBe(true);
  });

  it("healthCheck sem chave retorna ok=false", async () => {
    const a = getAdapter("groq");
    const h = await a.healthCheck("");
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/API Key|Informe/i);
  });
});

describe("ai-core catalog", () => {
  it("lista providers production-ready", () => {
    const ids = listImplementedProviders().map((p) => p.id);
    expect(ids).toContain("groq");
    expect(ids).toContain("openai");
    expect(ids).toContain("xai");
    expect(ids).not.toContain("anthropic"); // stub
  });

  it("modelSupports consulta matriz", () => {
    expect(modelSupports("groq", "llama-3.1-8b-instant", "TEXT")).toBe(true);
    expect(modelSupports("openai", "gpt-4o-mini", "TOOLS")).toBe(true);
  });

  it("maskApiKey não vaza chave", () => {
    const m = maskApiKey("gsk_abcdefghijklmnop");
    expect(m).not.toContain("efghijklmn");
    expect(m.startsWith("gsk_")).toBe(true);
  });

  it("defaultModelFor retorna modelo do catálogo", () => {
    const m = defaultModelFor("groq");
    expect(findModel("groq", m)).toBeTruthy();
  });

  it("MODEL_CATALOG só com providers conhecidos", () => {
    for (const m of MODEL_CATALOG) {
      expect(PROVIDER_META[m.provider]).toBeTruthy();
    }
  });
});

describe("ai-core adapters", () => {
  it("getAdapter openai-compatible gera adapters", () => {
    for (const id of ["groq", "openai", "xai", "openrouter", "mistral"] as const) {
      const a = getAdapter(id);
      expect(a.providerId).toBe(id);
      expect(a.listModels().length).toBeGreaterThan(0);
    }
  });

  it("stub anthropic não finge generate sem key real", async () => {
    const a = getAdapter("anthropic");
    const h = await a.healthCheck("sk-test");
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/homologado|não/i);
  });
});

describe("resolveModelForProvider", () => {
  it("troca modelo incompatível com provider", () => {
    expect(resolveModelForProvider("groq", "gpt-4o-mini")).toBe(defaultModelFor("groq"));
    expect(resolveModelForProvider("openai", "llama-3.3-70b-versatile")).toBe(
      defaultModelFor("openai")
    );
    expect(resolveModelForProvider("groq", "llama-3.1-8b-instant")).toBe("llama-3.1-8b-instant");
  });
});

describe("modelsForProvider", () => {
  it("filtra enabled production", () => {
    const groq = modelsForProvider("groq");
    expect(groq.every((m) => m.provider === "groq" && m.productionReady)).toBe(true);
  });
});
