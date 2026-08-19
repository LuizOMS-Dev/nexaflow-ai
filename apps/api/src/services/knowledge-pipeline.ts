/**
 * Pipeline de ingestão: VALIDATE → EXTRACT → NORMALIZE → CHUNK → INDEX → READY.
 * Processamento pesado fora do request (setImmediate, padrão já usado no projeto).
 */
import { createHash } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { AppError } from "../lib/errors";
import { asInputJson } from "../lib/json";
import { chunkKnowledgeContent } from "./knowledge-chunking";
import { extractPdfText } from "./pdf-extract";

export const MAX_KNOWLEDGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const STUCK_MS = 15 * 60 * 1000;

const ALLOWED = new Map<string, { ext: string[]; sourceType: "document" | "import" | "manual" }>([
  ["application/pdf", { ext: [".pdf"], sourceType: "document" }],
  ["text/plain", { ext: [".txt"], sourceType: "import" }],
  ["text/markdown", { ext: [".md", ".markdown"], sourceType: "import" }],
]);

export function safeKnowledgeFilename(raw: string): string {
  const base = path.basename(String(raw || "documento")).replace(/[\0\r\n]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s()áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/g, "_").slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return "documento";
  if (cleaned.includes("..")) return "documento";
  return cleaned;
}

export function hashContent(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function extOf(filename: string): string {
  const e = path.extname(filename || "").toLowerCase();
  return e;
}

export async function validateKnowledgeUpload(params: {
  filename: string;
  buffer: Buffer;
  declaredMime?: string | null;
}): Promise<{
  mimeType: string;
  filename: string;
  sourceType: "document" | "import" | "manual";
  hash: string;
}> {
  const filename = safeKnowledgeFilename(params.filename);
  if (!params.buffer?.length) {
    throw new AppError("Arquivo vazio.", 400, "EMPTY_FILE");
  }
  if (params.buffer.length > MAX_KNOWLEDGE_UPLOAD_BYTES) {
    throw new AppError("Arquivo acima de 10 MB.", 400, "FILE_TOO_LARGE");
  }

  const detected = await fileTypeFromBuffer(params.buffer);
  const ext = extOf(filename);
  let mime = detected?.mime || params.declaredMime || "";

  if (ext === ".pdf" && params.buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    mime = "application/pdf";
  }
  if ((ext === ".txt" || ext === ".md" || ext === ".markdown") && !detected) {
    mime = ext === ".txt" ? "text/plain" : "text/markdown";
  }

  const allow = ALLOWED.get(mime);
  if (!allow || (allow.ext.length && !allow.ext.includes(ext) && ext !== "")) {
    throw new AppError(
      "Formato não suportado. Envie PDF, TXT ou Markdown.",
      400,
      "UNSUPPORTED_FORMAT"
    );
  }
  return { mimeType: mime, filename, sourceType: allow.sourceType, hash: hashContent(params.buffer) };
}

export async function findActiveDuplicate(tenantId: string, contentHash: string, exceptId?: string) {
  return prisma.knowledgeDoc.findFirst({
    where: {
      tenantId,
      contentHash,
      status: { in: ["queued", "processing", "ready", "published", "draft"] },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, title: true, status: true },
  });
}

async function persistFile(tenantId: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = path.resolve(env.storagePath, "knowledge", tenantId);
  await mkdir(dir, { recursive: true });
  const stamp = Date.now().toString(36);
  const dest = path.join(dir, `${stamp}-${filename}`);
  const resolved = path.resolve(dest);
  if (!resolved.startsWith(path.resolve(dir))) {
    throw new AppError("Caminho de armazenamento inválido.", 400, "BAD_STORAGE_PATH");
  }
  await writeFile(resolved, buffer);
  return path.posix.join("knowledge", tenantId, path.basename(resolved));
}

export async function extractKnowledgeText(params: {
  mimeType: string;
  buffer: Buffer;
}): Promise<string> {
  if (params.mimeType === "application/pdf") {
    return extractPdfText(params.buffer);
  }
  const text = params.buffer.toString("utf8").replace(/\u0000/g, "").trim();
  if (text.length < 8) {
    throw new AppError("O arquivo não possui texto utilizável.", 400, "NO_TEXT");
  }
  return text;
}

export async function indexKnowledgeDocument(docId: string, content: string) {
  const chunks = chunkKnowledgeContent(content);
  await prisma.knowledgeChunk.deleteMany({ where: { docId } });
  if (!chunks.length) return 0;
  await prisma.knowledgeChunk.createMany({
    data: chunks.map((c) => ({
      docId,
      content: c.content,
      chunkIndex: c.chunkIndex,
      tokenCount: c.tokenCount,
      metadata: asInputJson(c.metadata),
    })),
  });
  await embedKnowledgeChunks(docId).catch(() => null);
  return chunks.length;
}

/** Embeddings em background do pipeline; falha não derruba o documento lexical. */
export async function embedKnowledgeChunks(docId: string): Promise<boolean> {
  const { embedTexts, resolveEmbeddingRuntime } = await import("./ai-core/embeddings");
  const runtime = resolveEmbeddingRuntime();
  if (!runtime.available) {
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { embeddingProvider: null, embeddingModel: null, embeddingVersion: null, embeddingDimension: null },
    });
    return false;
  }
  const rows = await prisma.knowledgeChunk.findMany({
    where: { docId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true, content: true },
  });
  if (!rows.length) return false;
  const batch = await embedTexts(rows.map((r) => r.content));
  if (!batch) return false;
  for (let i = 0; i < rows.length; i++) {
    const vec = batch.vectors[i];
    if (!vec) continue;
    await prisma.knowledgeChunk.update({
      where: { id: rows[i].id },
      data: {
        embedding: vec,
        embeddingModel: batch.model,
        embeddingVersion: batch.version,
        embeddingDimension: batch.dimension,
      },
    });
  }
  await prisma.knowledgeDoc.update({
    where: { id: docId },
    data: {
      embeddingProvider: batch.provider,
      embeddingModel: batch.model,
      embeddingVersion: batch.version,
      embeddingDimension: batch.dimension,
    },
  });
  return true;
}

