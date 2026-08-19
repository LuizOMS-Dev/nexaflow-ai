/**
 * Mídia WAHA — download inbound + envio outbound.
 * Arquivos ficam em storage local isolado por tenant.
 * Docs: https://waha.devlike.pro/docs/how-to/send-messages/
 */
import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { WahaClient } from "./waha-client";

const MAX_BYTES = 16 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; kind: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" }> = {
  "image/jpeg": { ext: "jpg", kind: "IMAGE" },
  "image/jpg": { ext: "jpg", kind: "IMAGE" },
  "image/png": { ext: "png", kind: "IMAGE" },
  "image/webp": { ext: "webp", kind: "IMAGE" },
  "image/gif": { ext: "gif", kind: "IMAGE" },
  "audio/ogg": { ext: "ogg", kind: "AUDIO" },
  "audio/opus": { ext: "opus", kind: "AUDIO" },
  "audio/mpeg": { ext: "mp3", kind: "AUDIO" },
  "audio/mp4": { ext: "m4a", kind: "AUDIO" },
  "audio/aac": { ext: "aac", kind: "AUDIO" },
  "audio/webm": { ext: "webm", kind: "AUDIO" },
  "video/mp4": { ext: "mp4", kind: "VIDEO" },
  "application/pdf": { ext: "pdf", kind: "DOCUMENT" },
  "application/msword": { ext: "doc", kind: "DOCUMENT" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    kind: "DOCUMENT",
  },
};

export type StoredMedia = {
  publicUrl: string;
  absPath: string;
  mime: string;
  kind: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT";
  bytes: number;
  filename: string;
};

function classifyMime(raw?: string | null): { mime: string; ext: string; kind: StoredMedia["kind"] } | null {
  if (!raw) return null;
  const mime = raw.split(";")[0].trim().toLowerCase();
  const hit = ALLOWED[mime];
  if (hit) return { mime, ext: hit.ext, kind: hit.kind };
  if (mime.startsWith("image/")) return { mime, ext: "bin", kind: "IMAGE" };
  if (mime.startsWith("audio/")) return { mime, ext: "bin", kind: "AUDIO" };
  if (mime.startsWith("video/")) return { mime, ext: "bin", kind: "VIDEO" };
  if (mime.startsWith("application/") || mime === "text/plain") {
    return { mime, ext: "bin", kind: "DOCUMENT" };
  }
  return null;
}

function tenantDir(tenantId: string) {
  return path.resolve(env.storagePath, "wa", tenantId);
}

export function mediaPublicUrl(tenantId: string, filename: string) {
  return `/media/wa/${tenantId}/${filename}`;
}

export function parseMediaPublicUrl(url: string): { tenantId: string; filename: string } | null {
  const m = url.match(/^\/media\/wa\/([a-z0-9]+)\/([a-zA-Z0-9._-]+)$/);
  if (!m) return null;
  return { tenantId: m[1], filename: m[2] };
}

export function mediaAbsolutePath(tenantId: string, filename: string) {
  const root = tenantDir(tenantId);
  const abs = path.resolve(root, filename);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new AppError("Caminho de mídia inválido", 400);
  }
  return abs;
}

