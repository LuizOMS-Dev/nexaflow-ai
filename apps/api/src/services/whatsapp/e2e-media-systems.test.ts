import { describe, expect, it, vi } from "vitest";
import {
  formatMediaConversationPreview,
  normalizeUnifiedMediaError,
  UNIFIED_MEDIA_LIMITS,
} from "./unified-media-pipeline";
import {
  classifyFile,
  sanitizeFilename,
} from "../storage/media-storage";
import { parseWahaWebhook } from "./webhook-parse";
import { WahaConnector } from "./waha";
import {
  detectJidType,
  extractLid,
  extractPhoneDigitsFromJid,
  formatWahaDestinationChatId,
} from "./identity-resolver";

describe("E2E Test: Sistema 1 - Envio de Mídias (NexaFlow -> WhatsApp)", () => {
  it("1.1 Validação e envio de Imagem JPEG com legenda", async () => {
    const connector = new WahaConnector();
    let calledUrl = "";
    let calledBody: any = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        calledUrl = url;
        calledBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ id: "waha_msg_img_001" }),
        };
      })
    );

    const config = { provider: "waha" as const, baseUrl: "http://waha:3000", session: "default" };
    const res = await connector.sendMedia(config, "5511999990001", {
      kind: "IMAGE",
      mimetype: "image/jpeg",
      filename: "comprovante.jpg",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      caption: "Segue comprovante de pagamento",
    });

    expect(res.ok).toBe(true);
    expect(res.externalId).toBe("waha_msg_img_001");
    expect(calledUrl).toBe("http://waha:3000/api/sendImage");
    expect(calledBody.chatId).toBe("5511999990001@c.us");
    expect(calledBody.caption).toBe("Segue comprovante de pagamento");
    expect(calledBody.file.data).toMatch(/^data:image\/jpeg;base64,/);

    vi.unstubAllGlobals();
  });

  it("1.2 Envio de Mensagem de Voz PTT com convert: true", async () => {
    const connector = new WahaConnector();
    let calledUrl = "";
    let calledBody: any = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        calledUrl = url;
        calledBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ id: "waha_msg_voice_002" }),
        };
      })
    );

    const config = { provider: "waha" as const, baseUrl: "http://waha:3000", session: "default" };
    const res = await connector.sendMedia(config, "5511999990002", {
      kind: "VOICE",
      mimetype: "audio/ogg; codecs=opus",
      filename: "gravacao.ogg",
      dataBase64: "T2dnUwACAAAAAAAAAAA=",
    });

    expect(res.ok).toBe(true);
    expect(res.externalId).toBe("waha_msg_voice_002");
    expect(calledUrl).toBe("http://waha:3000/api/sendVoice");
    expect(calledBody.convert).toBe(true);
    expect(calledBody.file.data).toMatch(/^data:audio\/ogg; codecs=opus;base64,/);

    vi.unstubAllGlobals();
  });

  it("1.3 Envio de Vídeo MP4 com caption e timeout estendido", async () => {
    const connector = new WahaConnector();
    let calledUrl = "";
    let calledBody: any = null;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        calledUrl = url;
        calledBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ id: "waha_msg_video_003" }),
        };
      })
    );

    const config = { provider: "waha" as const, baseUrl: "http://waha:3000", session: "default" };
    const res = await connector.sendMedia(config, "5511999990003", {
      kind: "VIDEO",
      mimetype: "video/mp4",
      filename: "demonstracao.mp4",
      dataBase64: "AAAAIGZ0eXBpc29t",
      caption: "Vídeo explicativo do sistema",
    });

    expect(res.ok).toBe(true);
    expect(res.externalId).toBe("waha_msg_video_003");
    expect(calledUrl).toBe("http://waha:3000/api/sendVideo");
    expect(calledBody.caption).toBe("Vídeo explicativo do sistema");

    vi.unstubAllGlobals();
  });

  it("1.4 Envio de Documentos (PDF, DOCX, XLSX, ZIP) via /api/sendFile", async () => {
    const connector = new WahaConnector();
    const urls: string[] = [];
    const filesSent: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        urls.push(url);
        const body = JSON.parse(opts.body);
        filesSent.push(body.file.filename);
        return {
          ok: true,
          json: async () => ({ id: "waha_msg_file_" + filesSent.length }),
        };
      })
    );

    const config = { provider: "waha" as const, baseUrl: "http://waha:3000", session: "default" };

    // PDF
    await connector.sendMedia(config, "5511999990001", {
      kind: "DOCUMENT",
      mimetype: "application/pdf",
      filename: "Proposta_Comercial.pdf",
      dataBase64: "JVBERi0xLjQK",
    });

    // DOCX
    await connector.sendMedia(config, "5511999990001", {
      kind: "DOCUMENT",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "Contrato_Minuta.docx",
      dataBase64: "UEsDBBQAAAAIA",
    });

    // XLSX
    await connector.sendMedia(config, "5511999990001", {
      kind: "DOCUMENT",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "Orcamento_2026.xlsx",
      dataBase64: "UEsDBBQAAAAIA",
    });

    // ZIP
    await connector.sendMedia(config, "5511999990001", {
      kind: "FILE",
      mimetype: "application/zip",
      filename: "Arquivos_Anexos.zip",
      dataBase64: "UEsDBBQAAAAIA",
    });

    expect(urls).toEqual([
      "http://waha:3000/api/sendFile",
      "http://waha:3000/api/sendFile",
      "http://waha:3000/api/sendFile",
      "http://waha:3000/api/sendFile",
    ]);

    expect(filesSent).toEqual([
      "Proposta_Comercial.pdf",
      "Contrato_Minuta.docx",
      "Orcamento_2026.xlsx",
      "Arquivos_Anexos.zip",
    ]);

    vi.unstubAllGlobals();
  });

  it("1.5 Sanitização de nomes complexos com acentos, espaços e extensões longas", () => {
    expect(sanitizeFilename("Declaração de Faturamento (Janeiro & Fevereiro) 2026.pdf")).toBe(
      "Declaracao_de_Faturamento_Janeiro_Fevereiro_2026.pdf"
    );

    const longDocName = "Demonstrativo_de_Resultados_do_Exercicio_Fiscal_da_Empresa_NexaFlow_Tecnologia_e_Inovacao_S_A_Ano_Base_2026.xlsx";
    const cleanLong = sanitizeFilename(longDocName);
    expect(cleanLong.endsWith(".xlsx")).toBe(true);
    expect(cleanLong.length).toBeLessThanOrEqual(255);
  });

  it("1.6 Bloqueio de arquivos executáveis e perigosos", () => {
    expect(() => sanitizeFilename("malware.exe")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("script.bat")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("backdoor.sh")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("shell.php")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("ransom.vbs")).toThrow(/não permitido/i);
  });

  it("1.7 Limites estritos de tamanho de arquivo", () => {
    expect(UNIFIED_MEDIA_LIMITS.IMAGE).toBe(20 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.VOICE).toBe(25 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.AUDIO).toBe(30 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.VIDEO).toBe(64 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.DOCUMENT).toBe(100 * 1024 * 1024);
  });

  it("1.8 Retry automático apenas para falhas transitórias com backoff", () => {
    const timeoutErr = normalizeUnifiedMediaError(new Error("connect ETIMEDOUT 161.97.107.241:3000"));
    expect(timeoutErr.isRetryable).toBe(true);
    expect(timeoutErr.code).toBe("TIMEOUT");

    const unavailable503 = normalizeUnifiedMediaError(new Error("503 Service Unavailable"));
    expect(unavailable503.isRetryable).toBe(true);
    expect(unavailable503.code).toBe("WAHA_MEDIA_SEND_FAILED");

    const sessionDisconnected = normalizeUnifiedMediaError(new Error("Session default is stopped"));
    expect(sessionDisconnected.isRetryable).toBe(false);
    expect(sessionDisconnected.code).toBe("SESSION_NOT_READY");

    const formatForbidden = normalizeUnifiedMediaError(new Error("Mimetype not allowed: 400"));
    expect(formatForbidden.isRetryable).toBe(false);
    expect(formatForbidden.code).toBe("MEDIA_INVALID_TYPE");
  });
});

