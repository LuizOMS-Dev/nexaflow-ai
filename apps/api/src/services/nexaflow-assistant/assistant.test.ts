import { describe, expect, it } from "vitest";
import {
  resolveModuleFromPath,
  suggestionsForModule,
  suggestionsForContext,
  ASSISTANT_NAV_REGISTRY,
} from "./nav-registry";
import { parseFeatureFlags } from "../entitlements";
import {
  buildAssistantTruthPolicy,
  buildAuthenticatedWelcome,
  buildExternalWelcome,
  filterAllowedNav,
  firstNameFromFullName,
  humanWhatsAppStatus,
  safeThreadTitleFromMessage,
} from "./index";
import { GLOBAL_TRUTH_POLICY_ENABLED } from "../ai";

describe("nexaflow-assistant", () => {
  it("GLOBAL_TRUTH_POLICY permanece ativa e identidade NIA", () => {
    expect(GLOBAL_TRUTH_POLICY_ENABLED).toBe(true);
    const p = buildAssistantTruthPolicy();
    expect(p).toContain("NUNCA INVENTAR");
    expect(p).toContain("IDENTIDADE: NIA");
    expect(p).toContain("SEGURANÇA");
    expect(p).toContain("USER_FIRST_NAME");
    expect(p).not.toContain("atendimento comercial/suporte de a empresa");
  });

  it("extrai primeiro nome e monta welcome autenticado", () => {
    expect(firstNameFromFullName("Fernando Silva")).toBe("Fernando");
    expect(firstNameFromFullName("  maria  ")).toBe("Maria");
    expect(firstNameFromFullName("user@email.com")).toBe(null);
    expect(firstNameFromFullName("")).toBe(null);
    expect(buildAuthenticatedWelcome("Fernando")).toBe(
      "Olá, Fernando! Como posso ajudar você hoje?"
    );
    expect(buildAuthenticatedWelcome(null)).toMatch(/Olá!/);
    expect(buildExternalWelcome()).toMatch(/e-mail/i);
  });

  it("título de thread não grava secrets", () => {
    expect(safeThreadTitleFromMessage("Como conecto o WhatsApp?")).toMatch(/WhatsApp/i);
    expect(safeThreadTitleFromMessage("token: sk-abcdefghijklmnop")).not.toMatch(/sk-abc/i);
    expect(safeThreadTitleFromMessage("senha: secret123")).not.toMatch(/secret123/);
  });

  it("resolve contexto de tela por rota", () => {
    expect(resolveModuleFromPath("/app/knowledge").currentModule).toBe("knowledge");
    expect(resolveModuleFromPath("/app/settings/webhooks").currentPageTitle).toBe("Webhooks");
    expect(resolveModuleFromPath("/app/ai").currentModule).toBe("ai");
  });

  it("sugestões contextuais por módulo", () => {
    const kn = suggestionsForModule("knowledge");
    expect(kn.some((s) => s.toLowerCase().includes("conhecimento") || s.toLowerCase().includes("rascunho"))).toBe(
      true
    );
    const inbox = suggestionsForModule("inbox");
    expect(inbox.length).toBeGreaterThan(0);
  });

  it("sugestões filtram API por entitlement", () => {
    const withApi = suggestionsForContext({
      module: "api",
      features: parseFeatureFlags({ api: true }),
      permissions: ["settings.read", "settings.update"],
    });
    expect(withApi.some((s) => /chave/i.test(s))).toBe(true);

    const noApi = suggestionsForContext({
      module: "api",
      features: parseFeatureFlags({ api: false }),
      permissions: ["settings.read", "settings.update"],
    });
    expect(noApi.every((s) => !/criar uma chave/i.test(s))).toBe(true);
    expect(noApi.some((s) => /plano|acesso/i.test(s))).toBe(true);
  });

  it("sugestões respeitam Access Gate bloqueado", () => {
    const s = suggestionsForContext({
      module: "channels",
      features: parseFeatureFlags({ api: true, ai: true }),
      permissions: ["channels.manage", "settings.update"],
      accessGateLevel: "BLOCKED",
      operationalPaused: true,
    });
    expect(s.every((x) => !/conectar meu whatsapp/i.test(x) || /por\s+que|plano|funciona/i.test(x))).toBe(
      true
    );
  });

  it("navegação allowlist não aceita URL arbitrária", () => {
    const hrefs = new Set(ASSISTANT_NAV_REGISTRY.map((n) => n.href));
    expect(hrefs.has("/app/integrations")).toBe(true);
    expect(hrefs.has("https://evil.example")).toBe(false);
    expect(hrefs.has("/admin/secret")).toBe(false);
  });

  it("RBAC: AGENT não recebe link de settings/api", () => {
    const features = parseFeatureFlags({ api: true, ai: true, crm: true, inbox: true });
    const agentNav = filterAllowedNav({
      role: "AGENT",
      platformRole: null,
      features,
    });
    expect(agentNav.some((n) => n.id === "settings")).toBe(false);
    expect(agentNav.some((n) => n.id === "settings-api")).toBe(false);
    expect(agentNav.some((n) => n.id === "inbox")).toBe(true);
  });

  it("Entitlement: sem API não oferece rota de API", () => {
    const features = parseFeatureFlags({ api: false, ai: true });
    const adminNav = filterAllowedNav({
      role: "ADMIN",
      platformRole: null,
      features,
    });
    expect(adminNav.some((n) => n.id === "settings-api")).toBe(false);
    expect(adminNav.some((n) => n.id === "ai")).toBe(true);
  });

  it("Entitlement: com API oferece rota de API ao admin", () => {
    const features = parseFeatureFlags({ api: true, ai: true });
    const adminNav = filterAllowedNav({
      role: "ADMIN",
      platformRole: null,
      features,
    });
    expect(adminNav.some((n) => n.id === "settings-api")).toBe(true);
  });

  it("truth policy inclui diagnóstico em camadas e vocabulário sem inflar manual", () => {
    const p = buildAssistantTruthPolicy();
    expect(p).toMatch(/DIAGNÓSTICO/);
    expect(p).toMatch(/VOCABULÁRIO/);
    expect(p).toMatch(/NIA ≠ Agente/);
    expect(p.length).toBeLessThan(9500);
  });

  it("humanWhatsAppStatus cobre estados canônicos", () => {
    expect(humanWhatsAppStatus("DISCONNECTED")).toMatch(/desconect/i);
    expect(humanWhatsAppStatus("RECONNECTING")).toMatch(/reconect/i);
  });
});
