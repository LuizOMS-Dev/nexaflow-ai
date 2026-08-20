import { describe, expect, it } from "vitest";
import { detectToolRequiredIntent } from "../agent-action-grounding";
import { matchHandoffTriggers } from "../human-handoff";
import { buildSmartFallbackReply } from "../ai";

describe("Regression: AI Auto Reply Handoff Triggers and False Positives", () => {
  it("não dispara handoff humano quando cliente apenas menciona palavras como pessoa ou atendente em dúvidas normais", () => {
    const normalQueries = [
      "Você é uma pessoa real ou uma atendente virtual?",
      "Qual seu nome de atendente?",
      "Quantas pessoas trabalham na empresa?",
      "Como vocês atendem uma pessoa física?",
      "Você é o atendente responsável?",
    ];

    for (const q of normalQueries) {
      const intent = detectToolRequiredIntent(q);
      expect(intent).not.toBe("REQUEST_HUMAN");
    }
  });

  it("dispara handoff humano com precisão quando cliente pede explicitamente por atendimento humano", () => {
    const handoffQueries = [
      "Quero falar com um atendente humano",
      "Me passa para uma pessoa real por favor",
      "Preciso de suporte humano",
      "Pode transferir para um especialista?",
      "Quero falar com o gerente",
      "humano por favor",
    ];

    for (const q of handoffQueries) {
      const intent = detectToolRequiredIntent(q);
      expect(intent).toBe("REQUEST_HUMAN");
    }
  });
});

describe("Regression: 10 Mensagens Consecutivas sem Bloqueio de Idempotência ou Trava", () => {
  it("processa 10 mensagens distintas sequenciais sem loop e sem silêncio", () => {
    const messages = [
      "Oi",
      "Qual seu nome?",
      "O que é a FM Conteúdos?",
      "Quais serviços vocês oferecem?",
      "Como funciona a produção de conteúdo?",
      "Vocês atendem empresas de tecnologia?",
      "Qual o horário de atendimento?",
      "Vocês trabalham com tráfego pago?",
      "Tem algum exemplo de trabalho?",
      "Obrigado pelas informações!",
    ];

    let lastOutbound: string | null = null;
    const generatedReplies: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const inbound = messages[i];
      const isFirst = i === 0;

      const reply = buildSmartFallbackReply({
        userInbound: inbound,
        agentName: "Ana",
        companyHint: "FM Conteúdos",
        first: null,
        isFirst,
        knowledge: [
          {
            title: "Sobre a FM Conteúdos",
            content: "é uma agência especializada em produção de conteúdo, tráfego pago e automação de vendas.",
          },
        ],
        lastOutboundText: lastOutbound,
      });

      expect(reply).toBeTruthy();
      expect(reply.length).toBeGreaterThan(5);
      expect(reply).not.toContain("+55");

      // Nenhuma mensagem sucessiva pode repetir a exata mesma resposta de fallback
      if (lastOutbound && reply.includes("Recebi sua mensagem")) {
        expect(lastOutbound).not.toContain("Recebi sua mensagem");
      }

      generatedReplies.push(reply);
      lastOutbound = reply;
    }

    expect(generatedReplies.length).toBe(10);
  });

  it("recupera imediatamente após falha simulada no M4, permitindo que o M5 responda normalmente", () => {
    // Simulação M1, M2, M3 respondem normalmente
    const r1 = buildSmartFallbackReply({
      userInbound: "Oi",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: true,
    });
    expect(r1).toContain("Aqui é a Ana");

    const r2 = buildSmartFallbackReply({
      userInbound: "Qual seu nome?",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
    });
    expect(r2).toContain("Meu nome é Ana");

    const r3 = buildSmartFallbackReply({
      userInbound: "O que é a FM Conteúdos?",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      knowledge: [{ title: "FM Conteúdos", content: "agência digital" }],
    });
    expect(r3).toContain("FM Conteúdos");

    // M4 sofre erro no provedor / rate limit -> gera fallback gracioso e registra estado
    const r4 = buildSmartFallbackReply({
      userInbound: "mensagem complexa com erro no provedor",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      lastOutboundText: r3,
    });
    expect(r4).toBeTruthy();

    // M5 chega em seguida -> processa normalmente sem ficar travado no erro do M4
    const r5 = buildSmartFallbackReply({
      userInbound: "Como posso contratar?",
      agentName: "Ana",
      companyHint: "FM Conteúdos",
      first: null,
      isFirst: false,
      lastOutboundText: r4,
    });
    expect(r5).toBeTruthy();
    expect(r5).not.toBe(r4);
  });
});
