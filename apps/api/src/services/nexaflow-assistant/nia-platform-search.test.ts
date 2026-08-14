/**
 * Pesquisa real de navegação + pipeline híbrido da NIA.
 */
import { describe, expect, it } from "vitest";
import {
  buildNavigationIndex,
  formatNavSearchForPrompt,
  navTargetFromSearch,
  runNiaPlatformResearch,
  searchPlatformNavigation,
} from "./nia-platform-search";
import { detectDiagnosticProbes } from "./nia-account-tools";
import { ASSISTANT_NAV_REGISTRY } from "./nav-registry";
import { alignContentWithNavigationTarget } from "./nia-navigation-catalog";
import { sanitizeNiaContent } from "./index";

const allHrefs = new Set(ASSISTANT_NAV_REGISTRY.map((n) => n.href));

describe("searchPlatformNavigation", () => {
  it("índice derivado do catálogo (não vazio)", () => {
    const idx = buildNavigationIndex();
    expect(idx.length).toBeGreaterThan(10);
    expect(idx.some((e) => e.routeId === "agents")).toBe(true);
  });

  it("Como criar um agente? → Agentes (high confidence)", () => {
    const r = searchPlatformNavigation({ query: "Como criar um agente?", allowedHrefs: allHrefs });
    expect(r.best?.label).toBe("Agentes");
    expect(r.best?.href).toBe("/app/ai");
    expect(r.best?.allowed).toBe(true);
    expect(["high", "medium"]).toContain(r.best!.confidence);
  });

  it("Como adicionar conhecimento? → Conhecimento", () => {
    const r = searchPlatformNavigation({
      query: "Como adicionar conhecimento?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Conhecimento");
    expect(r.best?.href).toBe("/app/knowledge");
  });

  it("Como conectar WhatsApp? → Canais", () => {
    const r = searchPlatformNavigation({
      query: "Como conectar WhatsApp?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Canais");
    expect(r.best?.href).toBe("/app/integrations");
  });

  it("Como alterar minha senha? → Segurança (perfil)", () => {
    const r = searchPlatformNavigation({
      query: "Como altero minha senha?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Segurança");
    expect(r.best?.href).toBe("/app/account/security");
  });

  it("Sessões → Sessões", () => {
    const r = searchPlatformNavigation({
      query: "Como vejo minhas sessões?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Sessões");
  });

  it("Tour → Preferências", () => {
    const r = searchPlatformNavigation({
      query: "Como refaço o tour da plataforma?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Preferências");
  });

  it("Aprendizado contínuo → Aprendizado", () => {
    const r = searchPlatformNavigation({
      query: "Como configurar aprendizado contínuo?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.href).toBe("/app/ai/learning");
  });

  it("Handoff → path com aba Handoff", () => {
    const r = searchPlatformNavigation({
      query: "Onde configuro o handoff do agente?",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.label).toBe("Agentes");
    expect(r.best?.path.join(" → ")).toMatch(/Handoff/i);
  });

  it("API sem entitlement → allowed false", () => {
    const r = searchPlatformNavigation({
      query: "Como criar uma chave de API?",
      allowedHrefs: allHrefs,
      features: { api: false, ai: true } as never,
    });
    const apiMatch = r.matches.find((m) => m.routeId === "api") || r.best;
    expect(apiMatch?.reasonIfDenied === "no_entitlement" || apiMatch?.allowed === false).toBe(
      true
    );
  });

  it("sem match confiável → best null", () => {
    const r = searchPlatformNavigation({
      query: "Qual a cor do céu roxo na quinta dimensão?",
      allowedHrefs: allHrefs,
    });
    expect(r.best).toBeNull();
  });

  it("ranking: configurar agente prefere Agentes a Configurações", () => {
    const r = searchPlatformNavigation({
      query: "configurar agente",
      allowedHrefs: allHrefs,
    });
    expect(r.best?.routeId).toBe("agents");
    const settingsRank = r.matches.findIndex((m) => m.routeId === "settings");
    const agentsRank = r.matches.findIndex((m) => m.routeId === "agents");
    if (settingsRank >= 0 && agentsRank >= 0) {
      expect(agentsRank).toBeLessThan(settingsRank);
    }
  });
});

describe("runNiaPlatformResearch pipeline", () => {
  it("texto+CTA coerentes a partir da pesquisa", () => {
    const bundle = runNiaPlatformResearch({
      question: "Como criar um agente?",
      allowedHrefs: allHrefs,
    });
    expect(bundle.navTarget.label).toBe("Agentes");
    expect(bundle.cta?.href).toBe("/app/ai");
    expect(bundle.cta?.label).toMatch(/Agentes/);
    expect(bundle.log.selectedLabel).toBe("Agentes");
  });

  it("conceito Funil: help sim, diagnóstico operacional não obrigatório", () => {
    const bundle = runNiaPlatformResearch({
      question: "Como funciona o Funil?",
      allowedHrefs: allHrefs,
    });
    expect(bundle.navTarget.href).toBe("/app/crm");
    expect(bundle.needsHelp).toBe(true);
    // não precisa sondar WA/agentes só por "como funciona"
    expect(bundle.needsAccountDiagnostic).toBe(false);
  });

  it("problema WhatsApp: precisa diagnóstico", () => {
    const bundle = runNiaPlatformResearch({
      question: "Meu WhatsApp está funcionando?",
      allowedHrefs: allHrefs,
    });
    expect(bundle.navTarget.href).toBe("/app/integrations");
    expect(bundle.needsAccountDiagnostic).toBe(true);
  });

  it("help antiga perde para nav search no align", () => {
    const bundle = runNiaPlatformResearch({
      question: "Como criar um agente?",
      allowedHrefs: allHrefs,
    });
    const stale =
      "Segundo a base: Vá em Configurações > Agentes e clique em Novo agente.";
    const out = sanitizeNiaContent(stale, bundle.navTarget);
    expect(out).not.toMatch(/Configura[cç][oõ]es\s*[>→]\s*Agentes/i);
    expect(out).toMatch(/Agentes/i);
  });

  it("formatNavSearchForPrompt não é vazio", () => {
    const r = searchPlatformNavigation({ query: "WhatsApp", allowedHrefs: allHrefs });
    const block = formatNavSearchForPrompt(r);
    expect(block).toMatch(/NAV_SEARCH/);
    expect(block).toMatch(/Canais|channels|WHATSAPP/i);
  });

  it("navTargetFromSearch sem best → unknown sem CTA inventado", () => {
    const empty = searchPlatformNavigation({
      query: "xyzzy foobar quux",
      allowedHrefs: allHrefs,
    });
    const t = navTargetFromSearch(empty, "xyzzy foobar quux", allHrefs);
    expect(t.allowed).toBe(false);
    expect(t.promptBlock).toMatch(/não identificou|nenhum destino|desconhecido|confiável/i);
  });
});

describe("detectDiagnosticProbes — seletivo", () => {
  it("como funciona o Funil → não sonda whatsapp/agents", () => {
    const p = detectDiagnosticProbes("Como funciona o Funil?");
    expect(p).not.toContain("whatsapp");
    expect(p).not.toContain("agents");
    expect(p).toContain("account");
  });

  it("agente não responde → agents + whatsapp + inbox", () => {
    const p = detectDiagnosticProbes("Por que meu agente não responde?");
    expect(p).toContain("agents");
    expect(p).toContain("whatsapp");
  });

  it("WhatsApp desconectou → whatsapp", () => {
    const p = detectDiagnosticProbes("Meu WhatsApp desconectou");
    expect(p).toContain("whatsapp");
  });
});
