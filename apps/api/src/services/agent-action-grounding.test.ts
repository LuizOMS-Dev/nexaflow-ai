/**
 * Agent Action Grounding — sem promessa falsa de verificação / handoff.
 */
import { describe, expect, it } from "vitest";
import {
  buildActionGroundingPolicy,
  buildUnavailableFactReply,
  containsFutureVerificationPromise,
  containsPastHandoffClaim,
  detectToolRequiredIntent,
  groundAgentOutbound,
  knowledgeLooksRelevantToIntent,
  stripUngroundedOperationalClaims,
  type VerificationEvidence,
} from "./agent-action-grounding";
import { buildGlobalTruthPolicy } from "./ai";

const emptyEvidence = (): VerificationEvidence => ({
  knowledgeQueried: false,
  knowledgeHitCount: 0,
  knowledgeHadRelevantFacts: false,
  toolsExecuted: [],
  handoffConfirmed: false,
});

describe("detectToolRequiredIntent", () => {
  it("preço", () => {
    expect(detectToolRequiredIntent("Quanto custa?")).toBe("CHECK_PRICE");
    expect(detectToolRequiredIntent("Qual o preço do flyer?")).toBe("CHECK_PRICE");
  });
  it("lista de planos sem mencionar preço", () => {
    expect(detectToolRequiredIntent("Quais são os planos?")).toBe("CHECK_PLAN");
    expect(detectToolRequiredIntent("Que planos vocês oferecem?")).toBe("CHECK_PLAN");
  });
  it("humano", () => {
    expect(detectToolRequiredIntent("Quero falar com um atendente")).toBe("REQUEST_HUMAN");
  });
});

