/**
 * Provider de embeddings independente da geração (Groq).
 * Produção: OpenAI-compatible /embeddings.
 * Testes: EMBEDDING_PROVIDER=mock (vetores determinísticos).
 * Sem chave: retorna null — retrieval lexical continua.
 */
import OpenAI from "openai";
import { env } from "../../lib/env";

export type EmbeddingRuntime = {
  provider: string;
  model: string;
  version: string;
  dimension: number;
  available: boolean;
};

export type EmbeddingBatch = {
  vectors: number[][];
  provider: string;
  model: string;
  version: string;
  dimension: number;
};

const MOCK_DIM = 32;
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_DIM = 1536;

function mockVector(text: string): number[] {
  const synonyms: Record<string, string> = {
    valor: "preco",
    preço: "preco",
    preco: "preco",
    price: "preco",
    custo: "preco",
    horario: "hora",
    horário: "hora",
    funcionamento: "hora",
    entrega: "frete",
    envio: "frete",
  };
  const v = new Array(MOCK_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1)
    .map((t) => synonyms[t] || t);
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    v[(h >>> 0) % MOCK_DIM] += 1;
  }
  let n = 0;
  for (const x of v) n += x * x;
  const mag = Math.sqrt(n) || 1;
  return v.map((x) => x / mag);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function resolveEmbeddingRuntime(): EmbeddingRuntime {
  const provider = (process.env.EMBEDDING_PROVIDER || "").trim().toLowerCase();
  if (provider === "mock" || process.env.EMBEDDING_MOCK === "1") {
    return {
      provider: "mock",
      model: "mock-hash-v1",
      version: "mock-hash-v1",
      dimension: MOCK_DIM,
      available: true,
    };
  }
  const apiKey = (process.env.EMBEDDING_API_KEY || env.openaiApiKey || "").trim();
  const model = (process.env.EMBEDDING_MODEL || DEFAULT_OPENAI_MODEL).trim();
  const resolvedProvider = provider || (apiKey ? "openai" : "");
  return {
    provider: resolvedProvider || "none",
    model,
    version: `openai-compat:${model}`,
    dimension: Number(process.env.EMBEDDING_DIMENSION || DEFAULT_OPENAI_DIM) || DEFAULT_OPENAI_DIM,
    available: Boolean(apiKey && resolvedProvider && resolvedProvider !== "none"),
  };
}

export async function embedTexts(texts: string[]): Promise<EmbeddingBatch | null> {
  const clean = texts.map((t) => (t || "").slice(0, 8000));
  if (!clean.length) return null;
  const runtime = resolveEmbeddingRuntime();
  if (runtime.provider === "mock" && runtime.available) {
    return {
      vectors: clean.map(mockVector),
      provider: runtime.provider,
      model: runtime.model,
      version: runtime.version,
      dimension: runtime.dimension,
    };
  }
  if (!runtime.available) return null;

  const apiKey = (process.env.EMBEDDING_API_KEY || env.openaiApiKey || "").trim();
  const baseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const client = new OpenAI({ apiKey, baseURL: baseUrl, timeout: 20_000, maxRetries: 1 });
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < clean.length; i += BATCH) {
    const slice = clean.slice(i, i + BATCH);
    const res = await client.embeddings.create({ model: runtime.model, input: slice });
    const ordered = [...res.data].sort((a, b) => a.index - b.index);
    for (const row of ordered) out.push(row.embedding);
  }
  if (out.length !== clean.length) return null;
  return {
    vectors: out,
    provider: runtime.provider,
    model: runtime.model,
    version: runtime.version,
    dimension: out[0]?.length || runtime.dimension,
  };
}

export async function embedQuery(text: string): Promise<{
  vector: number[];
  provider: string;
  model: string;
  version: string;
} | null> {
  const batch = await embedTexts([text]);
  if (!batch?.vectors[0]) return null;
  return {
    vector: batch.vectors[0],
    provider: batch.provider,
    model: batch.model,
    version: batch.version,
  };
}
