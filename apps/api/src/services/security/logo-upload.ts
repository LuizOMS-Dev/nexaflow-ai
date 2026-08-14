import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../../lib/errors";

/** Logos: apenas formatos estáticos (sem GIF animado) */
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** ~1.5 MB em bytes do binário */
const MAX_BYTES = 1_500_000;
/** Limite de pixels (ex.: 4096x4096) */
const MAX_PIXELS = 16_777_216;

/**
 * Valida logo de tenant: data URL com magic-bytes reais (não confiar no prefixo declarado).
 * Rejeita SVG e tipos não listados. URLs http(s) externas não são aceitas como upload.
 */
export async function sanitizeLogoInput(
  input: string | null | undefined
): Promise<string | null | undefined> {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;

  const value = String(input).trim();

  // Bloqueia URL remota arbitrária (SSRF / conteúdo não validado)
  if (/^https?:\/\//i.test(value)) {
    throw new AppError(
      "Envie o logo como arquivo (data URL). URLs externas não são aceitas.",
      400,
      "LOGO_URL_FORBIDDEN"
    );
  }

  if (!value.startsWith("data:")) {
    throw new AppError("Formato de logo inválido.", 400, "LOGO_INVALID");
  }

  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(value);
  if (!match) {
    throw new AppError("Data URL de logo inválida.", 400, "LOGO_INVALID");
  }

  const declaredMime = (match[1] || "").toLowerCase().trim();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  if (!isBase64) {
    throw new AppError("Logo deve ser enviada em base64.", 400, "LOGO_INVALID");
  }

  if (declaredMime.includes("svg") || declaredMime === "image/svg+xml") {
    throw new AppError("SVG não é permitido por segurança.", 400, "LOGO_MIME_DENIED");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, "base64");
  } catch {
    throw new AppError("Logo corrompida (base64 inválido).", 400, "LOGO_INVALID");
  }

  if (!buffer.length) {
    throw new AppError("Logo vazia.", 400, "LOGO_INVALID");
  }

  if (buffer.length > MAX_BYTES) {
    throw new AppError("Logo excede o tamanho máximo (1,5 MB).", 400, "LOGO_TOO_LARGE");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    throw new AppError(
      "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.",
      400,
      "LOGO_MIME_DENIED"
    );
  }

  // Heurística de dimensões via IHDR/SOF (defesa básica sem dependência pesada)
  const pixels = estimatePixels(buffer, detected.mime);
  if (pixels != null && pixels > MAX_PIXELS) {
    throw new AppError("Dimensões da imagem excedem o limite permitido.", 400, "LOGO_DIMENSIONS");
  }

  // Se o cliente mentiu o MIME declarado, sobrescreve com o real
  const safeB64 = buffer.toString("base64");
  return `data:${detected.mime};base64,${safeB64}`;
}

function estimatePixels(buf: Buffer, mime: string): number | null {
  try {
    if (mime === "image/png" && buf.length >= 24) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      return w * h;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const h = buf.readUInt16BE(i + 5);
          const w = buf.readUInt16BE(i + 7);
          return w * h;
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}
