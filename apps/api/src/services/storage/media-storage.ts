import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";

export type MediaKind = "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT" | "FILE";

export type StoredMediaFile = {
  url: string;
  storageKey: string;
  absPath: string;
  filename: string;
  originalName: string;
  mimetype: string;
  sizeBytes: number;
  kind: MediaKind;
};

const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_DOC_SIZE = 30 * 1024 * 1024;   // 30 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILE_SIZE = 30 * 1024 * 1024;  // 30 MB

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".phtml", ".phar",
  ".js", ".mjs", ".cjs", ".ts", ".py", ".pyc", ".vbs", ".msi", ".dll",
  ".com", ".scr", ".jar", ".ps1", ".vbe", ".jse", ".wsf", ".wsh"
]);

const MIME_MAP: Record<string, { ext: string; kind: MediaKind; maxSize: number }> = {
  // Imagens
  "image/jpeg": { ext: "jpg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/jpg": { ext: "jpg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/png": { ext: "png", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/webp": { ext: "webp", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/gif": { ext: "gif", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/svg+xml": { ext: "svg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/heic": { ext: "heic", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/heif": { ext: "heif", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/bmp": { ext: "bmp", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  "image/x-ms-bmp": { ext: "bmp", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE },
  // Áudios e Voz
  "audio/ogg": { ext: "ogg", kind: "VOICE", maxSize: MAX_AUDIO_SIZE },
  "application/ogg": { ext: "ogg", kind: "VOICE", maxSize: MAX_AUDIO_SIZE },
  "audio/opus": { ext: "opus", kind: "VOICE", maxSize: MAX_AUDIO_SIZE },
  "audio/mpeg": { ext: "mp3", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/mp3": { ext: "mp3", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/mp4": { ext: "m4a", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/m4a": { ext: "m4a", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/x-m4a": { ext: "m4a", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/wav": { ext: "wav", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/x-wav": { ext: "wav", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/wave": { ext: "wav", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/webm": { ext: "webm", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/aac": { ext: "aac", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/x-aac": { ext: "aac", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  "audio/amr": { ext: "amr", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE },
  // Vídeos
  "video/mp4": { ext: "mp4", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/webm": { ext: "webm", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/quicktime": { ext: "mov", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/3gpp": { ext: "3gp", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/3gpp2": { ext: "3g2", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/x-matroska": { ext: "mkv", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/avi": { ext: "avi", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  "video/x-msvideo": { ext: "avi", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE },
  // Documentos
  "application/pdf": { ext: "pdf", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/msword": { ext: "doc", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    kind: "DOCUMENT",
    maxSize: MAX_DOC_SIZE,
  },
  "application/vnd.ms-excel": { ext: "xls", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    kind: "DOCUMENT",
    maxSize: MAX_DOC_SIZE,
  },
  "application/vnd.ms-powerpoint": { ext: "ppt", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: "pptx",
    kind: "DOCUMENT",
    maxSize: MAX_DOC_SIZE,
  },
  "text/plain": { ext: "txt", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "text/csv": { ext: "csv", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/rtf": { ext: "rtf", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  "application/json": { ext: "json", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE },
  // Arquivos compactados
  "application/zip": { ext: "zip", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/x-zip-compressed": { ext: "zip", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/x-rar-compressed": { ext: "rar", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/vnd.rar": { ext: "rar", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/x-7z-compressed": { ext: "7z", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/x-tar": { ext: "tar", kind: "FILE", maxSize: MAX_FILE_SIZE },
  "application/gzip": { ext: "gz", kind: "FILE", maxSize: MAX_FILE_SIZE },
};

export function sanitizeFilename(original: string): string {
  const base = path.basename(original || "arquivo");
  const ext = path.extname(base).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new AppError(`Tipo de arquivo não permitido por segurança (${ext})`, 400, "FORBIDDEN_FILE_TYPE");
  }
  const nameWithoutExt = path.basename(base, ext);
  const cleanName = nameWithoutExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  const cleanExt = ext
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.]/g, "");

  const clean = cleanName ? `${cleanName}${cleanExt}` : `arquivo${cleanExt}`;
  return clean || "arquivo_anexo";
}

export function classifyFile(mimetype: string, filename: string): { mime: string; ext: string; kind: MediaKind; maxSize: number } {
  const normMime = (mimetype || "").split(";")[0].trim().toLowerCase();
  const ext = path.extname(filename || "").toLowerCase().replace(/^\./, "");

  if (MIME_MAP[normMime]) {
    return { mime: normMime, ...MIME_MAP[normMime] };
  }

  // Fallback por extensão
  if (ext === "pdf") return { mime: "application/pdf", ext: "pdf", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "ogg") return { mime: "audio/ogg", ext: "ogg", kind: "VOICE", maxSize: MAX_AUDIO_SIZE };
  if (ext === "opus") return { mime: "audio/opus", ext: "opus", kind: "VOICE", maxSize: MAX_AUDIO_SIZE };
  if (ext === "mp3") return { mime: "audio/mpeg", ext: "mp3", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE };
  if (ext === "m4a") return { mime: "audio/mp4", ext: "m4a", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE };
  if (ext === "wav") return { mime: "audio/wav", ext: "wav", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE };
  if (ext === "aac") return { mime: "audio/aac", ext: "aac", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE };
  if (ext === "jpg" || ext === "jpeg") return { mime: "image/jpeg", ext: "jpg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (ext === "png") return { mime: "image/png", ext: "png", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (ext === "webp") return { mime: "image/webp", ext: "webp", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (ext === "gif") return { mime: "image/gif", ext: "gif", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (ext === "svg") return { mime: "image/svg+xml", ext: "svg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (ext === "mp4") return { mime: "video/mp4", ext: "mp4", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE };
  if (ext === "webm") return { mime: "video/webm", ext: "webm", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE };
  if (ext === "mov") return { mime: "video/quicktime", ext: "mov", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE };
  if (ext === "3gp") return { mime: "video/3gpp", ext: "3gp", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE };
  if (ext === "doc") return { mime: "application/msword", ext: "doc", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "docx") return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "xls") return { mime: "application/vnd.ms-excel", ext: "xls", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "xlsx") return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "ppt") return { mime: "application/vnd.ms-powerpoint", ext: "ppt", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "pptx") return { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "txt") return { mime: "text/plain", ext: "txt", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "csv") return { mime: "text/csv", ext: "csv", kind: "DOCUMENT", maxSize: MAX_DOC_SIZE };
  if (ext === "zip") return { mime: "application/zip", ext: "zip", kind: "FILE", maxSize: MAX_FILE_SIZE };
  if (ext === "rar") return { mime: "application/x-rar-compressed", ext: "rar", kind: "FILE", maxSize: MAX_FILE_SIZE };
  if (ext === "7z") return { mime: "application/x-7z-compressed", ext: "7z", kind: "FILE", maxSize: MAX_FILE_SIZE };

  // Genérico permitido
  if (normMime.startsWith("image/")) return { mime: normMime, ext: ext || "jpg", kind: "IMAGE", maxSize: MAX_IMAGE_SIZE };
  if (normMime.startsWith("audio/")) return { mime: normMime, ext: ext || "ogg", kind: "AUDIO", maxSize: MAX_AUDIO_SIZE };
  if (normMime.startsWith("video/")) return { mime: normMime, ext: ext || "mp4", kind: "VIDEO", maxSize: MAX_VIDEO_SIZE };

  return {
    mime: normMime || "application/octet-stream",
    ext: ext || "bin",
    kind: "FILE",
    maxSize: MAX_FILE_SIZE,
  };
}

export function getTenantMediaDir(tenantId: string): string {
  const root = path.resolve(env.storagePath, "media", tenantId);
  return root;
}

export function getTenantWaDir(tenantId: string): string {
  const root = path.resolve(env.storagePath, "wa", tenantId);
  return root;
}

export function getMediaFileUrl(tenantId: string, filename: string): string {
  return `/api/media/files/${tenantId}/${filename}`;
}

export async function saveMediaBuffer(opts: {
  tenantId: string;
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  isVoice?: boolean;
}): Promise<StoredMediaFile> {
  const sanitized = sanitizeFilename(opts.originalName);
  const ext = path.extname(sanitized).toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new AppError(`Extensão de arquivo não permitida (${ext})`, 400, "FORBIDDEN_EXTENSION");
  }

  const classification = classifyFile(opts.mimetype, sanitized);
  const kind = opts.isVoice ? "VOICE" : classification.kind;

  if (opts.buffer.length > classification.maxSize) {
    const mb = Math.round(classification.maxSize / (1024 * 1024));
    throw new AppError(`Arquivo excede o limite máximo permitido de ${mb}MB para este formato`, 413, "FILE_TOO_LARGE");
  }

  const hash = createHash("sha256").update(opts.buffer).digest("hex").slice(0, 12);
  const rand = randomBytes(4).toString("hex");
  const storedFilename = `${rand}-${hash}-${sanitized}`;

  const dir = getTenantMediaDir(opts.tenantId);
  await mkdir(dir, { recursive: true });

  const absPath = path.join(dir, storedFilename);
  await writeFile(absPath, opts.buffer);

  const url = getMediaFileUrl(opts.tenantId, storedFilename);
  const storageKey = `media/${opts.tenantId}/${storedFilename}`;

  return {
    url,
    storageKey,
    absPath,
    filename: storedFilename,
    originalName: sanitized,
    mimetype: classification.mime,
    sizeBytes: opts.buffer.length,
    kind,
  };
}

export async function resolveMediaFilePath(tenantId: string, filename: string): Promise<{ absPath: string; exists: boolean }> {
  // Prevenir path traversal e caracteres de caminho
  const base = path.basename(filename);
  if (base !== filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return { absPath: "", exists: false };
  }

  // 1. Procura na pasta media/
  const mediaRoot = getTenantMediaDir(tenantId);
  const absPathMedia = path.join(mediaRoot, base);

  if (absPathMedia.startsWith(mediaRoot + path.sep)) {
    try {
      const s = await stat(absPathMedia);
      if (s.isFile()) return { absPath: absPathMedia, exists: true };
    } catch {
      /* tenta fallback wa */
    }
  }

  // 2. Procura na pasta wa/ (mídias recebidas do WhatsApp/WAHA)
  const waRoot = getTenantWaDir(tenantId);
  const absPathWa = path.join(waRoot, base);

  if (absPathWa.startsWith(waRoot + path.sep)) {
    try {
      const s = await stat(absPathWa);
      if (s.isFile()) return { absPath: absPathWa, exists: true };
    } catch {
      /* não encontrado */
    }
  }

  return { absPath: "", exists: false };
}

export async function deleteMediaFile(tenantId: string, filename: string): Promise<void> {
  try {
    const { absPath, exists } = await resolveMediaFilePath(tenantId, filename);
    if (exists) {
      await unlink(absPath);
    }
  } catch {
    /* ignore */
  }
}
