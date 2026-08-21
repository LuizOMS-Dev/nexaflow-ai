import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  formatMediaConversationPreview,
  normalizeUnifiedMediaError,
  UNIFIED_MEDIA_LIMITS,
} from "./unified-media-pipeline";
import {
  classifyFile,
  sanitizeFilename,
  saveMediaBuffer,
  resolveMediaFilePath,
} from "../storage/media-storage";
import { parseWahaWebhook } from "./webhook-parse";
import { WahaConnector } from "./waha";

describe("Unified Media Pipeline (Inbound & Outbound)", () => {
  const tenantA = "tenant_company_alpha";
  const tenantB = "tenant_company_beta";

  it("1. Formata preview textual canônico para cada tipo de mídia", () => {
    expect(formatMediaConversationPreview("IMAGE", "Comprovante")).toBe("📷 Comprovante");
    expect(formatMediaConversationPreview("IMAGE")).toBe("📷 Foto");
    expect(formatMediaConversationPreview("VOICE")).toBe("🎤 Mensagem de voz");
    expect(formatMediaConversationPreview("AUDIO", "Música")).toBe("🎵 Música");
    expect(formatMediaConversationPreview("AUDIO")).toBe("🎵 Áudio");
    expect(formatMediaConversationPreview("VIDEO", "Demo")).toBe("🎥 Demo");
    expect(formatMediaConversationPreview("VIDEO")).toBe("🎥 Vídeo");
    expect(formatMediaConversationPreview("DOCUMENT", "", "Contrato.pdf")).toBe("📄 Contrato.pdf");
    expect(formatMediaConversationPreview("FILE", "", "arquivo.zip")).toBe("📄 arquivo.zip");
  });

  it("2. Normaliza códigos de erro e detecta se o erro é recuperável para retry", () => {
    const errTimeout = normalizeUnifiedMediaError(new Error("ETIMEDOUT: Connection timed out"));
    expect(errTimeout.code).toBe("TIMEOUT");
    expect(errTimeout.isRetryable).toBe(true);

    const err503 = normalizeUnifiedMediaError(new Error("503 Service Unavailable"));
    expect(err503.code).toBe("WAHA_MEDIA_SEND_FAILED");
    expect(err503.isRetryable).toBe(true);

    const errSession = normalizeUnifiedMediaError(new Error("Session stopped"));
    expect(errSession.code).toBe("SESSION_NOT_READY");
    expect(errSession.isRetryable).toBe(false);

    const errSize = normalizeUnifiedMediaError(new Error("File size limit exceeded: 413"));
    expect(errSize.code).toBe("MEDIA_TOO_LARGE");
    expect(errSize.isRetryable).toBe(false);

    const errType = normalizeUnifiedMediaError(new Error("Mimetype forbidden"));
    expect(errType.code).toBe("MEDIA_INVALID_TYPE");
    expect(errType.isRetryable).toBe(false);

    const errRecipient = normalizeUnifiedMediaError(new Error("Destination 404 not found"));
    expect(errRecipient.code).toBe("INVALID_RECIPIENT");
    expect(errRecipient.isRetryable).toBe(false);
  });

  it("3. Limites de tamanho canônicos por tipo de mídia", () => {
    expect(UNIFIED_MEDIA_LIMITS.IMAGE).toBe(20 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.VOICE).toBe(25 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.AUDIO).toBe(30 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.VIDEO).toBe(64 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.DOCUMENT).toBe(100 * 1024 * 1024);
    expect(UNIFIED_MEDIA_LIMITS.FILE).toBe(100 * 1024 * 1024);
  });

  it("4. Sanitização preservando extensões e limpando caracteres especiais e acentos", () => {
    expect(sanitizeFilename("Comprovante de Pagamento (PIX) - 2026.pdf")).toBe(
      "Comprovante_de_Pagamento_PIX_-_2026.pdf"
    );
    expect(sanitizeFilename("Planilha de Vendas & Metas #1.xlsx")).toBe(
      "Planilha_de_Vendas_Metas_1.xlsx"
    );

    // Truncamento mantém extensão intacta
    const veryLongName = "relatorio_".repeat(30) + ".docx";
    const sanitized = sanitizeFilename(veryLongName);
    expect(sanitized.endsWith(".docx")).toBe(true);
    expect(sanitized.length).toBeLessThanOrEqual(255);
  });

  it("5. Bloqueia extensões executáveis e perigosas", () => {
    expect(() => sanitizeFilename("trojan.exe")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("script.bat")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("payload.sh")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("exploit.php")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("macro.vbs")).toThrow(/não permitido/i);
  });

  it("6. WahaConnector formata Data URI e endpoints adequados para cada mídia", async () => {
    const connector = new WahaConnector();
    const calls: Array<{ url: string; body: any }> = [];

    const fetchSpy = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return {
        ok: true,
        json: async () => ({ id: "msg_outbound_waha_999" }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const config = {
      provider: "waha" as const,
      baseUrl: "http://waha:3000",
      session: "default",
    };

    // Imagem
    await connector.sendMedia(config, "5511999990001", {
      kind: "IMAGE",
      mimetype: "image/jpeg",
      filename: "foto.jpg",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAA",
      caption: "Foto do contrato",
    });
    expect(calls[0].url).toBe("http://waha:3000/api/sendImage");
    expect(calls[0].body.chatId).toBe("5511999990001@c.us");
    expect(calls[0].body.file.data).toMatch(/^data:image\/jpeg;base64,/);

    // Voz PTT
    await connector.sendMedia(config, "5511999990002", {
      kind: "VOICE",
      mimetype: "audio/ogg; codecs=opus",
      filename: "audio.ogg",
      dataBase64: "T2dnUwACAAAAAAAAAAA=",
    });
    expect(calls[1].url).toBe("http://waha:3000/api/sendVoice");
    expect(calls[1].body.convert).toBe(true);

    // Documento
    await connector.sendMedia(config, "5511999990003", {
      kind: "DOCUMENT",
      mimetype: "application/pdf",
      filename: "Manual.pdf",
      dataBase64: "JVBERi0xLjQK",
    });
    expect(calls[2].url).toBe("http://waha:3000/api/sendFile");

    vi.unstubAllGlobals();
  });

  it("7. Webhook parser extrai mídias inbound preservando legendas sem poluir com tags", () => {
    const inboundImg = {
      event: "message",
      payload: {
        id: "msg_inbound_001",
        from: "5511988881111@c.us",
        fromMe: false,
        hasMedia: true,
        body: "Veja o produto em anexo",
        media: {
          url: "http://waha:3000/api/files/photo.jpg",
          mimetype: "image/jpeg",
          filename: "produto.jpg",
        },
      },
    };

    const parsed = parseWahaWebhook(inboundImg);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].mediaType).toBe("IMAGE");
    expect(parsed.messages[0].content).toBe("Veja o produto em anexo");
    expect(parsed.messages[0].mediaUrl).toBe("http://waha:3000/api/files/photo.jpg");

    // Áudio sem legenda fica com content vazio (sem [áudio])
    const inboundAudio = {
      event: "message",
      payload: {
        id: "msg_inbound_002",
        from: "5511988882222@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          pttMessage: {
            url: "http://waha:3000/api/files/voice.ogg",
            mimetype: "audio/ogg; codecs=opus",
            seconds: 12,
          },
        },
      },
    };

    const parsedAudio = parseWahaWebhook(inboundAudio);
    expect(parsedAudio.messages).toHaveLength(1);
    expect(parsedAudio.messages[0].mediaType).toBe("VOICE");
    expect(parsedAudio.messages[0].content).toBe("");
  });
});
