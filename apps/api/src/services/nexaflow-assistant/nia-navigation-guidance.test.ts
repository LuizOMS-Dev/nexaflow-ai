/**
 * NIA Navigation Catalog — texto e CTA coerentes; caminhos reais.
 */
import { describe, expect, it } from "vitest";
import {
  NEXAFLOW_NAVIGATION_CATALOG,
  alignContentWithNavigationTarget,
  ctaFromNavTarget,
  navigationHrefsForQuestion,
  resolveFeatureFromQuestion,
  resolveNiaNavigationTarget,
} from "./nia-navigation-catalog";
import {
  ensureContextualCta,
  filterActionsByIntent,
  intentRelevantHrefs,
  rewriteWrongProductPaths,
  sanitizeNiaContent,
  suggestContextualCta,
} from "./index";
import type { AssistantNavItem } from "./nav-registry";
import { ASSISTANT_NAV_REGISTRY } from "./nav-registry";

const fullNav: AssistantNavItem[] = ASSISTANT_NAV_REGISTRY.map((n) => ({ ...n }));
const allHrefs = new Set(fullNav.map((n) => n.href));

function expectTextAndCta(question: string, expectedLabel: string, expectedHref: string) {
  const target = resolveNiaNavigationTarget({ question, allowedHrefs: allHrefs });
  expect(target.allowed).toBe(true);
  expect(target.label).toBe(expectedLabel);
  expect(target.href).toBe(expectedHref);
  expect(target.locationText?.toLowerCase()).toMatch(new RegExp(expectedLabel.split(" ")[0]!, "i"));

  const cta = ctaFromNavTarget(target);
  expect(cta?.href).toBe(expectedHref);
  expect(cta?.label).toMatch(new RegExp(expectedLabel, "i"));

  const ensured = ensureContextualCta(question, [], fullNav, "procedure");
  expect(ensured[0]?.href).toBe(expectedHref);

  // Texto errado alinhado ao target
  const wrong = `Para configurar, vá em Configurações e depois abra Segurança.`;
  const aligned = alignContentWithNavigationTarget(wrong, target);
  if (target.forbiddenAsDestination.includes("Configurações")) {
    expect(aligned.toLowerCase()).not.toMatch(/v[aá]\s+em\s+configura[cç]/i);
  }
}

describe("NIA navigation catalog — rotas reais", () => {
  it("catálogo usa hrefs existentes no app", () => {
    expect(NEXAFLOW_NAVIGATION_CATALOG.agents.href).toBe("/app/ai");
    expect(NEXAFLOW_NAVIGATION_CATALOG.knowledge.href).toBe("/app/knowledge");
    expect(NEXAFLOW_NAVIGATION_CATALOG.channels.href).toBe("/app/integrations");
    expect(NEXAFLOW_NAVIGATION_CATALOG.funnel.href).toBe("/app/crm");
    expect(NEXAFLOW_NAVIGATION_CATALOG.security.href).toBe("/app/account/security");
    expect(NEXAFLOW_NAVIGATION_CATALOG.sessions.href).toBe("/app/account/sessions");
    expect(NEXAFLOW_NAVIGATION_CATALOG.preferences.href).toBe("/app/account/preferences");
    expect(NEXAFLOW_NAVIGATION_CATALOG.novelties.href).toBe("/app/whats-new");
    expect(NEXAFLOW_NAVIGATION_CATALOG.api.href).toBe("/app/settings/api");
    expect(NEXAFLOW_NAVIGATION_CATALOG.webhooks.href).toBe("/app/settings/webhooks");
    expect(NEXAFLOW_NAVIGATION_CATALOG.learning.href).toBe("/app/ai/learning");
  });

  it("abas reais de Agentes", () => {
    const labels = NEXAFLOW_NAVIGATION_CATALOG.agents.sections?.map((s) => s.label) || [];
    expect(labels).toEqual(
      expect.arrayContaining(["Geral", "Comportamento", "Handoff", "Ferramentas", "Conhecimento"])
    );
  });
});

describe("NIA navigation guidance — intents", () => {
  it("Como criar um agente? → Agentes + CTA", () => {
    expectTextAndCta("Como criar um agente?", "Agentes", "/app/ai");
    expect(intentRelevantHrefs("Como criar um agente?")).toContain("/app/ai");
  });

  it("Como adicionar conhecimento? → Conhecimento", () => {
    expectTextAndCta("Como adicionar conhecimento?", "Conhecimento", "/app/knowledge");
  });

  it("Como conectar WhatsApp? → Canais", () => {
    expectTextAndCta("Como conectar WhatsApp?", "Canais", "/app/integrations");
  });

  it("Como criar uma oportunidade? → Funil", () => {
    expectTextAndCta("Como criar uma oportunidade?", "Funil", "/app/crm");
  });

  it("Como alterar minha senha? → Segurança", () => {
    expectTextAndCta("Como altero minha senha?", "Segurança", "/app/account/security");
  });

  it("Como ver minhas sessões? → Sessões", () => {
    expectTextAndCta("Como vejo minhas sessões?", "Sessões", "/app/account/sessions");
  });

  it("Como refazer o tour? → Preferências", () => {
    expectTextAndCta("Como refaço o tour da plataforma?", "Preferências", "/app/account/preferences");
  });

  it("Aprendizado contínuo → Aprendizado", () => {
    expectTextAndCta("Como configurar aprendizado contínuo?", "Aprendizado", "/app/ai/learning");
  });

  it("API → Configurações → API", () => {
    expectTextAndCta("Como criar uma chave de API?", "API", "/app/settings/api");
  });

  it("Webhook → Webhooks", () => {
    expectTextAndCta("Como configurar Webhook?", "Webhooks", "/app/settings/webhooks");
  });

  it("meta-ajuda sem CTA", () => {
    expect(resolveFeatureFromQuestion("Como você pode me ajudar?")).toBe("META_HELP");
    expect(intentRelevantHrefs("Como você pode me ajudar?")).toEqual([]);
    expect(ensureContextualCta("Como você pode me ajudar?", [], fullNav, "simple")).toEqual([]);
  });
});

