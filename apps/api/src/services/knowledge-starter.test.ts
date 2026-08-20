import { describe, expect, it } from "vitest";
import {
  STARTER_PLANS_TITLE,
  STARTER_SOURCE_URL,
  hasStarterPlaceholders,
} from "./knowledge-starter";
import {
  normalizeKnowledgeSource,
  normalizeKnowledgeStatus,
  KNOWLEDGE_SOURCE_LABEL,
} from "./knowledge";

describe("Knowledge Base Starter & Templates Architecture", () => {
  it("reconhece o tipo de origem system_template e mapeia para Base Padrão NexaFlow", () => {
    expect(normalizeKnowledgeSource("system_template")).toBe("system_template");
    expect(normalizeKnowledgeSource("template")).toBe("system_template");
    expect(KNOWLEDGE_SOURCE_LABEL["system_template"]).toBe("Base Padrão NexaFlow");
  });

  it("normaliza os status corretamente", () => {
    expect(normalizeKnowledgeStatus("draft")).toBe("draft");
    expect(normalizeKnowledgeStatus("rascunho")).toBe("draft");
    expect(normalizeKnowledgeStatus("ready")).toBe("ready");
    expect(normalizeKnowledgeStatus("pronto")).toBe("ready");
    expect(normalizeKnowledgeStatus("published")).toBe("ready");
    expect(normalizeKnowledgeStatus("archived")).toBe("archived");
  });

  it("identifica corretamente placeholders no template de planos para impedir publicação acidental", () => {
    const uneditedContent =
      "PLANO BÁSICO\nValor: R$ 99,00 por mês\nInclui:\n- Recurso ou serviço 1\n- Recurso ou serviço 2";

    expect(hasStarterPlaceholders(uneditedContent)).toBe(true);

    const customizedContent =
      "PLANO EMPRESARIAL\nValor: R$ 500,00 por mês\nInclui:\n- Consultoria dedicada\n- Suporte 24h";

    expect(hasStarterPlaceholders(customizedContent)).toBe(false);
  });

  it("garante constantes e URLs de identificação da Base Padrão", () => {
    expect(STARTER_PLANS_TITLE).toBe("Planos e preços");
    expect(STARTER_SOURCE_URL).toBe("nexaflow:starter:plans-prices:v1");
  });
});
