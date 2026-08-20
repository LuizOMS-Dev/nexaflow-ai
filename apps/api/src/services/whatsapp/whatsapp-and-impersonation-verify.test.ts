import { describe, expect, it } from "vitest";
import { parseWahaWebhook } from "./webhook-parse";
import { normalizePhone } from "./types";
import { phoneLookupVariants } from "../../lib/contact-fields";

describe("1. WhatsApp Webhook Parser — Todos os Formatos Reais", () => {
  it("WAHA: processa mensagem de texto simples", () => {
    const payload = {
      event: "message",
      session: "empresa-1",
      payload: {
        id: "true_5511999998888@c.us_3EB01234",
        from: "5511999998888@c.us",
        body: "Olá, gostaria de saber o preço do plano",
        fromMe: false,
        pushName: "Rodrigo Almeida",
      },
    };

    const result = parseWahaWebhook(payload);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      phone: "5511999998888",
      name: "Rodrigo Almeida",
      content: "Olá, gostaria de saber o preço do plano",
      externalId: "waha:true_5511999998888@c.us_3EB01234",
      fromMe: false,
      mediaUrl: undefined,
      mediaMime: undefined,
    });
  });

  it("WAHA: processa mensagem com mídia / documento", () => {
    const payload = {
      event: "message",
      payload: {
        id: "msg_doc_999",
        from: "5511977776666@c.us",
        body: "Segue o contrato assinado",
        fromMe: false,
        media: {
          url: "http://waha:3000/api/files/contrato.pdf",
          mimetype: "application/pdf",
        },
      },
    };

    const result = parseWahaWebhook(payload);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].mediaUrl).toBe("http://waha:3000/api/files/contrato.pdf");
    expect(result.messages[0].mediaMime).toBe("application/pdf");
    expect(result.messages[0].content).toBe("Segue o contrato assinado");
  });

  it("Evolution API: processa messages.upsert com key.remoteJid e message.conversation", () => {
    const payload = {
      event: "messages.upsert",
      instance: "empresa_whatsapp",
      data: {
        key: {
          remoteJid: "5511988887777@s.whatsapp.net",
          fromMe: false,
          id: "EVO_ABC_789",
        },
        pushName: "Camila Santos",
        message: {
          conversation: "Qual o horário de funcionamento de vocês?",
        },
        messageType: "conversation",
      },
    };

    const result = parseWahaWebhook(payload);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].phone).toBe("5511988887777");
    expect(result.messages[0].name).toBe("Camila Santos");
    expect(result.messages[0].content).toBe("Qual o horário de funcionamento de vocês?");
    expect(result.messages[0].externalId).toBe("waha:EVO_ABC_789");
    expect(result.messages[0].fromMe).toBe(false);
  });

  it("Evolution API: processa lote de mensagens (data.messages array)", () => {
    const payload = {
      event: "messages.upsert",
      instance: "empresa_whatsapp",
      data: {
        messages: [
          {
            key: {
              remoteJid: "5511955554444@s.whatsapp.net",
              fromMe: false,
              id: "BATCH_01",
            },
            pushName: "Fernanda",
            message: {
              extendedTextMessage: { text: "Preciso de suporte com minha conta" },
            },
          },
        ],
      },
    };

    const result = parseWahaWebhook(payload);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].phone).toBe("5511955554444");
    expect(result.messages[0].name).toBe("Fernanda");
    expect(result.messages[0].content).toBe("Preciso de suporte com minha conta");
  });

  it("Descarta mensagens de grupos, status e transmissões", () => {
    const groupPayload = {
      event: "message",
      payload: {
        from: "120363024829392@g.us",
        body: "Mensagem em grupo de família",
        fromMe: false,
      },
    };
    const broadcastPayload = {
      event: "message",
      payload: {
        from: "status@broadcast",
        body: "Status update",
        fromMe: false,
      },
    };

    expect(parseWahaWebhook(groupPayload).messages).toHaveLength(0);
    expect(parseWahaWebhook(broadcastPayload).messages).toHaveLength(0);
  });

  it("Processa status de conexão e QR Code", () => {
    const statusPayload = {
      event: "session.status",
      payload: {
        status: "WORKING",
        me: { id: "5511999990000@c.us" },
      },
    };
    const qrPayload = {
      event: "qrcode.updated",
      payload: {
        qrcode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      },
    };

    const statusResult = parseWahaWebhook(statusPayload);
    expect(statusResult.connection?.state).toBe("open");
    expect(statusResult.connection?.phone).toBe("5511999990000");

    const qrResult = parseWahaWebhook(qrPayload);
    expect(qrResult.qrcode).toContain("data:image/png;base64");
  });
});

describe("2. Normalização e Variantes de Telefone WhatsApp", () => {
  it("normaliza telefones com DDI, DDD e formatação brasileira", () => {
    expect(normalizePhone("+55 (11) 98888-7777")).toBe("5511988887777");
    expect(normalizePhone("11 98888-7777")).toBe("11988887777");
    expect(normalizePhone("5511988887777")).toBe("5511988887777");
  });

  it("gera variantes com 8 e 9 dígitos para lookup tolerante", () => {
    const variants = phoneLookupVariants("5511988887777");
    expect(variants.length).toBeGreaterThan(0);
    expect(variants).toContain("5511988887777");
  });
});
