/**
 * Qualidade de resposta da NIA — profundidade adaptativa + CTAs + sanitização.
 */
import { describe, expect, it } from "vitest";
import {
  buildAssistantTruthPolicy,
  buildAssistantTruthPolicyCompact,
  classifyNiaQuestionDepth,
  ensureContextualCta,
  filterActionsByIntent,
  intentRelevantHrefs,
  maxTokensForNiaDepth,
  messageLooksDiagnostic,
  sanitizeNiaContent,
  resolveAllowedHref,
  rewriteWrongProductPaths,
  suggestContextualCta,
  parseActionsFromReply,
  contentHasActionLeakage,
} from "./index";
import {
  composeNiaResponse,
  normalizeNiaAction,
  resolveRouteId,
  stripActionLeakageFromText,
} from "./nia-actions";
import type { AssistantNavItem } from "./nav-registry";
import { heuristicFromDiagnostic, type SecureAccountDiagnostic } from "./nia-account-tools";

function baseDiag(over: Partial<SecureAccountDiagnostic> = {}): SecureAccountDiagnostic {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    probes: ["whatsapp", "agents", "knowledge", "inbox", "billing"],
    account: {
      firstName: "Ana",
      emailMasked: "a***@x.com",
      role: "ADMIN",
      companyName: "FM Conteúdos",
      userStatus: "ACTIVE",
      membershipActive: true,
      mfaEnabled: true,
      activeSessions: 1,
    },
    company: {
      status: "ACTIVE",
      planName: "Profissional",
      planSlug: "pro",
      features: { api: false, ai: true, inbox: true, crm: true },
      limits: { maxUsers: 5, maxAgents: 3, maxChannels: 1, monthlyAiCredits: 5000 },
      apiEnabled: false,
      seats: { members: 2, maxUsers: 5 },
    },
    accessGate: {
      level: "FULL",
      code: "OK",
      operationalPaused: false,
      financialLabel: null,
      publicMessage: null,
    },
    whatsapp: {
      status: "DISCONNECTED",
      human: "desconectado",
      connected: false,
      configuredCount: 1,
      connectedCount: 0,
    },
    agents: {
      total: 1,
      active: 1,
      modes: [{ name: "Julia", mode: "AUTO", active: true }],
    },
    knowledge: { total: 2, ready: 1, draft: 1, archived: 0 },
    inbox: { openConversations: 1, waitingHuman: 0 },
    findings: [
      {
        id: "wa_not_connected",
        severity: "warning",
        area: "whatsapp",
        title: "WhatsApp não está conectado",
        detail: "Status: desconectado",
        fixHint: "Reconecte em Canais.",
        suggestedHref: "/app/integrations",
      },
    ],
    narrativeForModel: "wa desconectado",
    ...over,
  };
}