describe("NIA navigation — asserts negativos", () => {
  it("pergunta de Agentes não manda para Segurança/Funil/Configurações como destino principal", () => {
    const t = resolveNiaNavigationTarget({
      question: "Como configuro um agente?",
      allowedHrefs: allHrefs,
    });
    expect(t.href).toBe("/app/ai");
    expect(t.forbiddenAsDestination).toEqual(
      expect.arrayContaining(["Configurações", "Segurança", "Funil"])
    );

    const poisoned =
      "Para configurar seu agente, vá em Configurações. Depois abra Segurança e o Funil.";
    const fixed = alignContentWithNavigationTarget(poisoned, t);
    expect(fixed).toMatch(/Agentes/i);
    // Destinos proibidos reescritos quando em padrão "vá em / abra"
    expect(fixed).not.toMatch(/v[aá]\s+em\s+Configura[cç]/i);
    expect(fixed).not.toMatch(/abra\s+Seguran[cç]a/i);
  });

  it("WhatsApp não tem Agentes como destino principal", () => {
    const t = resolveNiaNavigationTarget({
      question: "Meu WhatsApp desconectou",
      allowedHrefs: allHrefs,
    });
    expect(t.href).toBe("/app/integrations");
    const fixed = alignContentWithNavigationTarget(
      "Abra Agentes para reconectar o WhatsApp.",
      t
    );
    expect(fixed).toMatch(/Canais/i);
    expect(fixed).not.toMatch(/Abra Agentes/i);
  });

  it("senha não manda para Configurações da empresa", () => {
    const t = resolveNiaNavigationTarget({
      question: "Como altero minha senha?",
      allowedHrefs: allHrefs,
    });
    expect(t.href).toBe("/app/account/security");
    const fixed = alignContentWithNavigationTarget(
      "Vá em Configurações da empresa para alterar a senha.",
      t
    );
    expect(fixed).toMatch(/Seguran/i);
    expect(fixed).not.toMatch(/Configura[cç][oõ]es da empresa/i);
  });

  it("caminho inventado Configurações > Agentes é reescrito", () => {
    const out = rewriteWrongProductPaths(
      "Vá em Configurações > Agentes e Configurações → Conhecimento."
    );
    expect(out).not.toMatch(/Configura[cç][oõ]es\s*[>→]\s*Agentes/i);
    expect(out).toMatch(/Agentes/);
    expect(out).toMatch(/Conhecimento/);
  });
});

describe("NIA navigation — texto + CTA coerentes", () => {
  it("CTA e locationText apontam para o mesmo destino", () => {
    for (const q of [
      "Como criar um agente?",
      "Como adicionar conhecimento?",
      "Como conectar WhatsApp?",
      "Como altero minha senha?",
    ]) {
      const t = resolveNiaNavigationTarget({ question: q, allowedHrefs: allHrefs });
      const cta = ctaFromNavTarget(t);
      expect(cta?.href).toBe(t.href);
      expect(cta?.label).toContain(t.label!);
    }
  });

  it("help antiga com path errado perde para catálogo no align", () => {
    const helpLike =
      "Segundo a documentação: vá em Configurações > Agentes e clique em Novo.";
    const t = resolveNiaNavigationTarget({
      question: "Como criar um agente?",
      allowedHrefs: allHrefs,
    });
    const out = sanitizeNiaContent(helpLike, t);
    expect(out).not.toMatch(/Configura[cç][oõ]es\s*[>→]\s*Agentes/i);
    expect(out).toMatch(/Agentes/i);
  });
});

describe("NIA navigation — RBAC / entitlement / unknown", () => {
  it("sem permissão: allowed false, sem CTA", () => {
    const t = resolveNiaNavigationTarget({
      question: "Como criar um agente?",
      allowedHrefs: new Set(["/app/inbox"]), // sem /app/ai
    });
    expect(t.allowed).toBe(false);
    expect(t.reason).toBe("no_permission");
    expect(ctaFromNavTarget(t)).toBeNull();
  });

  it("API sem entitlement: não força Abrir API", () => {
    const t = resolveNiaNavigationTarget({
      question: "Como criar uma chave de API?",
      allowedHrefs: allHrefs,
      features: { api: false, ai: true, inbox: true, crm: true } as never,
    });
    expect(t.reason).toBe("no_entitlement");
    expect(t.promptBlock).toMatch(/NÃO diga|plano/i);
  });

  it("intent desconhecido: sem CTA inventado", () => {
    const t = resolveNiaNavigationTarget({
      question: "Qual a cor do céu na NexaFlow?",
      allowedHrefs: allHrefs,
    });
    expect(t.reason).toBe("unknown");
    expect(ctaFromNavTarget(t)).toBeNull();
    expect(navigationHrefsForQuestion("Qual a cor do céu na NexaFlow?")).toBeNull();
  });

  it("filterActionsByIntent remove CTA errado em pergunta de agentes", () => {
    const filtered = filterActionsByIntent("Como funcionam os agentes?", [
      { type: "navigate", label: "Abrir Segurança", href: "/app/account/security" },
      { type: "navigate", label: "Abrir Agentes", href: "/app/ai" },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].href).toBe("/app/ai");
  });
});
