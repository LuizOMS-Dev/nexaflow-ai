import { createHash, randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_EDGE = 4096;
const MIN_EDGE = 32;
const TARGET_EDGE = 512;

/** Presets oficiais Nexa Avatars — cliente só pode enviar estes IDs */
export const NEXA_AVATAR_PRESETS = [
  { id: "nexa-dog-01", label: "Cachorro", category: "animal" },
  { id: "nexa-cat-01", label: "Gato", category: "animal" },
  { id: "nexa-fox-01", label: "Raposa", category: "animal" },
  { id: "nexa-lion-01", label: "Leão", category: "animal" },
  { id: "nexa-robot-01", label: "Robô", category: "tech" },
  { id: "nexa-tech-01", label: "Tecnologia", category: "tech" },
  { id: "nexa-music-01", label: "Música", category: "lifestyle" },
  { id: "nexa-game-01", label: "Gamer", category: "lifestyle" },
  { id: "nexa-football-01", label: "Futebol", category: "lifestyle" },
  { id: "nexa-space-01", label: "Explorador", category: "abstract" },
  { id: "nexa-abstract-01", label: "Abstrato", category: "abstract" },
  { id: "nexa-core-01", label: "Símbolo Nexa", category: "brand" },
] as const;

export type NexaPresetId = (typeof NEXA_AVATAR_PRESETS)[number]["id"];

const PRESET_IDS = new Set<string>(NEXA_AVATAR_PRESETS.map((p) => p.id));

export const AVATAR_COLORS = [
  { id: "violet", hex: "#6366F1", label: "Violeta" },
  { id: "indigo", hex: "#4F46E5", label: "Índigo" },
  { id: "blue", hex: "#3B82F6", label: "Azul" },
  { id: "purple", hex: "#8B5CF6", label: "Roxo" },
  { id: "slate", hex: "#64748B", label: "Ardósia" },
] as const;

const COLOR_IDS = new Set(AVATAR_COLORS.map((c) => c.id));
const COLOR_HEX = new Set(AVATAR_COLORS.map((c) => c.hex.toLowerCase()));

export function isValidPresetId(id: string): id is NexaPresetId {
  return PRESET_IDS.has(id);
}

export function isValidAvatarColor(color: string): boolean {
  const c = color.trim().toLowerCase();
  return COLOR_IDS.has(c as (typeof AVATAR_COLORS)[number]["id"]) || COLOR_HEX.has(c);
}

export function normalizeAvatarColor(color?: string | null): string {
  if (!color) return AVATAR_COLORS[0].hex;
  const c = color.trim();
  const byId = AVATAR_COLORS.find((x) => x.id === c.toLowerCase());
  if (byId) return byId.hex;
  if (COLOR_HEX.has(c.toLowerCase())) return c.startsWith("#") ? c : `#${c}`;
  return AVATAR_COLORS[0].hex;
}

function avatarsDir() {
  return path.resolve(env.storagePath, "avatars");
}

export function publicAvatarPath(filename: string): string {
  return `/media/avatars/${filename}`;
}

export function absoluteAvatarFile(publicUrl: string | null | undefined): string | null {
  if (!publicUrl || !publicUrl.startsWith("/media/avatars/")) return null;
  const name = publicUrl.slice("/media/avatars/".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  return path.join(avatarsDir(), name);
}

function estimateDimensions(buf: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime === "image/png" && buf.length >= 24) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    if (mime === "image/webp" && buf.length >= 30) {
      // VP8X
      if (buf.toString("ascii", 12, 16) === "VP8X") {
        const w = 1 + buf.readUIntLE(24, 3);
        const h = 1 + buf.readUIntLE(27, 3);
        return { w, h };
      }
      // VP8 lossy
      if (buf.toString("ascii", 12, 16) === "VP8 " && buf.length >= 30) {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        return { w, h };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Valida data URL de avatar: MIME real, magic bytes, tamanho, dimensões.
 * Bloqueia SVG e tipos não listados.
 */
export async function parseAndValidateAvatarDataUrl(input: string): Promise<{
  buffer: Buffer;
  mime: string;
  ext: string;
}> {
  const value = String(input || "").trim();
  if (/^https?:\/\//i.test(value)) {
    throw new AppError("URLs externas não são aceitas no upload.", 400, "AVATAR_URL_FORBIDDEN");
  }
  if (!value.startsWith("data:")) {
    throw new AppError("Envie a foto como data URL.", 400, "AVATAR_INVALID");
  }

  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(value);
  if (!match) throw new AppError("Data URL inválida.", 400, "AVATAR_INVALID");

  const declaredMime = (match[1] || "").toLowerCase().trim();
  if (!match[2]) throw new AppError("A foto deve ser enviada em base64.", 400, "AVATAR_INVALID");
  if (declaredMime.includes("svg") || declaredMime === "image/svg+xml") {
    throw new AppError("SVG não é permitido por segurança.", 400, "AVATAR_MIME_DENIED");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[3] || "", "base64");
  } catch {
    throw new AppError("Arquivo corrompido.", 400, "AVATAR_INVALID");
  }

  if (!buffer.length) throw new AppError("Arquivo vazio.", 400, "AVATAR_INVALID");
  if (buffer.length > MAX_BYTES) {
    throw new AppError("A foto excede o limite de 5 MB.", 400, "AVATAR_TOO_LARGE");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    throw new AppError(
      "Tipo não permitido. Use JPEG, PNG ou WebP.",
      400,
      "AVATAR_MIME_DENIED"
    );
  }

  const dims = estimateDimensions(buffer, detected.mime);
  if (dims) {
    if (dims.w < MIN_EDGE || dims.h < MIN_EDGE) {
      throw new AppError("Imagem muito pequena.", 400, "AVATAR_DIMENSIONS");
    }
    if (dims.w > MAX_EDGE || dims.h > MAX_EDGE) {
      throw new AppError(
        `Dimensões máximas: ${MAX_EDGE}×${MAX_EDGE}px.`,
        400,
        "AVATAR_DIMENSIONS"
      );
    }
  }

  const ext =
    detected.mime === "image/png" ? "png" : detected.mime === "image/webp" ? "webp" : "jpg";

  return { buffer, mime: detected.mime, ext };
}

export async function saveAvatarFile(
  userId: string,
  buffer: Buffer,
  ext: string
): Promise<string> {
  const dir = avatarsDir();
  await mkdir(dir, { recursive: true });
  const hash = createHash("sha256").update(userId).update(randomBytes(16)).digest("hex").slice(0, 24);
  const filename = `${hash}.${ext}`;
  const full = path.join(dir, filename);
  // path traversal guard
  if (!full.startsWith(dir)) {
    throw new AppError("Caminho inválido.", 400, "AVATAR_PATH");
  }
  await writeFile(full, buffer);
  return publicAvatarPath(filename);
}

export async function deleteAvatarFile(publicUrl: string | null | undefined): Promise<void> {
  const full = absoluteAvatarFile(publicUrl);
  if (!full) return;
  try {
    await unlink(full);
  } catch {
    /* already gone */
  }
}

export function presetPublicUrl(presetId: string): string {
  return `/nexa-avatars/${presetId}.svg`;
}

export { TARGET_EDGE, MAX_BYTES };