describe("FALSE VERIFICATION CLAIM / FAKE PENDING", () => {
  it("detecta 'vou verificar'", () => {
    expect(
      containsFutureVerificationPromise(
        "Vou verificar os nossos planos e preços atuais para te dar mais detalhes."
      )
    ).toBe(true);
    expect(containsFutureVerificationPromise("Os flyers começam a partir de R$ 50.")).toBe(
      false
    );
  });

  it("PRICE FOUND: knowledge com preço → não deixa só 'vou verificar'", () => {
    const evidence: VerificationEvidence = {
      knowledgeQueried: true,
      knowledgeHitCount: 1,
      knowledgeHadRelevantFacts: true,
      knowledgeSnippets: ["Flyer a partir de R$ 50 conforme tabela comercial."],
      toolsExecuted: [],
    };
    const g = groundAgentOutbound({
      reply:
        "Nossa política de preços é transparente e competitiva. Vou verificar os nossos planos e preços atuais para te dar mais detalhes.",
      userMessage: "Quanto custa um flyer?",
      evidence,
    });
    expect(g.reply).not.toMatch(/vou verificar/i);
    expect(g.reply).toMatch(/R\$\s*50|50/i);
    expect(g.blockedFakePending || g.rewritten).toBe(true);
    expect(g.outcome).toBe("ANSWERED");
  });

  it("PRICE NOT FOUND: sem knowledge → transparência + oferta handoff", () => {
    const evidence: VerificationEvidence = {
      knowledgeQueried: true,
      knowledgeHitCount: 0,
      knowledgeHadRelevantFacts: false,
      toolsExecuted: [],
    };
    const g = groundAgentOutbound({
      reply: "Vou verificar nossos preços atuais e já te passo.",
      userMessage: "Quanto custa?",
      evidence,
      offerHandoff: true,
    });
    expect(g.reply).not.toMatch(/vou verificar|j[aá]\s+te\s+passo|volto/i);
    expect(g.reply).toMatch(/n[aã]o encontrei|n[aã]o\s+encontrei/i);
    expect(g.reply).toMatch(/encaminhar|equipe/i);
    expect(g.outcome).toMatch(/HANDOFF_OFFERED|INFORMATION_UNAVAILABLE/);
    expect(g.blockedFakePending).toBe(true);
  });

  it("PLAN NOT FOUND: substitui catálogo inventado mesmo quando a resposta parece completa", () => {
    const g = groundAgentOutbound({
      reply:
        "Oferecemos Plano Básico, Plano Premium e Plano Empresarial, todos com relatórios mensais.",
      userMessage: "Quais são os planos?",
      evidence: {
        knowledgeQueried: true,
        knowledgeHitCount: 4,
        knowledgeHadRelevantFacts: false,
        knowledgeSnippets: ["A empresa trabalha com soluções personalizadas."],
        toolsExecuted: [],
      },
      offerHandoff: true,
    });
    expect(g.reply).toMatch(/não encontrei uma lista confirmada/i);
    expect(g.reply).not.toMatch(/básico|premium|empresarial/i);
    expect(g.rewritten).toBe(true);
  });

  it("PLAN MISMATCH: bloqueia nome de plano ausente nas fontes recuperadas", () => {
    const g = groundAgentOutbound({
      reply: "Temos o Plano Premium com atendimento prioritário.",
      userMessage: "Quais planos vocês oferecem?",
      evidence: {
        knowledgeQueried: true,
        knowledgeHitCount: 1,
        knowledgeHadRelevantFacts: true,
        knowledgeSnippets: ["Plano Essencial: criação de uma peça individual."],
        toolsExecuted: [],
      },
      offerHandoff: false,
    });
    expect(g.reply).toMatch(/lista confirmada/i);
    expect(g.reply).not.toMatch(/premium/i);
  });

  it("FALSE HANDOFF CLAIM: 'encaminhei' sem handoff confirmado", () => {
    const g = groundAgentOutbound({
      reply: "Encaminhei seu atendimento para a equipe responsável.",
      userMessage: "Quero orçamento",
      evidence: emptyEvidence(),
    });
    expect(g.reply).not.toMatch(/^Encaminhei/i);
    expect(g.reply.toLowerCase()).toMatch(/posso encaminhar|encaminhar/);
  });

  it("HANDOFF SUCCESS: claim permitido com evidência", () => {
    const g = groundAgentOutbound({
      reply: "Encaminhei seu atendimento para a equipe responsável.",
      userMessage: "Falar com humano",
      evidence: {
        ...emptyEvidence(),
        handoffConfirmed: true,
      },
      willExecuteHandoff: true,
    });
    expect(g.reply).toMatch(/Encaminhei/i);
    expect(g.needsHumanHandoff).toBe(true);
    expect(g.outcome).toBe("HANDOFF_REQUESTED");
  });

  it("TOOL FAILURE: não inventa", () => {
    const g = groundAgentOutbound({
      reply: "Ok",
      userMessage: "Status do pedido 123",
      evidence: {
        knowledgeQueried: false,
        knowledgeHitCount: 0,
        knowledgeHadRelevantFacts: false,
        toolsExecuted: [{ name: "get_order", ok: false }],
      },
    });
    expect(g.reply).toMatch(/n[aã]o consegui consultar|equipe/i);
    expect(g.outcome).toBe("TOOL_FAILED");
  });

  it("NO TOOL / sem knowledge: remove 'vou falar com a equipe' falso", () => {
    const g = groundAgentOutbound({
      reply: "Vou falar com a equipe e já volto com a confirmação.",
      userMessage: "Confirme o prazo de entrega",
      evidence: {
        knowledgeQueried: true,
        knowledgeHitCount: 0,
        knowledgeHadRelevantFacts: false,
      },
    });
    expect(g.reply).not.toMatch(/vou falar|j[aá]\s+volto/i);
    expect(g.blockedFakePending).toBe(true);
  });

  it("strip remove promessas e mantém fato útil", () => {
    const out = stripUngroundedOperationalClaims(
      "Os flyers partem de R$ 50. Vou verificar e te aviso depois.",
      {
        knowledgeQueried: true,
        knowledgeHitCount: 1,
        knowledgeHadRelevantFacts: true,
      }
    );
    expect(out).toMatch(/R\$\s*50|50/);
    expect(out).not.toMatch(/vou verificar|te aviso/i);
  });
});

describe("knowledge relevance", () => {
  it("detecta preço no knowledge", () => {
    expect(
      knowledgeLooksRelevantToIntent("CHECK_PRICE", [
        { title: "Planos", content: "Flyer a partir de R$ 50" },
      ])
    ).toBe(true);
    expect(
      knowledgeLooksRelevantToIntent("CHECK_PRICE", [
        { title: "Sobre nós", content: "Somos uma empresa criativa." },
      ])
    ).toBe(false);
  });
});

describe("policy text", () => {
  it("truth policy proíbe future promise sem ação", () => {
    const p = buildGlobalTruthPolicy({ companyName: "Acme" });
    expect(p).toMatch(/vou verificar|PROIBIDO prometer/i);
    expect(p).toMatch(/CLAIM OF VERIFICATION|evidência|EVIDENCE/i);
  });

  it("action grounding policy presente", () => {
    const p = buildActionGroundingPolicy();
    expect(p).toMatch(/EXECUTE FIRST/i);
    expect(p).toMatch(/encaminhei/i);
  });

  it("unavailable template", () => {
    const t = buildUnavailableFactReply({ intent: "CHECK_PRICE", offerHandoff: true });
    expect(t).toMatch(/n[aã]o encontrei/i);
    expect(t).not.toMatch(/vou verificar/i);
  });
});

describe("handoff past claim detection", () => {
  it("detecta encaminhei", () => {
    expect(containsPastHandoffClaim("Encaminhei seu caso.")).toBe(true);
    expect(containsPastHandoffClaim("Posso te ajudar com o orçamento.")).toBe(false);
  });
});
