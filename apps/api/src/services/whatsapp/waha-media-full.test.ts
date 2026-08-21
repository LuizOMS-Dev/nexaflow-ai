import { describe, expect, it, vi } from "vitest";
import {
  classifyFile,
  sanitizeFilename,
  saveMediaBuffer,
  resolveMediaFilePath,
} from "../storage/media-storage";
import { WahaConnector } from "./waha";
import { parseWahaWebhook } from "./webhook-parse";
import { SAFE_TOOLS } from "../agent-tools";

describe("Media Storage Service", () => {
  it("classifica tipos de arquivo corretamente", () => {
    expect(classifyFile("image/png", "foto.png").kind).toBe("IMAGE");
    expect(classifyFile("application/pdf", "manual.pdf").kind).toBe("DOCUMENT");
    expect(classifyFile("audio/ogg", "voz.ogg").kind).toBe("VOICE");
    expect(classifyFile("audio/mpeg", "musica.mp3").kind).toBe("AUDIO");
    expect(classifyFile("video/mp4", "apresentacao.mp4").kind).toBe("VIDEO");
    expect(classifyFile("application/zip", "dados.zip").kind).toBe("FILE");
  });

  it("sanitiza nomes de arquivo e bloqueia extensões perigosas", () => {
    expect(sanitizeFilename("relatório final (1).pdf")).toBe("relatorio_final_1_.pdf");
    expect(() => sanitizeFilename("malware.exe")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("script.sh")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("backdoor.php")).toThrow(/não permitido/i);
  });

  it("salva buffer com isolamento e hash seguro", async () => {
    const buf = Buffer.from("Conteudo de teste em PDF");
    const stored = await saveMediaBuffer({
      tenantId: "tenant_test_123",
      buffer: buf,
      originalName: "catalogo.pdf",
      mimetype: "application/pdf",
    });

    expect(stored.url).toContain("/api/media/files/tenant_test_123/");
    expect(stored.kind).toBe("DOCUMENT");
    expect(stored.sizeBytes).toBe(buf.length);

    const resolved = await resolveMediaFilePath("tenant_test_123", stored.filename);
    expect(resolved.exists).toBe(true);

    // Tenant 2 não acessa o arquivo do Tenant 1
    const crossTenant = await resolveMediaFilePath("tenant_test_999", stored.filename);
    expect(crossTenant.exists).toBe(false);

    // Path traversal é bloqueado
    const pathTraversal = await resolveMediaFilePath("tenant_test_123", "../tenant_test_123/" + stored.filename);
    expect(pathTraversal.exists).toBe(false);
  });
});

describe("WAHA Connector Media Dispatch", () => {
  it("formata endpoint correto para cada tipo de mídia", async () => {
    const connector = new WahaConnector();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg_wa_123" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const config = {
      provider: "waha" as const,
      baseUrl: "http://waha:3000",
      session: "default",
    };

    // 1. Imagem -> /api/sendImage
    await connector.sendMedia(config, "5511999998888", {
      kind: "IMAGE",
      mimetype: "image/jpeg",
      filename: "foto.jpg",
      dataBase64: "aW1hZ2VkYXRh",
      caption: "Minha foto",
    });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "http://waha:3000/api/sendImage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"chatId":"5511999998888@c.us"'),
      })
    );

    // 2. Voz -> /api/sendVoice
    await connector.sendMedia(config, "5511999998888", {
      kind: "VOICE",
      mimetype: "audio/ogg; codecs=opus",
      filename: "audio.ogg",
      dataBase64: "YXVkaW9kYXRh",
    });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "http://waha:3000/api/sendVoice",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"chatId":"5511999998888@c.us"'),
      })
    );

    // 3. Documento / Arquivo -> /api/sendFile
    await connector.sendMedia(config, "5511999998888", {
      kind: "DOCUMENT",
      mimetype: "application/pdf",
      filename: "proposta.pdf",
      dataBase64: "cGRmZGF0YQ==",
      caption: "Proposta Comercial",
    });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "http://waha:3000/api/sendFile",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"filename":"proposta.pdf"'),
      })
    );

    // 4. Vídeo -> /api/sendVideo
    await connector.sendMedia(config, "5511999998888", {
      kind: "VIDEO",
      mimetype: "video/mp4",
      filename: "demo.mp4",
      dataBase64: "dmlkZW9kYXRh",
    });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "http://waha:3000/api/sendVideo",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"chatId":"5511999998888@c.us"'),
      })
    );

    vi.unstubAllGlobals();
  });
});

describe("Webhook Timestamp & External Sync Parsing", () => {
  it("extrai providerTimestamp corretamente de payload com timestamp em segundos", () => {
    const payload = {
      event: "message",
      payload: {
        id: "msg_ext_999",
        fromMe: true,
        to: "5511999991111@c.us",
        body: "Olá enviado do celular",
        timestamp: 1724218800, // 2024-08-21T05:40:00.000Z
      },
    };

    const parsed = parseWahaWebhook(payload);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].fromMe).toBe(true);
    expect(parsed.messages[0].content).toBe("Olá enviado do celular");
    expect(parsed.messages[0].providerTimestamp).toBeInstanceOf(Date);
    expect(parsed.messages[0].providerTimestamp?.getTime()).toBe(1724218800000);
  });
});

describe("AI Media Library & Tools", () => {
  it("registra send_media_asset em SAFE_TOOLS", () => {
    expect(SAFE_TOOLS).toContain("send_media_asset");
  });

  it("extrai tags de envio de mídia do output da IA", () => {
    const rawReply = "Aqui está o catálogo solicitado! [ACTION:SEND_MEDIA:asset_catalogo_2026:Segue em anexo o PDF completo]";
    const match = rawReply.match(/\[ACTION:SEND_MEDIA:([a-zA-Z0-9_-]+)(?::([^\]]*))?\]/i);

    expect(match).toBeTruthy();
    expect(match![1]).toBe("asset_catalogo_2026");
    expect(match![2]).toBe("Segue em anexo o PDF completo");

    const cleanReply = rawReply.replace(match![0], "").trim();
    expect(cleanReply).toBe("Aqui está o catálogo solicitado!");
  });
});