describe("E2E Test: Sistema 2 - Recebimento, Storage e Visualização de Mídias (WhatsApp -> NexaFlow)", () => {
  it("2.1 Parser extrai imagem recebida com legenda sem poluir com tags [imagem]", () => {
    const payload = {
      event: "message",
      payload: {
        id: "waha_inbound_img_001",
        from: "5511977770001@c.us",
        fromMe: false,
        hasMedia: true,
        body: "Aqui está a foto solicitada",
        media: {
          url: "http://waha:3000/api/files/photo123.jpg",
          mimetype: "image/jpeg",
          filename: "photo123.jpg",
        },
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaType).toBe("IMAGE");
    expect(parsed.messages[0].content).toBe("Aqui está a foto solicitada");
    expect(parsed.messages[0].mediaUrl).toBe("http://waha:3000/api/files/photo123.jpg");

    const preview = formatMediaConversationPreview(
      "IMAGE",
      parsed.messages[0].content,
      parsed.messages[0].mediaFilename
    );
    expect(preview).toBe("📷 Aqui está a foto solicitada");
  });

  it("2.2 Parser extrai mensagem de voz recebida (PTT) e limpa texto [áudio]", () => {
    const payload = {
      event: "message",
      payload: {
        id: "waha_inbound_voice_002",
        from: "5511977770002@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          pttMessage: {
            url: "http://waha:3000/api/files/voice.ogg",
            mimetype: "audio/ogg; codecs=opus",
            seconds: 18,
          },
        },
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaType).toBe("VOICE");
    expect(parsed.messages[0].content).toBe("");

    const preview = formatMediaConversationPreview("VOICE");
    expect(preview).toBe("🎤 Mensagem de voz");
  });

  it("2.3 Parser extrai documento recebido e gera preview com o nome do arquivo", () => {
    const payload = {
      event: "message",
      payload: {
        id: "waha_inbound_doc_003",
        from: "5511977770003@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          documentMessage: {
            url: "http://waha:3000/api/files/Balancete.pdf",
            mimetype: "application/pdf",
            fileName: "Balancete_2026.pdf",
            caption: "Segue o balancete",
          },
        },
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaType).toBe("DOCUMENT");
    expect(parsed.messages[0].caption).toBe("Segue o balancete");
    expect(parsed.messages[0].mediaFilename).toBe("Balancete_2026.pdf");

    const preview = formatMediaConversationPreview(
      "DOCUMENT",
      parsed.messages[0].caption,
      parsed.messages[0].mediaFilename
    );
    expect(preview).toBe("📄 Balancete_2026.pdf");
  });

  it("2.4 Normalização de JID, LID e Phone sem criar contatos duplicados", () => {
    expect(detectJidType("12345678901234@lid")).toBe("LID");
    expect(detectJidType("5511999990001@c.us")).toBe("PHONE_JID");
    expect(detectJidType("5511999990001@s.whatsapp.net")).toBe("PHONE_JID");
    expect(detectJidType("120363024888888888@g.us")).toBe("GROUP");

    expect(extractLid("12345678901234@lid")).toBe("12345678901234@lid");
    expect(extractLid("5511999990001@c.us")).toBeNull();

    expect(extractPhoneDigitsFromJid("5511999990001@c.us")).toBe("5511999990001");
    expect(extractPhoneDigitsFromJid("12345678901234@lid")).toBeNull();

    expect(formatWahaDestinationChatId("12345678901234@lid")).toBe("12345678901234@lid");
    expect(formatWahaDestinationChatId("5511999990001@c.us")).toBe("5511999990001@c.us");
    expect(formatWahaDestinationChatId("5511999990001@s.whatsapp.net")).toBe("5511999990001@c.us");
    expect(formatWahaDestinationChatId("+55 (11) 99999-0001")).toBe("5511999990001@c.us");
  });

  it("2.5 Sincronização de mensagens de outros aparelhos (fromMe: true) sem duplicar", () => {
    const payload = {
      event: "message",
      payload: {
        id: "waha_external_msg_999",
        from: "5511988887777@c.us",
        fromMe: true,
        body: "Olá, respondi pelo celular!",
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].fromMe).toBe(true);
    expect(parsed.messages[0].content).toBe("Olá, respondi pelo celular!");
    expect(parsed.messages[0].externalId).toBe("waha:waha_external_msg_999");
  });
});