describe("NIA response quality — adaptive depth", () => {
  it("política exige profundidade adaptativa e progressiva", () => {
    const full = buildAssistantTruthPolicy();
    const compact = buildAssistantTruthPolicyCompact();
    expect(full).toMatch(/PROFUNDIDADE ADAPTATIVA|DIVULGAÇÃO PROGRESSIVA|RESOLVER COMPLETAMENTE/i);
    expect(full).not.toMatch(/sempre responda em até 3 frases/i);
    expect(full).toMatch(/CONTENT ONLY|PROIBIDO no texto|Ações:/i);
    expect(full).toMatch(/JSON|href|routeId|navigate/i);
    expect(full).not.toMatch(/Formato opcional no final[\s\S]*ACTIONS:/i);
    expect(full).not.toMatch(/ACTIONS:\s*\[\{"type"/i);
    expect(compact).toMatch(/CONTENT ONLY|PROIBIDO.*Ações|NUNCA invente/i);
    expect(compact).not.toMatch(/Formato:\s*ACTIONS:/i);
  });

  it("classifica profundidade da pergunta", () => {
    expect(classifyNiaQuestionDepth("Como funciona o Funil?")).toBe("explanation");
    expect(classifyNiaQuestionDepth("O que é handoff?")).toBe("explanation");
    expect(classifyNiaQuestionDepth("Como criar um agente?")).toBe("procedure");
    expect(classifyNiaQuestionDepth("Qual a diferença entre Copiloto e Automático?")).toBe(
      "comparison"
    );
    expect(classifyNiaQuestionDepth("Meu agente não responde")).toBe("diagnostic");
    expect(classifyNiaQuestionDepth("Oi")).toBe("simple");
    expect(classifyNiaQuestionDepth("E no Automático?")).toBe("follow_up");
  });

  it("intent diagnóstico exige pergunta", () => {
    expect(messageLooksDiagnostic("Meu agente não responde")).toBe(true);
    expect(messageLooksDiagnostic("Como criar um agente?")).toBe(false);
    expect(messageLooksDiagnostic("Como funcionam os agentes?")).toBe(false);
  });

  it("maxTokens escala sem novela para simple", () => {
    expect(maxTokensForNiaDepth("diagnostic")).toBeLessThanOrEqual(900);
    expect(maxTokensForNiaDepth("simple")).toBeLessThanOrEqual(500);
    expect(maxTokensForNiaDepth("explanation")).toBeLessThanOrEqual(600);
  });
});

describe("NIA action routing — CTAs semânticos", () => {
  it("pergunta sobre agentes → hrefs de Agentes", () => {
    expect(intentRelevantHrefs("Como funcionam os agentes?")).toContain("/app/ai");
  });

  it("meta-ajuda → sem CTA", () => {
    expect(intentRelevantHrefs("Como você pode me ajudar?")).toEqual([]);
    expect(intentRelevantHrefs("Oi")).toEqual([]);
  });

  it("senha → Segurança; Funil → CRM", () => {
    expect(intentRelevantHrefs("Como altero minha senha?")).toContain("/app/account/security");
    expect(intentRelevantHrefs("Como funciona o Funil?")).toContain("/app/crm");
  });

  it("filtra CTA Segurança em pergunta de Agentes", () => {
    const filtered = filterActionsByIntent("Como funcionam os agentes?", [
      { type: "navigate", label: "Abrir Segurança", href: "/app/account/security" },
      { type: "navigate", label: "Abrir Agentes", href: "/app/ai" },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].href).toBe("/app/ai");
  });

  it("meta-ajuda remove todos os CTAs", () => {
    const filtered = filterActionsByIntent("Como você pode me ajudar?", [
      { type: "navigate", label: "Abrir Segurança", href: "/app/account/security" },
      { type: "navigate", label: "Abrir Agentes", href: "/app/ai" },
    ]);
    expect(filtered).toEqual([]);
  });

  it("mapeia contatos / tarefas / equipe / campanhas", () => {
    expect(intentRelevantHrefs("Como crio um contato?")).toContain("/app/contacts");
    expect(intentRelevantHrefs("Como crio uma tarefa?")).toContain("/app/tasks");
    expect(intentRelevantHrefs("Como convido alguém da equipe?")).toContain("/app/team");
    expect(intentRelevantHrefs("Como crio campanha?")).toContain("/app/campaigns");
  });

  it("encerramento automático → Configurações; assumir → Conversas; handoff do agente → Agentes", () => {
    expect(intentRelevantHrefs("Como configuro regras de encerramento de conversa?")).toContain(
      "/app/settings"
    );
    expect(intentRelevantHrefs("Como fecho conversa por inatividade?")).toContain("/app/settings");
    expect(intentRelevantHrefs("Como assumo um atendimento?")).toContain("/app/inbox");
    expect(intentRelevantHrefs("Como configuro handoff do agente?")).toContain("/app/ai");
  });

  it("reescreve caminhos inventados no texto", () => {
    const t = rewriteWrongProductPaths(
      "Abra /app/ai/agents/configurations/rules para encerramento em Agentes."
    );
    expect(t).not.toMatch(/\/app\//);
    expect(t.toLowerCase()).toMatch(/configura/);
  });

  it("sugere CTA allowlisted quando o modelo não enviou ACTIONS", () => {
    const nav: AssistantNavItem[] = [
      {
        id: "knowledge",
        href: "/app/knowledge",
        label: "Conhecimento",
        module: "knowledge",
        permission: "ai.manage",
      },
      {
        id: "ai",
        href: "/app/ai",
        label: "Agentes",
        module: "ai",
        permission: "ai.manage",
      },
    ];
    const suggested = suggestContextualCta("Como adiciono conhecimento ao agente?", nav, "procedure");
    expect(suggested).toHaveLength(1);
    expect(suggested[0].href).toBe("/app/knowledge");
    expect(suggested[0].label).toMatch(/Conhecimento/i);

    const ensured = ensureContextualCta("Como adiciono conhecimento ao agente?", [], nav, "procedure");
    expect(ensured[0]?.href).toBe("/app/knowledge");

    // Sem permissão na allowlist → sem CTA
    expect(suggestContextualCta("Como adiciono conhecimento?", [], "procedure")).toEqual([]);

    // Meta-ajuda → sem CTA
    expect(ensureContextualCta("Oi", [{ type: "navigate", label: "x", href: "/app/ai" }], nav, "simple")).toEqual(
      []
    );
  });

  it("WhatsApp desconectado: diagnóstico útil", () => {
    const h = heuristicFromDiagnostic(baseDiag(), "Por que meu agente não responde?");
    expect(h.content.length).toBeGreaterThan(180);
    expect(h.content).toMatch(/WhatsApp|desconect/i);
    expect(h.hrefs).toContain("/app/integrations");
  });
});

describe("NIA content sanitize", () => {
  it("remove links markdown internos e ACTIONS", () => {
    const raw = `Abra Agentes.

[Abrir Agentes](/app/ai)

ACTIONS: [{"type":"navigate","label":"Abrir Agentes","href":"/app/ai"}]`;
    const out = sanitizeNiaContent(raw);
    expect(out).toContain("Abrir Agentes");
    expect(out).not.toMatch(/\]\(\/app\//);
    expect(out).not.toMatch(/ACTIONS:/i);
    expect(contentHasActionLeakage(out)).toBe(false);
  });

  it("remove ACTIONS com colchetes e objeto único (vazamento do modelo)", () => {
    const raw = `Para configurar o encerramento:

1. Abra Agentes.
2. Ajuste as regras.

[ACTIONS: {"type":"navigate","label":"Configurar regras de encerramento de conversa","href":"/app/ai/agents/configurations/rules"}]`;
    const out = sanitizeNiaContent(raw);
    expect(out).toMatch(/encerramento|Agentes/i);
    expect(out).not.toMatch(/ACTIONS/i);
    expect(out).not.toMatch(/\/app\/ai\/agents\/configurations/);
    expect(out).not.toMatch(/\{"type"/);
  });

  it("remove ACTIONS: objeto no meio do texto", () => {
    const raw = `Texto antes.
ACTIONS: {"type":"navigate","label":"Abrir","href":"/app/settings"}
Texto depois.`;
    const out = sanitizeNiaContent(raw);
    expect(out).toContain("Texto antes");
    expect(out).toContain("Texto depois");
    expect(out).not.toMatch(/ACTIONS/i);
  });

  it("REGRESSÃO: href prosa Configurações no JSON Ações (bug produção)", () => {
    const raw = `Acesse as Configurações da conta seguindo o caminho:
Ações: [{"type":"navigate","label":"Abrir Configurações","href":"Configurações"}]`;
    const out = sanitizeNiaContent(raw);
    expect(out).not.toMatch(/Ações\s*:\s*\[/i);
    expect(out).not.toMatch(/"type"\s*:\s*"navigate"/i);
    expect(out).not.toMatch(/"href"\s*:\s*"Configurações"/i);
    expect(contentHasActionLeakage(out)).toBe(false);
  });

  it("REGRESSÃO PERMANENTE: vazamento exato Ações: [{\"type\":\"navigate\"...}]", () => {
    // Caso real que vazou na UI — nunca mais pode aparecer no content.
    const exactBug =
      'Se você precisar de mais ajuda, clique em Abrir Agentes (Ações: [{"type":"navigate","label":"Abrir Agentes","href":"a área correspondente na NexaFlow"}]) para acessar a página de configuração do agente.';

    expect(contentHasActionLeakage(exactBug)).toBe(true);

    const out = sanitizeNiaContent(exactBug);
    expect(out).not.toMatch(/Ações\s*:\s*\[/i);
    expect(out).not.toMatch(/ACTIONS\s*:/i);
    expect(out).not.toMatch(/"type"\s*:\s*"navigate"/i);
    expect(out).not.toMatch(/"href"\s*:/);
    expect(out).not.toMatch(/área correspondente na NexaFlow/);
    expect(contentHasActionLeakage(out)).toBe(false);

    // Prosa humana residual permanece
    expect(out).toMatch(/ajuda|configura|agente|página/i);
    expect(out.length).toBeGreaterThan(20);

    // Composer: content limpo + action inválida não vira botão quebrado
    const allowed = new Set(["/app/ai"]);
    const composed = composeNiaResponse({
      rawContent: exactBug,
      allowedHrefs: allowed,
      rewritePaths: rewriteWrongProductPaths,
    });
    expect(contentHasActionLeakage(composed.content)).toBe(false);
    expect(composed.content).not.toMatch(/Ações\s*:\s*\[/i);
    // label "Abrir Agentes" pode recuperar route via label map
    for (const a of composed.actions) {
      expect(a.href?.startsWith("/")).toBe(true);
    }
  });

  it("não remove JSON/API/código legítimos (sanitizer não é barreira única)", () => {
    const apiExample = `Para criar um webhook, envie um JSON assim:

\`\`\`json
{
  "type": "message.created",
  "url": "https://seu-sistema.com/hook",
  "events": ["message.created"]
}
\`\`\`

O campo type identifica o evento da API. As ações do fluxo podem incluir notificar e criar tarefa.

Exemplo de schema:
{ "type": "object", "properties": { "name": { "type": "string" } } }

routeId e toolCall são conceitos de integração — não confunda com o editor de fluxos.`;

    expect(contentHasActionLeakage(apiExample)).toBe(false);
    const out = sanitizeNiaContent(apiExample);
    expect(out).toContain('"type": "message.created"');
    expect(out).toContain('"type": "object"');
    expect(out).toContain("As ações do fluxo");
    expect(out).toContain("https://seu-sistema.com/hook");
    expect(out).toMatch(/routeId/);
    expect(out).toMatch(/toolCall/);
    expect(out).toContain("webhook");
  });

  it("preserva prosa 'Ações:' sem payload de navigate da NIA", () => {
    const prose = `Ações:
1. Criar a chave de API
2. Colar o JSON no header Authorization
3. Testar o endpoint /v1/contacts`;
    expect(contentHasActionLeakage(prose)).toBe(false);
    const out = sanitizeNiaContent(prose);
    expect(out).toContain("Ações:");
    expect(out).toContain("chave de API");
    expect(out).toContain("/v1/contacts");
  });

  it("resolve href inventado para allowlist", () => {
    const allowed = new Set(["/app/ai", "/app/settings", "/app/knowledge"]);
    expect(resolveAllowedHref("/app/ai/agents/configurations/rules", allowed)).toBe("/app/ai");
    expect(resolveAllowedHref("/app/knowledge/docs/1", allowed)).toBe("/app/knowledge");
    expect(resolveAllowedHref("/app/unknown", allowed)).toBeNull();
    expect(resolveAllowedHref("a área correspondente na NexaFlow", allowed)).toBeNull();
    expect(resolveAllowedHref("javascript:alert(1)", allowed)).toBeNull();
    expect(resolveAllowedHref("data:text/html,x", allowed)).toBeNull();
  });

  it("remove bloco Ações sugeridas do texto", () => {
    const raw = `Configure o agente.

Ações sugeridas:
- Abrir Agentes
- Criar agente`;
    const out = sanitizeNiaContent(raw);
    expect(out).not.toMatch(/Ações sugeridas/i);
  });
});

describe("NIA structured actions — content × actions", () => {
  const allowed = new Set([
    "/app/ai",
    "/app/knowledge",
    "/app/integrations",
    "/app/crm",
    "/app/account/security",
    "/app/settings",
  ]);

  it("AGENTS CTA: parse residual sem vazar no content", () => {
    const raw = `Você pode configurar o agente na área de Agentes.

ACTIONS: [{"type":"navigate","label":"Abrir Agentes","href":"/app/ai"}]`;
    const { content, actions } = parseActionsFromReply(raw, allowed, "Como configuro um agente?");
    expect(content).toMatch(/Agentes/i);
    expect(content).not.toMatch(/ACTIONS|Ações\s*:|\{"type"/i);
    expect(actions.some((a) => a.href === "/app/ai")).toBe(true);
  });

  it("KNOWLEDGE CTA via ensureContextualCta", () => {
    const nav: AssistantNavItem[] = [
      {
        id: "knowledge",
        href: "/app/knowledge",
        label: "Conhecimento",
        module: "knowledge",
        permission: "ai.manage",
      },
    ];
    const actions = ensureContextualCta("Como adiciono conhecimento?", [], nav, "procedure");
    expect(actions[0]?.href).toBe("/app/knowledge");
    expect(actions[0]?.label).toMatch(/Conhecimento/i);
  });

  it("CHANNELS CTA intent", () => {
    expect(intentRelevantHrefs("Meu WhatsApp desconectou.")).toContain("/app/integrations");
  });

  it("FUNNEL CTA intent", () => {
    expect(intentRelevantHrefs("Como funciona o Funil?")).toContain("/app/crm");
  });

  it("SECURITY CTA intent", () => {
    expect(intentRelevantHrefs("Como altero minha senha?")).toContain("/app/account/security");
  });

  it("NO CTA em meta-ajuda", () => {
    expect(intentRelevantHrefs("Como você pode me ajudar?")).toEqual([]);
    const nav: AssistantNavItem[] = [
      { id: "ai", href: "/app/ai", label: "Agentes", module: "ai" },
    ];
    expect(ensureContextualCta("Como você pode me ajudar?", [], nav, "simple")).toEqual([]);
  });

  it("INVALID ACTION: href inventado rejeitado sem JSON no content", () => {
    const invalid = normalizeNiaAction(
      {
        type: "navigate",
        label: "Abrir Agentes",
        href: "a área correspondente na NexaFlow",
      },
      allowed
    );
    // Pode resolver via label → agents, ou null se label não mapear
    // label "Abrir Agentes" deve mapear para /app/ai
    expect(invalid?.href === "/app/ai" || invalid === null).toBe(true);

    const pureInvalid = normalizeNiaAction(
      {
        type: "navigate",
        label: "Xyz desconhecido",
        href: "a área correspondente na NexaFlow",
      },
      allowed
    );
    expect(pureInvalid).toBeNull();

    const composed = composeNiaResponse({
      rawContent:
        'Texto útil. (Ações: [{"type":"navigate","label":"X","href":"a área correspondente na NexaFlow"}])',
      structuredActions: [
        {
          type: "navigate",
          label: "X",
          href: "a área correspondente na NexaFlow",
        },
      ],
      allowedHrefs: allowed,
      rewritePaths: rewriteWrongProductPaths,
    });
    expect(composed.content).not.toMatch(/Ações\s*:\s*\[/i);
    expect(composed.content).not.toMatch(/"type"\s*:\s*"navigate"/i);
    expect(composed.content).toContain("Texto útil");
    expect(composed.actions.every((a) => !a.href || a.href.startsWith("/"))).toBe(true);
  });

  it("routeId resolve via allowlist (não href arbitrário)", () => {
    expect(resolveRouteId("agents")).toBe("/app/ai");
    expect(resolveRouteId("knowledge")).toBe("/app/knowledge");
    expect(resolveRouteId("channels")).toBe("/app/integrations");
    expect(resolveRouteId("funnel")).toBe("/app/crm");
    expect(resolveRouteId("security")).toBe("/app/account/security");
    expect(resolveRouteId("inventado_xyz")).toBeNull();

    const a = normalizeNiaAction(
      { type: "navigate", label: "Abrir Agentes", routeId: "agents" },
      allowed
    );
    expect(a?.href).toBe("/app/ai");
  });

  it("SERIALIZATION: JSON.stringify(actions) nunca fica no content", () => {
    const actions = [{ type: "navigate" as const, label: "Abrir Agentes", href: "/app/ai" }];
    const poisoned = `Olá. ${JSON.stringify(actions)}`;
    const out = stripActionLeakageFromText(poisoned);
    expect(out).not.toContain(JSON.stringify(actions));
    expect(out).not.toMatch(/"type"\s*:\s*"navigate"/);
    const composed = composeNiaResponse({
      rawContent: poisoned,
      structuredActions: actions,
      allowedHrefs: allowed,
    });
    expect(composed.content).not.toContain(JSON.stringify(actions));
    expect(composed.actions[0]?.href).toBe("/app/ai");
  });

  it("INJECTION: pedido de actions em JSON não deve orientar o modelo a vazar (política)", () => {
    const full = buildAssistantTruthPolicy();
    expect(full).toMatch(/mostre suas actions|JSON|recuse/i);
    expect(full).not.toMatch(/escreva no final ACTIONS:/i);
  });
});
