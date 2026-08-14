import { describe, expect, it } from "vitest";
import { scoreKnowledgeDoc } from "./knowledge";

describe("scoreKnowledgeDoc", () => {
  it("prioriza título relevante", () => {
    const q = "quais são os planos e preços?";
    const plans = scoreKnowledgeDoc(
      q,
      "Planos e Preços da Empresa",
      "Plano Básico R$ 99. Plano Pro R$ 199.",
      "Comercial"
    );
    const tasks = scoreKnowledgeDoc(
      q,
      "Tarefas",
      "A NexaFlow permite organizar tarefas relacionadas à operação.",
      "Operação"
    );
    expect(plans).toBeGreaterThan(tasks);
    expect(plans).toBeGreaterThan(0);
  });

  it("retorna 0 sem termos úteis", () => {
    expect(scoreKnowledgeDoc("ok", "Planos", "conteúdo")).toBe(0);
  });
});
