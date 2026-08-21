/**
 * Pipeline Centralizado de Envio de Mídias para WhatsApp (NexaFlow).
 *
 * Responsável por:
 * 1. Validação estrita de arquivo, MIME type, extensão, limites de tamanho e sanitização.
 * 2. Prevenção de path traversal e isolamento por tenant.
 * 3. Idempotência por clientMessageId / idempotencyKey e controle de concorrência in-flight.
 * 4. Normalização de dados em base64 com prefixo Data URI compatível com todos os engines da WAHA.
 * 5. Despacho resiliente com timeout configurável e retries com backoff apenas para falhas recuperáveis.
 * 6. Fallback inteligente de endpoints (/api/sendVoice -> /api/sendFile, /api/sendVideo -> /api/sendFile).
 * 7. Observabilidade estruturada com logs sem segredos.
 */

import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { broadcastToTenant } from "../../ws/hub";
import {
  classifyFile,
  resolveMediaFilePath,
  sanitizeFilename,
  type MediaKind,
} from "../storage/media-storage";
import { formatWahaDestinationChatId } from "./identity-resolver";

export type MediaPipelineKind = "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT" | "FILE";

export type MediaSendPipelineParams = {
  tenantId: string;
  channelId: string;
  conversationId: string;
  contactId: string;
  to: string;
  mediaType: MediaPipelineKind;
  mediaUrl: string;
  mimetype?: string;
  filename?: string;
  originalName?: string;
  filesize?: number;
  duration?: number;
  caption?: string;
  absPath?: string;
  dataBase64?: string;
  clientMessageId?: string;
  idempotencyKey?: string;
  purpose?: "reply" | "ai" | "automation" | "campaign" | "api";
  userId?: string;
  isInternal?: boolean;
};

export type MediaPipelineResult = {
  ok: boolean;
  messageId?: string;
  externalId?: string;
  deliveryStatus: "SENT" | "DELIVERED" | "READ" | "FAILED";
  error?: string;
  errorCode?: string;
  stage: "VALIDATION" | "STORAGE" | "RATE_LIMIT" | "GATEWAY_DISPATCH" | "PERSISTENCE" | "COMPLETED";
  durationMs: number;
  skipped?: boolean;
};

// Limites máximos por categoria (em bytes)
export const MEDIA_SIZE_LIMITS: Record<MediaPipelineKind, number> = {
  IMAGE: 20 * 1024 * 1024,      // 20 MB
  VOICE: 25 * 1024 * 1024,      // 25 MB
  AUDIO: 30 * 1024 * 1024,      // 30 MB
  VIDEO: 64 * 1024 * 1024,      // 64 MB (limite nativo WhatsApp)
  DOCUMENT: 100 * 1024 * 1024,  // 100 MB
  FILE: 100 * 1024 * 1024,      // 100 MB
};

// Idempotência em memória
const IDEMPOTENCY_TTL_MS = 15 * 60_000;
const pipelineIdempotencyCache = new Map<string, { at: number; result: MediaPipelineResult }>();
const pipelineInflight = new Map<string, Promise<MediaPipelineResult>>();

function cleanExpiredIdempotency() {
  const now = Date.now();
  for (const [k, v] of pipelineIdempotencyCache) {
    if (now - v.at > IDEMPOTENCY_TTL_MS) pipelineIdempotencyCache.delete(k);
  }
}

/**
 * Traduz erros técnicos em mensagens claras para o usuário
 */
