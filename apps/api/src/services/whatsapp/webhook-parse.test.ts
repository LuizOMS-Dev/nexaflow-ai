import { describe, expect, it } from "vitest";
import { parseWahaWebhook } from "./webhook-parse";

describe("parseWahaWebhook", () => {
  it("extrai mensagem de texto simples", () => {
    const payload = {
      event: "message",
      session: "default",
      payload: {
        id: "msg-123",
        from: "5511999999999@c.us",
        body: "Olá, gostaria de informações",
        fromMe: false,
        pushName: "João Silva",
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toEqual({
      phone: "5511999999999",
      name: "João Silva",
      content: "Olá, gostaria de informações",
      externalId: "waha:msg-123",
      fromMe: false,
      mediaUrl: undefined,
      mediaMime: undefined,
    });
  });

  it("extrai mensagem com mídia (áudio/imagem)", () => {
    const payload = {
      event: "message",
      payload: {
        id: "msg-media-456",
        from: "5511888888888@c.us",
        body: "Segue comprovante",
        fromMe: false,
        media: {
          url: "http://waha:3000/api/files/doc.pdf",
          mimetype: "application/pdf",
        },
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaUrl).toBe("http://waha:3000/api/files/doc.pdf");
    expect(parsed.messages[0].mediaMime).toBe("application/pdf");
  });

  it("ignora mensagens de grupos (@g.us)", () => {
    const payload = {
      event: "message",
      payload: {
        id: "grp-1",
        from: "123456789-987654@g.us",
        body: "Mensagem em grupo",
        fromMe: false,
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(0);
  });

  it("processa evento session.status (WORKING / open)", () => {
    const payload = {
      event: "session.status",
      session: "default",
      payload: {
        name: "default",
        status: "WORKING",
        me: { id: "5511999999999@c.us" },
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.connection).toBeDefined();
    expect(parsed.connection?.state).toBe("open");
    expect(parsed.connection?.phone).toBe("5511999999999");
  });

  it("processa evento session.status (SCAN_QR_CODE / connecting)", () => {
    const payload = {
      event: "session.status",
      session: "default",
      payload: {
        name: "default",
        status: "SCAN_QR_CODE",
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.connection).toBeDefined();
    expect(parsed.connection?.state).toBe("connecting");
  });

  it("processa evento session.status (STOPPED / close)", () => {
    const payload = {
      event: "session.status",
      session: "default",
      payload: {
        name: "default",
        status: "STOPPED",
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.connection).toBeDefined();
    expect(parsed.connection?.state).toBe("close");
  });

  it("processa mensagens no formato Evolution API (messages.upsert com key.remoteJid)", () => {
    const payload = {
      event: "messages.upsert",
      instance: "company-instance",
      data: {
        key: {
          remoteJid: "5511988776655@s.whatsapp.net",
          fromMe: false,
          id: "3EB0ABC123",
        },
        pushName: "Maria Souza",
        message: {
          conversation: "Olá, quero fazer um orçamento",
        },
        messageType: "conversation",
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toEqual({
      phone: "5511988776655",
      name: "Maria Souza",
      content: "Olá, quero fazer um orçamento",
      externalId: "waha:3EB0ABC123",
      fromMe: false,
      mediaUrl: undefined,
      mediaMime: undefined,
    });
  });

  it("processa lote de mensagens em array (data.messages)", () => {
    const payload = {
      event: "messages.upsert",
      data: {
        messages: [
          {
            key: {
              remoteJid: "5511911112222@s.whatsapp.net",
              fromMe: false,
              id: "msg-batch-1",
            },
            pushName: "Carlos",
            message: {
              extendedTextMessage: { text: "Mensagem 1" },
            },
          },
        ],
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].phone).toBe("5511911112222");
    expect(parsed.messages[0].content).toBe("Mensagem 1");
  });
});
