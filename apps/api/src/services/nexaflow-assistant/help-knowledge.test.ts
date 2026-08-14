import { describe, expect, it } from "vitest";
import { HELP_KNOWLEDGE_SEED, HELP_KNOWLEDGE_SEED_VERSION } from "./help-knowledge-seed";
import { humanWhatsAppStatus } from "./index";
import { NIA_EVAL_QUESTIONS, countEvalByTier } from "./nia-eval-questions";

/** Score local espelhando retrieve (sem DB) para cobertura de seed. */
function scoreDoc(q: string, title: string, content: string, category: string | null): number {
  const terms = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
  if (!terms.length) return 0;
  const hay = `${title} ${category || ""} ${content}`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (title.toLowerCase().includes(t)) s += 4;
    if ((category || "").toLowerCase().includes(t)) s += 2;
    if (hay.includes(t)) s += 1;
  }
  return s;
}

describe("help-knowledge-seed", () => {
  it("tem artigos suficientes e seedKeys únicos", () => {
    expect(HELP_KNOWLEDGE_SEED.length).toBeGreaterThanOrEqual(30);
    const keys = HELP_KNOWLEDGE_SEED.map((d) => d.seedKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(HELP_KNOWLEDGE_SEED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("cobre módulos críticos do mapa", () => {
    const keys = new Set(HELP_KNOWLEDGE_SEED.map((d) => d.seedKey));
    for (const k of [
      "whatsapp-estados",
      "agentes-modos",
      "agentes-nao-responde",
      "agentes-import-config",
      "conhecimento-base",
      "access-gate",
      "api",
      "webhooks",
      "novidades",
      "nia-assistente",
      "diagnostico-camadas",
      "conversas-handoff",
    ]) {
      expect(keys.has(k), `faltando seedKey ${k}`).toBe(true);
    }
  });

  it("WhatsApp seed lista estados canônicos reais", () => {
    const wa = HELP_KNOWLEDGE_SEED.find((d) => d.seedKey === "whatsapp-estados")!;
    for (const st of [
      "NOT_CONFIGURED",
      "QR_REQUIRED",
      "CONNECTED",
      "DISCONNECTED",
      "RECONNECTING",
      "LOGGED_OUT",
      "ERROR",
    ]) {
      expect(wa.content).toContain(st);
    }
  });

  it("import config documenta allowlist e exclusões", () => {
    const doc = HELP_KNOWLEDGE_SEED.find((d) => d.seedKey === "agentes-import-config")!;
    expect(doc.content).toMatch(/nome/i);
    expect(doc.content).toMatch(/NÃO importa|Não importa/i);
    expect(doc.content).toMatch(/Modo/i);
    expect(doc.content).toMatch(/Knowledge/i);
  });

  it("não confunde NIA com Knowledge comercial", () => {
    const doc = HELP_KNOWLEDGE_SEED.find((d) => d.seedKey === "conhecimento-vs-nia")!;
    expect(doc.content).toMatch(/Help Knowledge/i);
    expect(doc.content).toMatch(/KnowledgeDoc|EMPRESA/i);
  });
});

describe("humanWhatsAppStatus", () => {
  it("traduz enums para linguagem humana", () => {
    expect(humanWhatsAppStatus("CONNECTED")).toMatch(/conectado/i);
    expect(humanWhatsAppStatus("QR_REQUIRED")).toMatch(/QR/i);
    expect(humanWhatsAppStatus("LOGGED_OUT")).toMatch(/sessão|reconect/i);
    expect(humanWhatsAppStatus("NONE")).toMatch(/configur/i);
  });
});

describe("nia-eval-questions", () => {
  it("tem pelo menos 200 perguntas", () => {
    expect(NIA_EVAL_QUESTIONS.length).toBeGreaterThanOrEqual(200);
    const by = countEvalByTier();
    expect(by.facil).toBeGreaterThan(10);
    expect(by.maliciosa).toBeGreaterThan(5);
    expect(by.fora_escopo).toBeGreaterThan(3);
  });

  it("perguntas com expectSeedKeys encontram conteúdo no seed", () => {
    const byKey = new Map(HELP_KNOWLEDGE_SEED.map((d) => [d.seedKey, d]));
    const withExpect = NIA_EVAL_QUESTIONS.filter((q) => q.expectSeedKeys?.length);
    expect(withExpect.length).toBeGreaterThan(20);
    for (const item of withExpect) {
      let best = 0;
      for (const key of item.expectSeedKeys!) {
        const doc = byKey.get(key);
        expect(doc, `seedKey ausente ${key} para: ${item.q}`).toBeTruthy();
        if (!doc) continue;
        best = Math.max(best, scoreDoc(item.q, doc.title, doc.content, doc.category));
      }
      // maliciosas/fora podem não rankear — só checamos presença do artigo
      if (item.mustNotInvent && item.tier === "maliciosa") continue;
      if (item.tier === "fora_escopo") continue;
      expect(best, `retrieval fraco para: ${item.q}`).toBeGreaterThan(0);
    }
  });
});
