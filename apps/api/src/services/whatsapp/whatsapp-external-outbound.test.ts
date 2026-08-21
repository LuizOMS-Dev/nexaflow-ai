import { describe, expect, it } from "vitest";
import { parseWahaWebhook } from "./webhook-parse";

describe("WAHA Webhook: Sincronização de Mensagens Externas (fromMe=true / Celular / Web)", () => {
  it("parseia corretamente mensagem enviada pelo celular (fromMe=true) mapeando o cliente como destinatário", () => {
    const mobileSentPayload = {
      event: "message",
      session: "default",
      payload: {
        id: "false_5511999998888@s.whatsapp.net_MOBILE123",
        fromMe: true,
        from: "5511888887777@s.whatsapp.net", // número da própria empresa
        to: "5511999998888@s.whatsapp.net",   // cliente que recebeu
        body: "Olá, estou te respondendo pelo meu celular agora!",
        timestamp: 1718000000,
        _data: {
          key: {
            remoteJid: "5511999998888@s.whatsapp.net",
            fromMe: true,
            id: "MOBILE123",
          },
        },
      },
    };

    const parsed = parseWahaWebhook(mobileSentPayload);
    expect(parsed.messages.length).toBe(1);
    const msg = parsed.messages[0];

    expect(msg.fromMe).toBe(true);
    expect(msg.phone).toBe("5511999998888"); // Deve ser o telefone do cliente, NÃO da empresa
    expect(msg.content).toBe("Olá, estou te respondendo pelo meu celular agora!");
    expect(msg.externalId).toBe("waha:false_5511999998888@s.whatsapp.net_MOBILE123");
    expect(msg.remoteJid).toBe("5511999998888@s.whatsapp.net");
  });

  it("parseia corretamente mensagem enviada pelo WhatsApp Web com remoteJidAlt / LID", () => {
    const webSentPayload = {
      event: "message.create",
      session: "default",
      payload: {
        id: "WEB_LID_999",
        fromMe: true,
        chatId: "5511977776666@c.us",
        body: "Mensagem enviada via WhatsApp Web pelo operador",
        _data: {
          key: {
            remoteJid: "123456789@lid",
            remoteJidAlt: "5511977776666@s.whatsapp.net",
            fromMe: true,
            id: "WEB_LID_999",
          },
        },
      },
    };

    const parsed = parseWahaWebhook(webSentPayload);
    expect(parsed.messages.length).toBe(1);
    const msg = parsed.messages[0];

    expect(msg.fromMe).toBe(true);
    expect(msg.phone).toBe("5511977776666");
    expect(msg.content).toBe("Mensagem enviada via WhatsApp Web pelo operador");
    expect(msg.remoteJid).toBe("123456789@lid");
    expect(msg.remoteJidAlt).toBe("5511977776666@s.whatsapp.net");
  });

  it("diferencia claramente inbound de cliente (fromMe=false) vs outbound externo (fromMe=true)", () => {
    const inboundCustomer = {
      event: "message",
      session: "default",
      payload: {
        id: "CUST_01",
        fromMe: false,
        from: "5511999998888@s.whatsapp.net",
        body: "Oi, gostaria de uma cotação",
        _data: {
          key: {
            remoteJid: "5511999998888@s.whatsapp.net",
            fromMe: false,
            id: "CUST_01",
          },
        },
      },
    };

    const outboundDevice = {
      event: "message",
      session: "default",
      payload: {
        id: "DEV_01",
        fromMe: true,
        to: "5511999998888@s.whatsapp.net",
        body: "Com certeza, segue o valor...",
        _data: {
          key: {
            remoteJid: "5511999998888@s.whatsapp.net",
            fromMe: true,
            id: "DEV_01",
          },
        },
      },
    };

    const parsedIn = parseWahaWebhook(inboundCustomer);
    const parsedOut = parseWahaWebhook(outboundDevice);

    expect(parsedIn.messages[0].fromMe).toBe(false);
    expect(parsedIn.messages[0].phone).toBe("5511999998888");

    expect(parsedOut.messages[0].fromMe).toBe(true);
    expect(parsedOut.messages[0].phone).toBe("5511999998888");
    expect(parsedOut.messages[0].content).toContain("segue o valor");
  });
});
