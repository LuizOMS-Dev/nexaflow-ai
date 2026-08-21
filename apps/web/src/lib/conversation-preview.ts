export type ConversationPreviewKind =
  | "empty"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "file"
  | "sticker";

export type ConversationPreview = {
  kind: ConversationPreviewKind;
  label: string;
};

const LEADING_SEPARATOR = /^[\s:·—-]+/;

function cleanDetail(value?: string, genericLabels: string[] = []): string {
  const detail = (value || "").replace(LEADING_SEPARATOR, "").trim();
  if (!detail) return "";

  const normalized = detail.toLocaleLowerCase("pt-BR");
  return genericLabels.includes(normalized) ? "" : detail;
}

function mediaPreview(
  kind: Exclude<ConversationPreviewKind, "empty" | "text">,
  baseLabel: string,
  detail?: string,
  genericLabels?: string[]
): ConversationPreview {
  const clean = cleanDetail(detail, genericLabels);
  return { kind, label: clean ? `${baseLabel} · ${clean}` : baseLabel };
}

/** Converte previews legados/externos em texto de interface, sem expor marcadores técnicos. */
export function getConversationPreview(rawPreview?: string | null): ConversationPreview {
  const value = rawPreview?.trim();
  if (!value) return { kind: "empty", label: "Sem mensagens" };

  let match = value.match(/^\[(?:imagem|foto)(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) {
    return mediaPreview("image", "Foto", match[2] || match[1], ["foto", "imagem"]);
  }
  match = value.match(/^📷\s*(.*)$/u);
  if (match) return mediaPreview("image", "Foto", match[1], ["foto", "imagem"]);

  match = value.match(/^\[(?:áudio|audio|mensagem de voz)(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) {
    return mediaPreview("audio", "Áudio", match[2] || match[1], [
      "áudio",
      "audio",
      "mensagem de voz",
    ]);
  }
  match = value.match(/^[🎤🎵]\s*(.*)$/u);
  if (match) {
    return mediaPreview("audio", "Áudio", match[1], ["áudio", "audio", "mensagem de voz"]);
  }

  match = value.match(/^\[v[íi]deo(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) {
    return mediaPreview("video", "Vídeo", match[2] || match[1], ["vídeo", "video"]);
  }
  match = value.match(/^🎥\s*(.*)$/u);
  if (match) return mediaPreview("video", "Vídeo", match[1], ["vídeo", "video"]);

  match = value.match(/^\[documento(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) {
    return mediaPreview("document", "Documento", match[2] || match[1], ["documento"]);
  }
  match = value.match(/^📄\s*(.*)$/u);
  if (match) return mediaPreview("document", "Documento", match[1], ["documento"]);

  match = value.match(/^\[(?:arquivo|m[íi]dia|midia)(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) {
    return mediaPreview("file", "Arquivo", match[2] || match[1], ["arquivo", "mídia", "midia"]);
  }
  match = value.match(/^📎\s*(.*)$/u);
  if (match) return mediaPreview("file", "Arquivo", match[1], ["arquivo"]);

  match = value.match(/^\[(?:sticker|figurinha)(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (match) return mediaPreview("sticker", "Figurinha", match[2] || match[1], ["figurinha"]);

  return { kind: "text", label: value };
}
