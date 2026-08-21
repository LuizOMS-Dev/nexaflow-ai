import { describe, expect, it } from "vitest";
import { getConversationPreview } from "./conversation-preview";

describe("getConversationPreview", () => {
  it("não expõe placeholders técnicos de mídia", () => {
    expect(getConversationPreview("[imagem]")).toEqual({ kind: "image", label: "Foto" });
    expect(getConversationPreview("[áudio]")).toEqual({ kind: "audio", label: "Áudio" });
    expect(getConversationPreview("[vídeo]")).toEqual({ kind: "video", label: "Vídeo" });
    expect(getConversationPreview("[documento]")).toEqual({
      kind: "document",
      label: "Documento",
    });
    expect(getConversationPreview("[mídia]")).toEqual({ kind: "file", label: "Arquivo" });
  });

  it("preserva captions e nomes úteis nos formatos atuais e legados", () => {
    expect(getConversationPreview("📷 Comprovante aprovado").label).toBe(
      "Foto · Comprovante aprovado"
    );
    expect(getConversationPreview("[imagem] Comprovante aprovado").label).toBe(
      "Foto · Comprovante aprovado"
    );
    expect(getConversationPreview("🎥 Demonstração").label).toBe("Vídeo · Demonstração");
    expect(getConversationPreview("📄 Contrato.pdf").label).toBe("Documento · Contrato.pdf");
    expect(getConversationPreview("[documento: Contrato.pdf] Assinado").label).toBe(
      "Documento · Assinado"
    );
  });

  it("remove rótulos redundantes e mantém mensagens de texto intactas", () => {
    expect(getConversationPreview("🎤 Mensagem de voz").label).toBe("Áudio");
    expect(getConversationPreview("🎵 Áudio").label).toBe("Áudio");
    expect(getConversationPreview("📷 Foto").label).toBe("Foto");
    expect(getConversationPreview("Olá, tudo bem?")).toEqual({
      kind: "text",
      label: "Olá, tudo bem?",
    });
  });
});
