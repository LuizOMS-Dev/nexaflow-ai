import { afterEach, describe, expect, it } from "vitest";
import { cosineSimilarity, embedTexts, resolveEmbeddingRuntime } from "./embeddings";

describe("embedding provider", () => {
  const prevProvider = process.env.EMBEDDING_PROVIDER;
  const prevMock = process.env.EMBEDDING_MOCK;

  afterEach(() => {
    process.env.EMBEDDING_PROVIDER = prevProvider;
    process.env.EMBEDDING_MOCK = prevMock;
  });

  it("mock está disponível e gera dimensão estável", async () => {
    process.env.EMBEDDING_PROVIDER = "mock";
    const rt = resolveEmbeddingRuntime();
    expect(rt.available).toBe(true);
    expect(rt.provider).toBe("mock");
    const batch = await embedTexts(["horário de funcionamento"]);
    expect(batch?.dimension).toBe(32);
    expect(batch?.vectors[0]).toHaveLength(32);
  });

  it("sinônimos de preço ficam mais próximos que texto sem relação", async () => {
    process.env.EMBEDDING_PROVIDER = "mock";
    const batch = await embedTexts([
      "Qual o valor do plano?",
      "Qual o preço do plano?",
      "A política de privacidade da empresa",
    ]);
    expect(batch).toBeTruthy();
    const [a, b, c] = batch!.vectors;
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });

  it("provider none desliga embeddings mesmo com chave", () => {
    process.env.EMBEDDING_PROVIDER = "none";
    process.env.EMBEDDING_MOCK = "";
    const rt = resolveEmbeddingRuntime();
    expect(rt.available).toBe(false);
  });
});