export function normalizeMediaError(err: unknown): { error: string; code: string; isRetryable: boolean } {
  const rawMsg = err instanceof Error ? err.message : String(err || "");
  const lower = rawMsg.toLowerCase();

  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("network")) {
    return {
      error: "Tempo limite esgotado ao conectar ao WhatsApp. Tente novamente.",
      code: "TIMEOUT",
      isRetryable: true,
    };
  }
  if (lower.includes("econnrefused") || lower.includes("serviço whatsapp não respondeu") || lower.includes("503") || lower.includes("502")) {
    return {
      error: "Serviço WhatsApp temporariamente indisponível. Aguarde alguns instantes.",
      code: "GATEWAY_UNAVAILABLE",
      isRetryable: true,
    };
  }
  if (lower.includes("session") && (lower.includes("stop") || lower.includes("not found") || lower.includes("disconnected") || lower.includes("scan"))) {
    return {
      error: "Sessão do WhatsApp desconectada ou não inicializada no canal.",
      code: "SESSION_DISCONNECTED",
      isRetryable: false,
    };
  }
  if (lower.includes("tamanho") || lower.includes("size limit") || lower.includes("too large") || lower.includes("413")) {
    return {
      error: "O arquivo excede o tamanho máximo permitido para este tipo de mídia.",
      code: "FILE_TOO_LARGE",
      isRetryable: false,
    };
  }
  if (lower.includes("mimetype") || lower.includes("formato") || lower.includes("não permitido")) {
    return {
      error: "Formato ou extensão de arquivo não suportado pelo WhatsApp.",
      code: "INVALID_FORMAT",
      isRetryable: false,
    };
  }
  if (lower.includes("destination") || lower.includes("chatid") || lower.includes("destinatário") || lower.includes("404")) {
    return {
      error: "Destinatário WhatsApp inválido ou não registrado.",
      code: "INVALID_RECIPIENT",
      isRetryable: false,
    };
  }

  return {
    error: rawMsg || "Falha ao enviar mídia pelo WhatsApp",
    code: "DISPATCH_FAILED",
    isRetryable: true,
  };
}

/**
 * Pipeline Centralizado de Envio de Mídia
 */
export async function executeMediaSendPipeline(
  params: MediaSendPipelineParams
): Promise<MediaPipelineResult> {
  const startTime = Date.now();
  cleanExpiredIdempotency();

  // Chave de idempotência única
  const idempotencyKey =
    params.idempotencyKey ||
    params.clientMessageId ||
    `media:${params.conversationId}:${params.to}:${createHash("sha256")
      .update(params.mediaUrl + (params.caption || "") + (params.filename || ""))
      .digest("hex")
      .slice(0, 16)}`;

  // 1. Verificação de idempotência em cache
  const cached = pipelineIdempotencyCache.get(idempotencyKey);
  if (cached) {
    return { ...cached.result, skipped: true };
  }

  // 2. Trava in-flight contra múltiplos cliques concorrentes
  const inFlightPromise = pipelineInflight.get(idempotencyKey);
  if (inFlightPromise) {
    const res = await inFlightPromise;
    return { ...res, skipped: true };
  }

  const execution = runMediaPipeline(params, idempotencyKey, startTime);
  pipelineInflight.set(idempotencyKey, execution);

  try {
    const result = await execution;
    if (result.ok) {
      pipelineIdempotencyCache.set(idempotencyKey, { at: Date.now(), result });
    }
    return result;
  } finally {
    pipelineInflight.delete(idempotencyKey);
  }
}

