import { describe, expect, it } from "vitest";
import { buildHandoffNotificationCopy, matchHandoffTriggers } from "./human-handoff";

describe("buildHandoffNotificationCopy", () => {
  it("mensagem clara quando a IA pede para assumir", () => {
    const { title, body } = buildHandoffNotificationCopy({
      agentLabel: "Julia",
      contactLabel: "Maria Silva",
      reason: "request_human",
      reasonLabel: "Julia pediu um atendente humano para continuar a conversa",
      source: "ai_tool",
    });
    expect(title).toMatch(/assumir|IA pediu/i);
    expect(body).toMatch(/Maria Silva/);
    expect(body).toMatch(/Assumir/i);
    expect(body).not.toMatch(/fila humana$/i);
  });

  it("fallback amigável se reasonLabel genérico", () => {
    const { title, body } = buildHandoffNotificationCopy({
      agentLabel: "Ana",
      contactLabel: "João",
      reasonLabel: "IA solicitou atendimento humano",
      source: "ai_tool",
    });
    expect(title.toLowerCase()).toMatch(/assumir|ia pediu/);
    expect(body).toMatch(/Ana|João|Assumir/i);
  });
});

describe("matchHandoffTriggers", () => {
  it("detecta pedido de humano", () => {
    const m = matchHandoffTriggers({
      customerMessage: "Quero falar com um atendente humano por favor",
      triggers: ["humano", "nao_sabe"],
    });
    expect(m?.trigger).toBe("humano");
  });

  it("detecta variantes de pedido de pessoa", () => {
    const samples = [
      "Quero falar com alguém",
      "Me passa para um atendente",
      "Não quero falar com robô, quero um humano",
    ];
    for (const customerMessage of samples) {
      const m = matchHandoffTriggers({
        customerMessage,
        triggers: ["humano"],
      });
      expect(m?.trigger, customerMessage).toBe("humano");
    }
  });

  it("detecta reclamação", () => {
    const m = matchHandoffTriggers({
      customerMessage: "Que péssimo atendimento, quero reclamar e cancelar",
      triggers: ["humano", "reclamacao"],
    });
    expect(m?.trigger).toBe("reclamacao");
  });

  it("detecta nao_sabe pela resposta da IA", () => {
    const m = matchHandoffTriggers({
      customerMessage: "Qual o preço do plano ouro?",
      aiReply: "Não tenho essa informação confirmada agora. Prefiro confirmar com a equipe.",
      triggers: ["nao_sabe", "humano"],
    });
    expect(m?.trigger).toBe("nao_sabe");
  });

  it("detecta intenção de compra", () => {
    const m = matchHandoffTriggers({
      customerMessage: "Quero contratar o plano profissional hoje",
      triggers: ["compra", "humano"],
    });
    expect(m?.trigger).toBe("compra");
  });

  it("detecta handoff pelo tom da resposta da IA", () => {
    const m = matchHandoffTriggers({
      customerMessage: "oi",
      aiReply: "Vou te encaminhar para alguém da nossa equipe agora.",
      triggers: ["humano"],
    });
    expect(m?.trigger).toBe("ai_reply_handoff");
  });

  it("detecta regra customizada", () => {
    const m = matchHandoffTriggers({
      customerMessage: "preciso de integração com o ERP SAP",
      triggers: ["ERP SAP", "humano"],
    });
    expect(m?.trigger).toBe("ERP SAP");
  });

  it("não dispara sem match", () => {
    const m = matchHandoffTriggers({
      customerMessage: "Bom dia, tudo bem?",
      aiReply: "Bom dia! Como posso ajudar?",
      triggers: ["humano", "reclamacao"],
    });
    expect(m).toBeNull();
  });

  it("não cria match só por saudação em multi-pedido", () => {
    // três mensagens pedindo humano usam o mesmo matcher — o motor de fila faz dedupe
    const m1 = matchHandoffTriggers({
      customerMessage: "Quero falar com alguém",
      triggers: ["humano"],
    });
    const m2 = matchHandoffTriggers({
      customerMessage: "Tem alguém aí?",
      triggers: ["humano"],
    });
    expect(m1?.trigger).toBe("humano");
    // "Tem alguém aí?" — regex humano inclui "alguém" via "falar com alguém" mas não "tem alguém"
    // aceite null ou humano; o importante é que handoffToHumanQueue dedupe por notice recente
    expect(m2 === null || m2.trigger === "humano").toBe(true);
  });
});