async function persistBuffer(
  tenantId: string,
  buf: Buffer,
  mimeHint?: string | null,
  filenameHint?: string | null
): Promise<StoredMedia> {
  if (buf.length > MAX_BYTES) {
    throw new AppError("Arquivo excede o limite de 16 MB", 413, "MEDIA_TOO_LARGE");
  }
  const classified = classifyMime(mimeHint) || {
    mime: mimeHint || "application/octet-stream",
    ext: "bin",
    kind: "DOCUMENT" as const,
  };
  const safeHint = (filenameHint || "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 40);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const filename = `${randomBytes(6).toString("hex")}-${hash}${safeHint ? `-${safeHint}` : ""}.${classified.ext}`;
  const dir = tenantDir(tenantId);
  await mkdir(dir, { recursive: true });
  const absPath = path.join(dir, filename);
  await writeFile(absPath, buf);
  return {
    publicUrl: mediaPublicUrl(tenantId, filename),
    absPath,
    mime: classified.mime,
    kind: classified.kind,
    bytes: buf.length,
    filename,
  };
}

/** Só baixa de URLs do gateway WAHA (bloqueia SSRF). */
export function resolveAllowedWahaMediaUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  const base = (env.waGatewayUrl || "http://waha:3000").replace(/\/+$/, "");
  let target: URL;
  try {
    target = trimmed.startsWith("/")
      ? new URL(base + trimmed)
      : new URL(trimmed);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  let allowedHost = "waha";
  try {
    allowedHost = new URL(base).hostname;
  } catch {
    /* default waha */
  }
  const host = target.hostname.toLowerCase();
  const ok =
    host === allowedHost.toLowerCase() ||
    host === "waha" ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (!ok) return null;
  return target.toString();
}

/** Baixa mídia do WAHA (URL autenticada ou data URL) para storage do tenant. */
export async function downloadWahaMedia(opts: {
  tenantId: string;
  url?: string | null;
  dataBase64?: string | null;
  mime?: string | null;
  filename?: string | null;
  client?: WahaClient;
}): Promise<StoredMedia | null> {
  if (opts.dataBase64) {
    const buf = Buffer.from(opts.dataBase64, "base64");
    if (!buf.length) return null;
    return persistBuffer(opts.tenantId, buf, opts.mime, opts.filename);
  }
  if (!opts.url) return null;

  const safeUrl = resolveAllowedWahaMediaUrl(opts.url);
  if (!safeUrl) return null;

  const headers: Record<string, string> = {};
  const key = (env.waGatewayApiKey || "").trim();
  if (key && !/^sha512:/i.test(key)) headers["X-Api-Key"] = key;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(safeUrl, { headers, signal: ctrl.signal, redirect: "error" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || opts.mime || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return persistBuffer(opts.tenantId, buf, ct, opts.filename);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function storeOutboundBase64(opts: {
  tenantId: string;
  dataBase64: string;
  mime: string;
  filename?: string;
}): Promise<StoredMedia> {
  const classified = classifyMime(opts.mime);
  if (!classified) {
    throw new AppError("Tipo de arquivo não suportado", 400, "MEDIA_TYPE");
  }
  const buf = Buffer.from(opts.dataBase64, "base64");
  return persistBuffer(opts.tenantId, buf, classified.mime, opts.filename);
}

export async function sendWahaMedia(opts: {
  client: WahaClient;
  session: string;
  chatId: string;
  kind: StoredMedia["kind"];
  stored: StoredMedia;
  caption?: string;
}): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const { readFile } = await import("fs/promises");
  const data = (await readFile(opts.stored.absPath)).toString("base64");
  const file = {
    mimetype: opts.stored.mime,
    filename: opts.stored.filename,
    data,
  };
  try {
    let raw: unknown;
    if (opts.kind === "IMAGE") {
      raw = await opts.client.sendImage(opts.session, opts.chatId, file, opts.caption);
    } else if (opts.kind === "AUDIO") {
      raw = await opts.client.sendVoice(opts.session, opts.chatId, {
        mimetype: opts.stored.mime,
        data,
      });
    } else {
      raw = await opts.client.sendFile(opts.session, opts.chatId, {
        mimetype: opts.stored.mime,
        filename: opts.stored.filename,
        data,
      }, opts.caption);
    }
    const id =
      (raw as { id?: string })?.id ||
      (raw as { key?: { id?: string } })?.key?.id;
    return { ok: true, externalId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return {
      ok: false,
      error: /ECONNREFUSED|fetch failed|aborted/i.test(msg)
        ? "Serviço de WhatsApp temporariamente indisponível."
        : "Não foi possível enviar a mídia pelo WhatsApp.",
    };
  }
}

export async function removeStoredMedia(tenantId: string, filename: string) {
  try {
    await unlink(mediaAbsolutePath(tenantId, filename));
  } catch {
    /* ignore */
  }
}
