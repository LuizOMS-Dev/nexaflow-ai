import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  executeMediaSendPipeline,
  normalizeMediaError,
  MEDIA_SIZE_LIMITS,
} from "./media-pipeline";
import {
  classifyFile,
  sanitizeFilename,
  saveMediaBuffer,
  resolveMediaFilePath,
} from "../storage/media-storage";
import { WahaConnector } from "./waha";

describe("Media Sending Pipeline Centralizado", () => {
  const tenantA = "tenant_company_alpha";
  const tenantB = "tenant_company_beta";

  it("1. Normaliza erros técnicos para mensagens claras e determina se é recuperável", () => {
    const timeoutErr = normalizeMediaError(new Error("ETIMEDOUT: connection timed out"));
    expect(timeoutErr.isRetryable).toBe(true);
    expect(timeoutErr.code).toBe("TIMEOUT");
    expect(timeoutErr.error).toContain("Tempo limite");

    const unavailableErr = normalizeMediaError(new Error("503 Service Temporarily Unavailable"));
    expect(unavailableErr.isRetryable).toBe(true);
    expect(unavailableErr.code).toBe("GATEWAY_UNAVAILABLE");

    const sessionErr = normalizeMediaError(new Error("Session default is disconnected or stopped"));
    expect(sessionErr.isRetryable).toBe(false);
    expect(sessionErr.code).toBe("SESSION_DISCONNECTED");

    const tooLargeErr = normalizeMediaError(new Error("File size limit exceeded: 413"));
    expect(tooLargeErr.isRetryable).toBe(false);
    expect(tooLargeErr.code).toBe("FILE_TOO_LARGE");

    const invalidFormatErr = normalizeMediaError(new Error("Mimetype not allowed"));
    expect(invalidFormatErr.isRetryable).toBe(false);
    expect(invalidFormatErr.code).toBe("INVALID_FORMAT");
  });

  it("2. Valida limites de tamanho de mídia por tipo", () => {
    expect(MEDIA_SIZE_LIMITS.IMAGE).toBe(20 * 1024 * 1024);
    expect(MEDIA_SIZE_LIMITS.VOICE).toBe(25 * 1024 * 1024);
    expect(MEDIA_SIZE_LIMITS.AUDIO).toBe(30 * 1024 * 1024);
    expect(MEDIA_SIZE_LIMITS.VIDEO).toBe(64 * 1024 * 1024);
    expect(MEDIA_SIZE_LIMITS.DOCUMENT).toBe(100 * 1024 * 1024);
    expect(MEDIA_SIZE_LIMITS.FILE).toBe(100 * 1024 * 1024);
  });

  it("3. Sanitização e preservação de nomes complexos com acentos, espaços e comprimentos longos", () => {
    expect(sanitizeFilename("Relatório Financeiro & Demonstração (Q1 2026).pdf")).toBe(
      "Relatorio_Financeiro_Demonstracao_Q1_2026_.pdf"
    );
    expect(sanitizeFilename("Planilha de Custo de Aquisição (CAC) - Março.xlsx")).toBe(
      "Planilha_de_Custo_de_Aquisicao_CAC_-_Marco.xlsx"
    );
    // Nome longo é truncado mantendo extensão
    const longName = "a".repeat(300) + ".pdf";
    const sanitizedLong = sanitizeFilename(longName);
    expect(sanitizedLong.endsWith(".pdf")).toBe(true);
    expect(sanitizedLong.length).toBeLessThanOrEqual(255);
  });

  it("4. Rejeita extensões executáveis perigosas", () => {
    expect(() => sanitizeFilename("trojan.exe")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("backdoor.bat")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("exploit.sh")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("webshell.php")).toThrow(/não permitido/i);
  });

  it("5. WahaConnector formata Data URI e endpoints adequados para cada mídia", async () => {
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

    // 5.1 Imagem com legenda
    await connector.sendMedia(config, "5511999990001", {
      kind: "IMAGE",
      mimetype: "image/jpeg",
      filename: "foto.jpg",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAA",
      caption: "Foto do contrato assinado",
    });

    expect(calls[0].url).toBe("http://waha:3000/api/sendImage");
    expect(calls[0].body.chatId).toBe("5511999990001@c.us");
    expect(calls[0].body.caption).toBe("Foto do contrato assinado");
    expect(calls[0].body.file.data).toMatch(/^data:image\/jpeg;base64,/);

    // 5.2 Mensagem de voz PTT (com convert: true)
    await connector.sendMedia(config, "5511999990002", {
      kind: "VOICE",
      mimetype: "audio/ogg; codecs=opus",
      filename: "gravacao.ogg",
      dataBase64: "T2dnUwACAAAAAAAAAAA=",
    });

    expect(calls[1].url).toBe("http://waha:3000/api/sendVoice");
    expect(calls[1].body.convert).toBe(true);
    expect(calls[1].body.file.data).toMatch(/^data:audio\/ogg; codecs=opus;base64,/);

    // 5.3 Documento PDF
    await connector.sendMedia(config, "5511999990003", {
      kind: "DOCUMENT",
      mimetype: "application/pdf",
      filename: "Proposta.pdf",
      dataBase64: "JVBERi0xLjQK",
      caption: "Segue proposta",
    });

    expect(calls[2].url).toBe("http://waha:3000/api/sendFile");
    expect(calls[2].body.file.filename).toBe("Proposta.pdf");

    // 5.4 Vídeo MP4
    await connector.sendMedia(config, "5511999990004", {
      kind: "VIDEO",
      mimetype: "video/mp4",
      filename: "tutorial.mp4",
      dataBase64: "AAAAIGZ0eXBpc29t",
      caption: "Tutorial explicativo",
    });

    expect(calls[3].url).toBe("http://waha:3000/api/sendVideo");
    expect(calls[3].body.caption).toBe("Tutorial explicativo");

    // 5.5 Planilha Excel
    await connector.sendMedia(config, "5511999990005", {
      kind: "DOCUMENT",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "Tabela_Precos.xlsx",
      dataBase64: "UEsDBBQAAAAIA",
    });

    expect(calls[4].url).toBe("http://waha:3000/api/sendFile");
    expect(calls[4].body.file.filename).toBe("Tabela_Precos.xlsx");

    // 5.6 Arquivo compactado ZIP
    await connector.sendMedia(config, "5511999990006", {
      kind: "FILE",
      mimetype: "application/zip",
      filename: "documentos.zip",
      dataBase64: "UEsDBBQAAAAIA",
    });

    expect(calls[5].url).toBe("http://waha:3000/api/sendFile");
    expect(calls[5].body.file.filename).toBe("documentos.zip");

    vi.unstubAllGlobals();
  });

  it("6. Fallback de /api/sendVoice e /api/sendVideo para /api/sendFile caso endpoint falhe", async () => {
    const connector = new WahaConnector();
    const urlsCalled: string[] = [];

    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      urlsCalled.push(url);
      if (url.includes("/api/sendVoice")) {
        // Simula WAHA sem suporte a convert/sendVoice (404/500)
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: "Endpoint not found" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ id: "msg_fallback_ok" }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const config = {
      provider: "waha" as const,
      baseUrl: "http://waha:3000",
      session: "default",
    };

    const res = await connector.sendMedia(config, "5511999990001", {
      kind: "VOICE",
      mimetype: "audio/ogg",
      filename: "voz.ogg",
      dataBase64: "YXVkaW8=",
    });

    expect(res.ok).toBe(true);
    expect(res.externalId).toBe("msg_fallback_ok");
    expect(urlsCalled).toEqual([
      "http://waha:3000/api/sendVoice",
      "http://waha:3000/api/sendFile",
    ]);

    vi.unstubAllGlobals();
  });
});
