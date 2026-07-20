import { describe, expect, it } from "vitest";
import { filterTourSteps, parsePlanEntitlements } from "./platform-tour";

describe("filterTourSteps", () => {
  const fullEnt = parsePlanEntitlements({
    features: {
      inbox: true,
      crm: true,
      ai: true,
      automations: true,
    },
  });

  it("ADMIN: mapa sem repetir agentes + etapa de agentes em profundidade", () => {
    const steps = filterTourSteps({
      role: "ADMIN",
      entitlements: fullEnt,
    });
    const nav = steps.filter((s) => s.stage === "nav").map((s) => s.id);
    const agents = steps.filter((s) => s.stage === "agents").map((s) => s.id);

    // Mapa: sem ai/knowledge/settings (isso fica na etapa 2)
    expect(nav).toEqual([
      "map_home",
      "map_inbox",
      "map_contacts",
      "map_crm",
      "map_automations",
      "map_team",
      "map_nia",
    ]);
    expect(nav.some((id) => id.includes("ai") || id.includes("knowledge"))).toBe(false);

    // Agentes: profundidade
    expect(agents).toContain("agents_hub");
    expect(agents).toContain("agents_edit_tabs");
    expect(agents).toContain("agents_edit_identity");
    expect(agents).toContain("agents_edit_behavior");
    expect(agents).toContain("agents_edit_handoff");
    expect(agents).toContain("agents_create_wizard");
    expect(agents).toContain("agents_knowledge");
    expect(agents).toContain("agents_company_ai");
    expect(agents).toContain("agents_attendance");
    expect(agents).toContain("agents_whats_new");

    const companyAi = steps.find((s) => s.id === "agents_company_ai");
    expect(companyAi?.title).toMatch(/Fornecedor/i);
    expect(companyAi?.target).toContain("settings-ai-provider");

    const attendance = steps.find((s) => s.id === "agents_attendance");
    expect(attendance?.description).toMatch(/reassume|retorn/i);
  });

  it("AGENT só vê mapa operacional (sem etapa de agentes)", () => {
    const steps = filterTourSteps({
      role: "AGENT",
      entitlements: fullEnt,
    });
    expect(steps.every((s) => s.stage === "nav")).toBe(true);
    expect(steps.map((s) => s.id)).toEqual([
      "map_home",
      "map_inbox",
      "map_contacts",
      "map_crm",
      "map_nia",
    ]);
  });

  it("etapa agents isolada", () => {
    const agents = filterTourSteps({
      role: "ADMIN",
      entitlements: fullEnt,
      stage: "agents",
    });
    expect(agents.every((s) => s.stage === "agents")).toBe(true);
    expect(agents.length).toBeGreaterThanOrEqual(8);
  });
});
