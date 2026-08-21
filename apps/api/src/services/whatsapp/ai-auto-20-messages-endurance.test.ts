import { describe, expect, it } from "vitest";
import { detectToolRequiredIntent } from "../agent-action-grounding";
import { buildSmartFallbackReply } from "../ai";
import { extractValidPersonFirstName, isValidPersonName } from "../../lib/contact-fields";

describe("AI Endurance: 20 Mensagens Consecutivas sem Travamento no Modo AUTO", () => {
  it("processa 20 mensagens consecutivas em turnos contínuos gerando respostas válidas e sem silêncio", () => {
    const dialogue20 = [
      "Olá, bom dia!",
      "Quem é a empresa e o que vocês fazem?",
      "Quais são os principais serviços de vocês?",
      "Vocês atendem pequenas e médias empresas?",
      "Como funciona o atendimento via WhatsApp?",
      "Vocês trabalham com produção de conteúdo?",
      "Fazem também gestão de tráfego pago?",
      "Qual o prazo médio de início dos trabalhos?",
      "Quais formas de pagamento são aceitas?",
      "Vocês emitem nota fiscal para pessoa jurídica?",
      "Qual é o horário de atendimento da equipe humana?",
      "Se eu mandar mensagem fora do horário, o que acontece?",
      "Vocês atendem clientes de todo o Brasil?",
      "Tem algum contrato de fidelidade obrigatório?",
      "Como faço para solicitar uma proposta personalizada?",
      "Vocês têm equipe de suporte técnico?",
      "Qual canal é mais rápido para tirar dúvidas urgentes?",
      "Posso agendar uma demonstração ou reunião online?",
      "Perfeito, adorei todas as explicações!",
      "Muito obrigado pela atenção e bom trabalho!",
    ];

    let lastOutbound: string | null = null;
    const replies: string[] = [];

    for (let i = 0; i < dialogue20.length; i++) {
      const inbound = dialogue20[i];
      const isFirst = i === 0;

      const reply = buildSmartFallbackReply({
        userInbound: inbound,
        agentName: "Ana",
        companyHint: "NexaFlow Soluções",
        first: "Lucas",
        isFirst,
        knowledge: [
          {
            title: "Apresentação da Empresa e Atendimento",
            content: "A NexaFlow Soluções oferece atendimento de excelência, tecnologia e automação de processos para empresas.",
          },
          {
            title: "FAQ de Atendimento ao Cliente",
            content: "Atendimento digital contínuo via WhatsApp. Pagamentos via Pix, cartão e boleto. Suporte de segunda a sexta.",
          },
          {
            title: "Políticas Comerciais e Diretrizes",
            content: "Atendemos todo o Brasil com emissão de nota fiscal e respeito total à LGPD.",
          },
        ],
        lastOutboundText: lastOutbound,
      });

      expect(reply).toBeTruthy();
      expect(reply.length).toBeGreaterThan(10);
      expect(reply).not.toContain("+55");
      expect(reply).not.toContain("undefined");
      expect(reply).not.toContain("null");

      replies.push(reply);
      lastOutbound = reply;
    }

    expect(replies.length).toBe(20);
  });

  it("garante tratamento de nome seguro: usa primeiro nome se válido e nunca chama cliente de +55", () => {
    // Caso A: Nome válido de pessoa
    const nameValid = "Juliana Silveira";
    expect(isValidPersonName(nameValid)).toBe(true);
    const firstName = extractValidPersonFirstName(nameValid);
    expect(firstName).toBe("Juliana");

    const replyNamed = buildSmartFallbackReply({
      userInbound: "Olá, quero saber mais sobre os serviços",
      agentName: "Ana",
      companyHint: "Empresa Real",
      first: firstName,
      isFirst: true,
    });
    expect(replyNamed).toContain("Juliana");
    expect(replyNamed).not.toContain("+55");

    // Caso B: Contato apenas com número de telefone
    const phoneContact = "+551199887766";
    expect(isValidPersonName(phoneContact)).toBe(false);
    const firstNamePhone = extractValidPersonFirstName(phoneContact);
    expect(firstNamePhone).toBeNull();

    const replyPhone = buildSmartFallbackReply({
      userInbound: "Olá, quero saber mais sobre os serviços",
      agentName: "Ana",
      companyHint: "Empresa Real",
      first: firstNamePhone,
      isFirst: true,
    });
    expect(replyPhone).not.toContain("+55");
    expect(replyPhone).not.toContain("1199887766");
  });

  it("recupera e mantém fluxo após múltiplas falhas transitórias simuladas no M7 e M14", () => {
    const mockDialogue = [
      "Msg 1", "Msg 2", "Msg 3", "Msg 4", "Msg 5", "Msg 6",
      "Msg 7 (erro transitório)", "Msg 8", "Msg 9", "Msg 10",
      "Msg 11", "Msg 12", "Msg 13", "Msg 14 (erro transitório)", "Msg 15"
    ];

    let lastOutbound: string | null = null;
    let successCount = 0;

    for (let i = 0; i < mockDialogue.length; i++) {
      const inbound = mockDialogue[i];
      const isErrorTurn = i === 6 || i === 13;

      const reply = buildSmartFallbackReply({
        userInbound: inbound,
        agentName: "Ana",
        companyHint: "Empresa Teste",
        first: null,
        isFirst: i === 0,
        lastOutboundText: isErrorTurn ? null : lastOutbound,
      });

      expect(reply).toBeTruthy();
      if (reply) successCount++;
      lastOutbound = reply;
    }

    expect(successCount).toBe(15);
  });
});
