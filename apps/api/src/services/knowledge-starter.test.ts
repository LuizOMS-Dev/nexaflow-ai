import { describe, expect, it } from "vitest";
import {
  hasStarterPlaceholders,
  isLegacyNexaflowCatalogContent,
  STARTER_PLANS_CONTENT,
  STARTER_PLANS_TITLE,
} from "./knowledge-starter";

describe("knowledge-starter", () => {
  it("detecta placeholders do modelo", () => {
    expect(hasStarterPlaceholders(STARTER_PLANS_CONTENT)).toBe(true);
    expect(hasStarterPlaceholders("Pizza grande R$ 40")).toBe(false);
  });

  it("detecta catálogo legado NexaFlow", () => {
    expect(
      isLegacyNexaflowCatalogContent(
        "Catálogo comercial oficial (sincronizado com a plataforma):\n• Pro — R$ 299"
      )
    ).toBe(true);
    expect(isLegacyNexaflowCatalogContent("Consulta R$ 150")).toBe(false);
  });

  it("título padrão correto", () => {
    expect(STARTER_PLANS_TITLE).toBe("Planos e preços");
  });
});
