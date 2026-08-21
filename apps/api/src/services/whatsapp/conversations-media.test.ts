import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  classifyFile,
  sanitizeFilename,
  saveMediaBuffer,
  resolveMediaFilePath,
  getMediaFileUrl,
} from "../storage/media-storage";
import {
  downloadWahaMedia,
  mediaPublicUrl,
  parseMediaPublicUrl,
  resolveAllowedWahaMediaUrl,
} from "./waha-media";
import { parseWahaWebhook } from "./webhook-parse";
import { WahaConnector } from "./waha";

describe("Conversas Media - Pipeline Completo Inbound & Outbound", () => {
  const tenantA = "tenant_company_alpha";
  const tenantB = "tenant_company_beta";

  it("1. Classifica múltiplos MIME types e extensões corretamente", () => {
    // Imagens
    expect(classifyFile("image/jpeg", "comprovante.jpg").kind).toBe("IMAGE");
    expect(classifyFile("image/png", "foto.png").kind).toBe("IMAGE");
    expect(classifyFile("image/webp", "banner.webp").kind).toBe("IMAGE");
    // Áudio e Voz
    expect(classifyFile("audio/ogg", "voz.ogg").kind).toBe("VOICE");
    expect(classifyFile("audio/opus", "audio.opus").kind).toBe("VOICE");
    expect(classifyFile("audio/mpeg", "musica.mp3").kind).toBe("AUDIO");
    expect(classifyFile("audio/mp4", "gravacao.m4a").kind).toBe("AUDIO");
    expect(classifyFile("audio/wav", "som.wav").kind).toBe("AUDIO");
    // Vídeos
    expect(classifyFile("video/mp4", "apresentacao.mp4").kind).toBe("VIDEO");
    expect(classifyFile("video/webm", "video.webm").kind).toBe("VIDEO");
    // Documentos & Planilhas
    expect(classifyFile("application/pdf", "proposta.pdf").kind).toBe("DOCUMENT");
    expect(classifyFile("application/msword", "contrato.doc").kind).toBe("DOCUMENT");
    expect(classifyFile("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "relatorio.docx").kind).toBe("DOCUMENT");
    expect(classifyFile("application/vnd.ms-excel", "tabela.xls").kind).toBe("DOCUMENT");
    expect(classifyFile("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "dados.xlsx").kind).toBe("DOCUMENT");
    expect(classifyFile("text/csv", "contatos.csv").kind).toBe("DOCUMENT");
    // Arquivos compactados
    expect(classifyFile("application/zip", "anexos.zip").kind).toBe("FILE");
    expect(classifyFile("application/x-rar-compressed", "pacote.rar").kind).toBe("FILE");
    expect(classifyFile("application/x-7z-compressed", "backup.7z").kind).toBe("FILE");
  });

  it("2. Salva e recupera arquivos no storage isolado por tenant", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 teste de proposta comercial");
    const stored = await saveMediaBuffer({
      tenantId: tenantA,
      buffer: pdfBuffer,
      originalName: "proposta_cliente_2026.pdf",
      mimetype: "application/pdf",
    });

    expect(stored.url).toBe(`/api/media/files/${tenantA}/${stored.filename}`);
    expect(stored.kind).toBe("DOCUMENT");
    expect(stored.sizeBytes).toBe(pdfBuffer.length);

    // Tenant A consegue localizar o arquivo
    const resolvedA = await resolveMediaFilePath(tenantA, stored.filename);
    expect(resolvedA.exists).toBe(true);
    expect(resolvedA.absPath).toContain(stored.filename);

    // Tenant B NÃO consegue acessar o arquivo de Tenant A
    const resolvedB = await resolveMediaFilePath(tenantB, stored.filename);
    expect(resolvedB.exists).toBe(false);

    // Tentativa de path traversal é bloqueada
    const traversal = await resolveMediaFilePath(tenantA, `../${tenantA}/${stored.filename}`);
    expect(traversal.exists).toBe(false);
  });

  it("3. Sanitiza nomes de arquivos com acentos, espaços e caracteres especiais", () => {
    expect(sanitizeFilename("Relatório de Vendas (Março 2026).pdf")).toBe("Relatorio_de_Vendas_Marco_2026_.pdf");
    expect(sanitizeFilename("planilha de custos & orçamentos final.xlsx")).toBe("planilha_de_custos_orcamentos_final.xlsx");
    expect(sanitizeFilename("audio gravacao #1.ogg")).toBe("audio_gravacao_1.ogg");
  });

  it("4. Bloqueia extensões perigosas e executáveis", () => {
    expect(() => sanitizeFilename("virus.exe")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("script.bat")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("payload.sh")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("shell.php")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("trojan.dll")).toThrow(/não permitido/i);
    expect(() => sanitizeFilename("macro.vbs")).toThrow(/não permitido/i);
  });

  it("5. Parser WAHA extrai mídias com legenda para múltiplos formatos", () => {
    // 5.1 Imagem com legenda
    const imgWebhook = {
      event: "message",
      payload: {
        id: "msg_img_001",
        from: "5511999991111@c.us",
        fromMe: false,
        hasMedia: true,
        body: "Veja a foto do produto",
        media: {
          url: "http://waha:3000/api/files/photo_001.jpg",
          mimetype: "image/jpeg",
          filename: "produto.jpg",
        },
      },
    };

    const parsedImg = parseWahaWebhook(imgWebhook);
    expect(parsedImg.messages).toHaveLength(1);
    expect(parsedImg.messages[0].mediaUrl).toBe("http://waha:3000/api/files/photo_001.jpg");
    expect(parsedImg.messages[0].mediaMime).toBe("image/jpeg");
    expect(parsedImg.messages[0].mediaType).toBe("IMAGE");
    expect(parsedImg.messages[0].content).toBe("Veja a foto do produto");

    // 5.2 Áudio de voz (PTT)
    const audioWebhook = {
      event: "message",
      payload: {
        id: "msg_aud_002",
        from: "5511999992222@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          pttMessage: {
            url: "http://waha:3000/api/files/voice_002.ogg",
            mimetype: "audio/ogg; codecs=opus",
            seconds: 14,
          },
        },
      },
    };

    const parsedAudio = parseWahaWebhook(audioWebhook);
    expect(parsedAudio.messages).toHaveLength(1);
    expect(parsedAudio.messages[0].mediaUrl).toBe("http://waha:3000/api/files/voice_002.ogg");
    expect(parsedAudio.messages[0].mediaType).toBe("VOICE");
    // Não força "[áudio]" quando é mídia sem legenda
    expect(parsedAudio.messages[0].content).toBe("");

    // 5.3 Documento PDF com legenda
    const docWebhook = {
      event: "message",
      payload: {
        id: "msg_doc_003",
        from: "5511999993333@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          documentWithCaptionMessage: {
            message: {
              documentMessage: {
                url: "http://waha:3000/api/files/doc_003.pdf",
                mimetype: "application/pdf",
                fileName: "Contrato_Assinado.pdf",
                caption: "Segue contrato assinado",
              },
            },
          },
        },
      },
    };

    const parsedDoc = parseWahaWebhook(docWebhook);
    expect(parsedDoc.messages).toHaveLength(1);
    expect(parsedDoc.messages[0].mediaFilename).toBe("Contrato_Assinado.pdf");
    expect(parsedDoc.messages[0].mediaMime).toBe("application/pdf");
    expect(parsedDoc.messages[0].mediaType).toBe("DOCUMENT");
    expect(parsedDoc.messages[0].content).toBe("Segue contrato assinado");

    // 5.4 Vídeo MP4
    const vidWebhook = {
      event: "message",
      payload: {
        id: "msg_vid_004",
        from: "5511999994444@c.us",
        fromMe: false,
        hasMedia: true,
        message: {
          videoMessage: {
            url: "http://waha:3000/api/files/video_004.mp4",
            mimetype: "video/mp4",
            caption: "Demonstração em vídeo",
          },
        },
      },
    };

    const parsedVid = parseWahaWebhook(vidWebhook);
    expect(parsedVid.messages).toHaveLength(1);
    expect(parsedVid.messages[0].mediaType).toBe("VIDEO");
    expect(parsedVid.messages[0].content).toBe("Demonstração em vídeo");
  });

  it("6. Download de mídia WAHA trata base64 e URLs remotas de forma segura", async () => {
    // 6.1 Base64 direto
    const sampleData = Buffer.from("Conteúdo simulado de imagem PNG").toString("base64");
    const stored = await downloadWahaMedia({
      tenantId: tenantA,
      dataBase64: `data:image/png;base64,${sampleData}`,
      mime: "image/png",
      filename: "screenshot.png",
    });

    expect(stored).not.toBeNull();
    expect(stored!.kind).toBe("IMAGE");
    expect(stored!.mime).toBe("image/png");
    expect(stored!.publicUrl).toBe(`/api/media/files/${tenantA}/${stored!.filename}`);

    const fileCheck = await resolveMediaFilePath(tenantA, stored!.filename);
    expect(fileCheck.exists).toBe(true);
  });

  it("7. Parser de URL e SSRF protection", () => {
    expect(resolveAllowedWahaMediaUrl("/api/files/test.png")).toContain("/api/files/test.png");
    expect(resolveAllowedWahaMediaUrl("http://waha:3000/api/files/test.png")).toBe("http://waha:3000/api/files/test.png");
    expect(resolveAllowedWahaMediaUrl("http://localhost:3000/api/files/test.png")).toBe("http://localhost:3000/api/files/test.png");

    // Bloqueia tentativas de SSRF para IPs de metadados de nuvem e hosts externos
    expect(resolveAllowedWahaMediaUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(resolveAllowedWahaMediaUrl("https://attacker.site/malware")).toBeNull();
    expect(resolveAllowedWahaMediaUrl("file:///etc/shadow")).toBeNull();
  });

  it("8. WahaConnector despacha mídias para os endpoints corretos", async () => {
    const connector = new WahaConnector();
    const calls: Array<{ url: string; body: string }> = [];

    const fetchSpy = vi.fn().mockImplementation(async (url: string, opts: any) => {
      calls.push({ url, body: opts.body });
      return {
        ok: true,
        json: async () => ({ id: "wa_msg_outbound_123" }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const config = {
      provider: "waha" as const,
      baseUrl: "http://waha:3000",
      session: "main_session",
    };

    // Envio de imagem
    const resImg = await connector.sendMedia(config, "5511988887777", {
      kind: "IMAGE",
      mimetype: "image/png",
      filename: "grafico.png",
      dataBase64: "c2FtcGxl",
      caption: "Gráfico de desempenho",
    });
    expect(resImg.ok).toBe(true);
    expect(calls[0].url).toBe("http://waha:3000/api/sendImage");
    expect(calls[0].body).toContain('"caption":"Gráfico de desempenho"');

    // Envio de voz
    const resVoice = await connector.sendMedia(config, "5511988887777", {
      kind: "VOICE",
      mimetype: "audio/ogg; codecs=opus",
      filename: "audio.ogg",
      dataBase64: "YXVkaW8=",
    });
    expect(resVoice.ok).toBe(true);
    expect(calls[1].url).toBe("http://waha:3000/api/sendVoice");

    // Envio de arquivo/documento
    const resFile = await connector.sendMedia(config, "5511988887777", {
      kind: "DOCUMENT",
      mimetype: "application/pdf",
      filename: "tabela.pdf",
      dataBase64: "cGRm",
      caption: "Tabela de Preços",
    });
    expect(resFile.ok).toBe(true);
    expect(calls[2].url).toBe("http://waha:3000/api/sendFile");

    vi.unstubAllGlobals();
  });
});
