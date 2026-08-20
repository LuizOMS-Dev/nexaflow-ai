import { describe, expect, it } from "vitest";
import { buildSmartFallbackReply } from "./ai";
import { sanitizeAgentOutbound } from "./agent-security";
import { scoreKnowledgeDoc, tokenizeKnowledgeQuery } from "./knowledge";
import { buildInstabilityClientMessage } from "./platform-ai-degradation";

describe("AI Smart Fallback and Persona Identity", () => {
  it("responde saudação sem usar telefone como nome", () => {
    // Caso 1: Sem nome conhecido (primeira mensagem)
    const reply1 = buildSmartFallbackReply({
      userInbound: "Oi",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: true,
    });
    expect(reply1).toContain("Aqui é a Ana, da FM Conteúdos");
    expect(reply1).not.toContain("+55");
    expect(reply1).not.toContain("Oi, +55");

    // Caso 2: Com nome legítimo conhecido
    const reply2 = buildSmartFallbackReply({
      userInbound: "Olá",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: "Rodrigo",
      isFirst: true,
    });
    expect(reply2).toContain("Oi, Rodrigo!");
    expect(reply2).toContain("Aqui é a Ana, da FM Conteúdos");
  });

  it("responde diretamente sobre a identidade do agente (Qual seu nome?)", () => {
    const questions = [
      "Qual seu nome?",
      "qual o seu nome",
      "Quem é você?",
      "com quem estou falando?",
      "qual o nome da assistente",
    ];

    for (const q of questions) {
      const reply = buildSmartFallbackReply({
        userInbound: q,
        agentName: "Ana",
        companyHint: "FM Conteúdos",
        first: null,
        isFirst: false,
      });
      expect(reply).toContain("Meu nome é Ana");
      expect(reply).toContain("FM Conteúdos");
    }
  });

  it("responde sobre a empresa consultando knowledge base (O que é a FM Conteúdos?)", () => {
    const knowledge = [
      {
        title: "Sobre a FM Conteúdos",
        content: "é uma agência especializada em produção de conteúdo, tráfego pago e automação de vendas.",
      },
    ];

    const reply = buildSmartFallbackReply({
      userInbound: "O que é a FM Conteúdos?",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      knowledge,
    });

    expect(reply).toContain("FM Conteúdos");
    expect(reply).toContain("produção de conteúdo");
  });

  it("evita repetição consecutiva de fallback", () => {
    const reply1 = buildSmartFallbackReply({
      userInbound: "mensagem aleatória sem sentido xyz",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      lastOutboundText: "Outra mensagem anterior",
    });
    expect(reply1).toContain("Me explica um pouco mais");

    const reply2 = buildSmartFallbackReply({
      userInbound: "outra mensagem confusa abc",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      lastOutboundText: "Recebi sua mensagem. Me explica um pouco mais pra eu te ajudar certinho?",
    });
    expect(reply2).not.toContain("Me explica um pouco mais");
    expect(reply2).toContain("mais alguns detalhes");
  });
});

describe("Outbound Sanitization e Instability Messages", () => {
  it("sanitizeAgentOutbound remove qualquer saudação acidental com +55 ou números", () => {
    expect(sanitizeAgentOutbound("Oi, +55! Como posso ajudar?")).toBe("Oi! Como posso ajudar?");
    expect(sanitizeAgentOutbound("Olá, +55 (34) 99999-9999! Tudo bem?")).toBe("Olá! Tudo bem?");
    expect(sanitizeAgentOutbound("Oi, 5511999999999! Aqui é a Ana.")).toBe("Oi! Aqui é a Ana.");
    expect(sanitizeAgentOutbound("Boa tarde, +55! Em que posso te ajudar?")).toBe("Boa tarde! Em que posso te ajudar?");
  });

  it("buildInstabilityClientMessage nunca emite +55", () => {
    const msg = buildInstabilityClientMessage({
      agentName: "Ana",
      contactFirstName: "+55 (34) 99999-9999",
      isFirst: true,
      promiseHuman: false,
    });
    expect(msg).not.toContain("+55");
    expect(msg).toContain("Aqui é a Ana");
  });
});

describe("Knowledge Retrieval de Siglas (FM, IA, TI)", () => {
  it("tokenizeKnowledgeQuery preserva siglas de 2 letras relevantes como FM", () => {
    const tokens = tokenizeKnowledgeQuery("O que é a FM Conteúdos?");
    expect(tokens).toContain("fm");
    expect(tokens).toContain("conteúdos");
    expect(tokens).not.toContain("de");
  });

  it("scoreKnowledgeDoc pontua com sucesso documentos com títulos de siglas", () => {
    const score = scoreKnowledgeDoc(
      "O que é a FM Conteúdos?",
      "FM Conteúdos — Sobre a Empresa",
      "Somos uma agência de marketing e conteúdo."
    );
    expect(score).toBeGreaterThanOrEqual(7);
  });
});