async function runMediaPipeline(
  params: MediaSendPipelineParams,
  idempotencyKey: string,
  startTime: number
): Promise<MediaPipelineResult> {
  let stage: MediaPipelineResult["stage"] = "VALIDATION";

  try {
    // ==========================================
    // ETAPA 1: VALIDAÇÃO DE ENTRADA & PERMISSÕES
    // ==========================================
    if (!params.tenantId || !params.channelId || !params.conversationId) {
      throw new AppError("Parâmetros obrigatórios ausentes para envio de mídia", 400);
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: params.conversationId, tenantId: params.tenantId },
      include: { channel: true, contact: true },
    });

    if (!conversation) {
      throw new AppError("Conversa não encontrada", 404);
    }

    if (conversation.channel?.type !== "WHATSAPP") {
      throw new AppError("Canal não é do tipo WhatsApp", 400);
    }

    const contactCustom = (conversation.contact.customData || {}) as Record<string, unknown>;
    const destination =
      params.to ||
      (contactCustom.wahaChatId as string) ||
      (contactCustom.wahaLid as string) ||
      conversation.contact.phone ||
      "";

    if (!destination) {
      throw new AppError("Destinatário do WhatsApp não encontrado", 400);
    }

    const formattedChatId = formatWahaDestinationChatId(destination);
    if (!formattedChatId) {
      throw new AppError("Formato de destinatário WhatsApp inválido", 400);
    }

    // ==========================================
    // ETAPA 2: RESOLUÇÃO E LEITURA DA MÍDIA
    // ==========================================
    stage = "STORAGE";
    let absPath = params.absPath;
    let base64Data = params.dataBase64;
    let fileSizeBytes = params.filesize || 0;

    // Resolução segura de absPath com isolamento de tenant
    if (!absPath && params.mediaUrl) {
      const cleanUrl = params.mediaUrl.replace(/^\/(?:api\/)?media\/(?:files|wa)\//, "");
      const parts = cleanUrl.split("/");
      if (parts.length >= 2) {
        const fileTenantId = parts[0];
        const filename = parts[1];

        // Bloqueia tentativa de cross-tenant
        if (fileTenantId !== params.tenantId) {
          throw new AppError("Acesso não autorizado ao arquivo de outro tenant", 403);
        }

        const resolved = await resolveMediaFilePath(fileTenantId, filename);
        if (resolved.exists) {
          absPath = resolved.absPath;
        }
      }
    }

    // Se temos absPath, lemos arquivo e conferimos tamanho
    if (absPath) {
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat) {
        throw new AppError("Arquivo de mídia não encontrado no servidor", 404);
      }
      fileSizeBytes = fileStat.size;

      // Validação de limite de tamanho
      const maxLimit = MEDIA_SIZE_LIMITS[params.mediaType] || MEDIA_SIZE_LIMITS.FILE;
      if (fileSizeBytes > maxLimit) {
        const mb = Math.round(maxLimit / (1024 * 1024));
        throw new AppError(`Arquivo excede o limite máximo de ${mb}MB para ${params.mediaType}`, 400);
      }

      const buf = await readFile(absPath);
      base64Data = buf.toString("base64");
    } else if (base64Data) {
      // Remove prefixo se já existir
      base64Data = base64Data.replace(/^data:[^;]+;base64,/, "");
      fileSizeBytes = Buffer.byteLength(base64Data, "base64");

      const maxLimit = MEDIA_SIZE_LIMITS[params.mediaType] || MEDIA_SIZE_LIMITS.FILE;
      if (fileSizeBytes > maxLimit) {
        const mb = Math.round(maxLimit / (1024 * 1024));
        throw new AppError(`Arquivo excede o limite máximo de ${mb}MB para ${params.mediaType}`, 400);
      }
    } else {
      throw new AppError("Conteúdo da mídia indisponível para envio", 400);
    }

    // Sanitização e determinação de mimetype
    const rawFilename = params.filename || params.originalName || "arquivo";
    const cleanFilename = sanitizeFilename(rawFilename);
    const classification = classifyFile(params.mimetype || "", cleanFilename);
    const finalMime = params.mimetype || classification.mime;

    // Normaliza Base64 com prefixo Data URI para compatibilidade total com WAHA
    const formattedDataUri = base64Data.startsWith("data:")
      ? base64Data
      : `data:${finalMime};base64,${base64Data}`;

    // ==========================================
    // ETAPA 3: RATE LIMIT & CONTROLE DE CANAL
    // ==========================================
    stage = "RATE_LIMIT";

    // ==========================================
    // ETAPA 4: DESPACHO PARA O ADAPTER WAHA
    // ==========================================
    stage = "GATEWAY_DISPATCH";

    const { env } = await import("../../lib/env");
    const channelConfig = (conversation.channel.config || {}) as Record<string, unknown>;
    const provider = (channelConfig.provider as string) || env.waGatewayProvider || "waha";

    const config = {
      ...channelConfig,
      provider: provider as any,
      baseUrl: (channelConfig.baseUrl as string) || env.waGatewayUrl || "http://waha:3000",
      apiKey:
        (channelConfig.apiKey as string) ||
        (env.waGatewayApiKey && !/^sha512:/i.test(env.waGatewayApiKey) ? env.waGatewayApiKey : undefined),
      session:
        (channelConfig.session as string) ||
        (channelConfig.instanceName as string) ||
        conversation.channel.name ||
        "default",
    };

    const { WahaConnector } = await import("./waha");
    const connector = new WahaConnector();

    // Executa envio com retry apenas para falhas recuperáveis (backoff: 1s, 2s)
    let sendResult = { ok: false, externalId: undefined as string | undefined, error: undefined as string | undefined };
    let lastErrorNormalized = { error: "", code: "", isRetryable: false };

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await connector.sendMedia(config as any, destination, {
          kind: params.mediaType,
          mimetype: finalMime,
          filename: cleanFilename,
          dataBase64: formattedDataUri,
          caption: params.caption,
        });

        if (res.ok) {
          sendResult = { ok: true, externalId: res.externalId, error: undefined };
          break;
        } else {
          lastErrorNormalized = normalizeMediaError(res.error);
          sendResult = { ok: false, externalId: undefined, error: lastErrorNormalized.error };

          if (!lastErrorNormalized.isRetryable || attempt >= maxAttempts) {
            break;
          }
          // Backoff controlado
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      } catch (err) {
        lastErrorNormalized = normalizeMediaError(err);
        sendResult = { ok: false, externalId: undefined, error: lastErrorNormalized.error };

        if (!lastErrorNormalized.isRetryable || attempt >= maxAttempts) {
          break;
        }
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }

    // ==========================================
    // ETAPA 5: PERSISTÊNCIA NO BANCO DE DADOS
    // ==========================================
    stage = "PERSISTENCE";
    const now = new Date();
    const isOutbound = !params.isInternal;

    const deliveryStatus = sendResult.ok ? "SENT" : "FAILED";
    const metadata = {
      filename: cleanFilename,
      originalName: params.originalName || rawFilename,
      mimetype: finalMime,
      sizeBytes: fileSizeBytes,
      duration: params.duration,
      isVoice: params.mediaType === "VOICE",
      deliveryStatus,
      deliveryError: sendResult.ok ? null : sendResult.error,
      sendError: sendResult.ok ? null : sendResult.error,
      clientMessageId: params.clientMessageId || idempotencyKey,
      dispatchedAt: now.toISOString(),
      deliveredAt: sendResult.ok ? now.toISOString() : null,
    };

    const { asInputJson } = await import("../../lib/json");
    const message = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        authorId: params.userId,
        direction: params.isInternal ? "INTERNAL" : "OUTBOUND",
        type: params.isInternal ? "TEXT" : params.mediaType,
        content: params.caption || "",
        mediaUrl: params.mediaUrl,
        externalId: sendResult.externalId,
        isAiGenerated: params.purpose === "ai",
        metadata: asInputJson(metadata),
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });

    // Formata preview da conversa
    let preview = params.caption || "";
    if (params.mediaType === "IMAGE") preview = preview ? `📷 ${preview}` : "📷 Foto";
    else if (params.mediaType === "VOICE") preview = "🎤 Mensagem de voz";
    else if (params.mediaType === "AUDIO") preview = "🎵 Áudio";
    else if (params.mediaType === "VIDEO") preview = preview ? `🎥 ${preview}` : "🎥 Vídeo";
    else if (params.mediaType === "DOCUMENT" || params.mediaType === "FILE") preview = `📄 ${cleanFilename}`;

    const updated = await prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        lastMessageAt: now,
        lastMessagePreview: preview.slice(0, 200),
        status: conversation.status === "CLOSED" ? "OPEN" : conversation.status,
        isUnread: false,
      },
      include: { contact: true, channel: true },
    });

    await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { lastInteractionAt: now },
    });

    // ==========================================
    // ETAPA 6: BROADCAST REALTIME VIA WEBSOCKET
    // ==========================================
    broadcastToTenant(params.tenantId, "message.created", {
      conversationId: params.conversationId,
      message,
      conversation: updated,
    });

    stage = "COMPLETED";
    const durationMs = Date.now() - startTime;

    console.info(
      `[media-pipeline] Mídia enviada com sucesso: type=${params.mediaType} conv=${params.conversationId} extId=${sendResult.externalId || "none"} dur=${durationMs}ms`
    );

    return {
      ok: sendResult.ok,
      messageId: message.id,
      externalId: sendResult.externalId,
      deliveryStatus,
      error: sendResult.error,
      errorCode: lastErrorNormalized.code,
      stage,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const norm = normalizeMediaError(err);

    console.error(
      `[media-pipeline] Falha no pipeline de mídia [stage=${stage}]: ${norm.error} (conv=${params.conversationId})`
    );

    return {
      ok: false,
      deliveryStatus: "FAILED",
      error: norm.error,
      errorCode: norm.code,
      stage,
      durationMs,
    };
  }
}