export async function processKnowledgeDocument(docId: string, buffer?: Buffer): Promise<void> {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) return;

  await prisma.knowledgeDoc.update({
    where: { id: docId },
    data: { status: "processing", errorMessage: null, processedAt: new Date() },
  });

  try {
    let text = (doc.content || "").trim();
    if (buffer?.length) {
      text = await extractKnowledgeText({
        mimeType: doc.mimeType || "text/plain",
        buffer,
      });
    }
    if (!text || text.length < 8) {
      throw new AppError("Não foi possível extrair texto deste documento.", 400, "NO_TEXT");
    }
    const chunkCount = await indexKnowledgeDocument(docId, text);
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: {
        content: text,
        status: "ready",
        errorMessage: null,
        processedAt: new Date(),
        version: { increment: 0 },
      },
    });
    void chunkCount;
  } catch (err) {
    const message =
      err instanceof AppError ? err.message : "A indexação falhou. Tente reprocessar.";
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: {
        status: "failed",
        errorMessage: message.slice(0, 400),
        processedAt: new Date(),
      },
    });
  }
}

export function enqueueKnowledgeProcess(docId: string, buffer?: Buffer) {
  setImmediate(() => {
    void processKnowledgeDocument(docId, buffer);
  });
}

export async function failStuckKnowledgeJobs(tenantId?: string) {
  const cutoff = new Date(Date.now() - STUCK_MS);
  await prisma.knowledgeDoc.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: "processing",
      processedAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      errorMessage: "A indexação falhou. Tente reprocessar.",
    },
  });
}

export async function createKnowledgeFromUpload(params: {
  tenantId: string;
  userId?: string;
  filename: string;
  buffer: Buffer;
  declaredMime?: string | null;
  title?: string;
  category?: string;
  scope?: "all" | "agents";
  agentIds?: string[];
  replaceId?: string | null;
  force?: boolean;
}): Promise<{ id: string; status: string; duplicateOf?: { id: string; title: string } }> {
  const v = await validateKnowledgeUpload({
    filename: params.filename,
    buffer: params.buffer,
    declaredMime: params.declaredMime,
  });

  if (!params.force && !params.replaceId) {
    const dup = await findActiveDuplicate(params.tenantId, v.hash);
    if (dup) {
      throw new AppError("Este documento já foi adicionado à base de conhecimento.", 409, "KNOWLEDGE_DUPLICATE", {
        existingId: dup.id,
        existingTitle: dup.title,
      });
    }
  }

  let text = "";
  try {
    text = await extractKnowledgeText({ mimeType: v.mimeType, buffer: params.buffer });
  } catch (err) {
    throw err;
  }

  const storagePath = await persistFile(params.tenantId, v.filename, params.buffer);
  const title =
    (params.title || "").trim() ||
    v.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 120) ||
    "Documento";

  if (params.replaceId) {
    const existing = await prisma.knowledgeDoc.findFirst({
      where: { id: params.replaceId, tenantId: params.tenantId },
    });
    if (!existing) throw new AppError("Documento para substituir não encontrado.", 404, "NOT_FOUND");
    await prisma.knowledgeChunk.deleteMany({ where: { docId: existing.id } });
    const updated = await prisma.knowledgeDoc.update({
      where: { id: existing.id },
      data: {
        title,
        content: text,
        category: params.category?.trim() || existing.category || "Geral",
        sourceType: v.sourceType,
        sourceUrl: v.filename,
        status: "queued",
        contentHash: v.hash,
        mimeType: v.mimeType,
        byteSize: params.buffer.length,
        fileName: v.filename,
        storagePath,
        errorMessage: null,
        version: existing.version + 1,
      },
    });
    enqueueKnowledgeProcess(updated.id);
    return { id: updated.id, status: updated.status };
  }

  const doc = await prisma.knowledgeDoc.create({
    data: {
      tenantId: params.tenantId,
      title,
      content: text,
      category: params.category?.trim() || "Geral",
      sourceType: v.sourceType,
      sourceUrl: v.filename,
      status: "queued",
      scope: params.scope || "all",
      contentHash: v.hash,
      mimeType: v.mimeType,
      byteSize: params.buffer.length,
      fileName: v.filename,
      storagePath,
    },
  });

  if (params.scope === "agents" && params.agentIds?.length) {
    const { setKnowledgeAgentLinks } = await import("./knowledge");
    await setKnowledgeAgentLinks({
      tenantId: params.tenantId,
      knowledgeDocId: doc.id,
      agentIds: params.agentIds,
      scope: "agents",
    });
  }

  enqueueKnowledgeProcess(doc.id);
  return { id: doc.id, status: "queued" };
}

export async function reprocessKnowledgeDocument(tenantId: string, id: string) {
  const doc = await prisma.knowledgeDoc.findFirst({ where: { id, tenantId } });
  if (!doc) throw new AppError("Não encontrado", 404, "NOT_FOUND");
  await prisma.knowledgeDoc.update({
    where: { id },
    data: { status: "queued", errorMessage: null },
  });
  enqueueKnowledgeProcess(id);
  return { id, status: "queued" };
}

export async function deleteKnowledgeFile(storagePath?: string | null) {
  if (!storagePath) return;
  try {
    const abs = path.resolve(env.storagePath, storagePath);
    const root = path.resolve(env.storagePath, "knowledge");
    if (!abs.startsWith(root)) return;
    await unlink(abs);
  } catch {
    /* ignore missing */
  }
}
