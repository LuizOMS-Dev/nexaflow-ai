/**
 * Pipeline Unificado de Mídia do NexaFlow (WhatsApp / WAHA).
 *
 * Consolida 100% dos fluxos de mídia:
 * 1. Envio de mídias (NexaFlow -> WAHA -> WhatsApp)
 * 2. Recebimento de mídias (WhatsApp -> WAHA -> NexaFlow)
 * 3. Sincronização de mensagens de outros dispositivos (WhatsApp Web/Celular -> WAHA -> NexaFlow)
 * 4. Reenvio / Retry de mídias que falharam
 * 5. Reconciliação atômica por clientMessageId / externalId
 */

import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { prisma } from "../../lib/prisma";
import { asInputJson } from "../../lib/json";
import { AppError } from "../../lib/errors";
import { broadcastToTenant } from "../../ws/hub";
import {
  classifyFile,
  resolveMediaFilePath,
  sanitizeFilename,
  type MediaKind,
} from "../storage/media-storage";
import { formatWahaDestinationChatId, resolveWhatsAppIdentity } from "./identity-resolver";
import { downloadWahaMedia } from "./waha-media";

export type UnifiedMediaKind = "IMAGE" | "AUDIO" | "VOICE" | "VIDEO" | "DOCUMENT" | "FILE";

export type UnifiedMediaStatus =
  | "PREPARING"
  | "UPLOADING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export type UnifiedMediaErrorCode =
  | "MEDIA_TOO_LARGE"
  | "MEDIA_INVALID_TYPE"
  | "MEDIA_UPLOAD_FAILED"
  | "MEDIA_STORAGE_FAILED"
  | "WAHA_MEDIA_SEND_FAILED"
  | "WAHA_MEDIA_DOWNLOAD_FAILED"
  | "SESSION_NOT_READY"
  | "MEDIA_UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_RECIPIENT"
  | "UNKNOWN_ERROR";

export type UnifiedMediaMetadata = {
  filename: string;
  originalName: string;
  mimetype: string;
  sizeBytes: number;
  duration?: number;
  isVoice?: boolean;
  width?: number;
  height?: number;
  storageKey?: string;
  deliveryStatus: UnifiedMediaStatus;
  deliveryError?: string | null;
  sendError?: string | null;
  errorCode?: UnifiedMediaErrorCode;
  clientMessageId?: string;
  externalId?: string;
  source?: "NEXAFLOW_COMPOSER" | "WHATSAPP_INBOUND" | "WHATSAPP_DEVICE" | "AI_ASSISTANT";
  dispatchedAt?: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  retriedAt?: string;
};

// Limites máximos por categoria
export const UNIFIED_MEDIA_LIMITS: Record<UnifiedMediaKind, number> = {
  IMAGE: 20 * 1024 * 1024,      // 20 MB
  VOICE: 25 * 1024 * 1024,      // 25 MB
  AUDIO: 30 * 1024 * 1024,      // 30 MB
  VIDEO: 64 * 1024 * 1024,      // 64 MB
  DOCUMENT: 100 * 1024 * 1024,  // 100 MB
  FILE: 100 * 1024 * 1024,      // 100 MB
};

// Memória de idempotência
const IDEMPOTENCY_TTL_MS = 15 * 60_000;
const unifiedIdempotencyCache = new Map<string, { at: number; result: any }>();
const unifiedInflight = new Map<string, Promise<any>>();

function cleanIdempotency() {
  const now = Date.now();
  for (const [k, v] of unifiedIdempotencyCache) {
    if (now - v.at > IDEMPOTENCY_TTL_MS) unifiedIdempotencyCache.delete(k);
  }
}

/**
 * Normaliza erros de mídia em códigos padrão e mensagens amigáveis
 */
export function normalizeUnifiedMediaError(err: unknown): {
  error: string;
  code: UnifiedMediaErrorCode;
  isRetryable: boolean;
} {
  const rawMsg = err instanceof Error ? err.message : String(err || "");
  const lower = rawMsg.toLowerCase();

  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("network")) {
    return {
      error: "Tempo limite esgotado ao conectar ao WhatsApp. Tente novamente.",
      code: "TIMEOUT",
      isRetryable: true,
    };
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("serviço whatsapp não respondeu") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return {
      error: "Serviço WhatsApp temporariamente indisponível. Aguarde alguns instantes.",
      code: "WAHA_MEDIA_SEND_FAILED",
      isRetryable: true,
    };
  }
  if (
    lower.includes("session") &&
    (lower.includes("stop") || lower.includes("not found") || lower.includes("disconnected") || lower.includes("scan"))
  ) {
    return {
      error: "Sessão do WhatsApp desconectada ou não inicializada no canal.",
      code: "SESSION_NOT_READY",
      isRetryable: false,
    };
  }
  if (lower.includes("tamanho") || lower.includes("size limit") || lower.includes("too large") || lower.includes("413")) {
    return {
      error: "O arquivo excede o tamanho máximo permitido para este tipo de mídia.",
      code: "MEDIA_TOO_LARGE",
      isRetryable: false,
    };
  }
  if (lower.includes("mimetype") || lower.includes("formato") || lower.includes("não permitido") || lower.includes("forbidden")) {
    return {
      error: "Formato ou extensão de arquivo não suportado pelo WhatsApp.",
      code: "MEDIA_INVALID_TYPE",
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
    error: rawMsg || "Falha no processamento de mídia do WhatsApp",
    code: "UNKNOWN_ERROR",
    isRetryable: true,
  };
}

/**
 * Formata preview textual limpo para a conversa (exibição na lista lateral e notificações)
 */
export function formatMediaConversationPreview(kind: UnifiedMediaKind, caption?: string, filename?: string): string {
  const cap = (caption || "").trim();
  if (kind === "IMAGE") return cap ? `📷 ${cap}` : "📷 Foto";
  if (kind === "VOICE") return "🎤 Mensagem de voz";
  if (kind === "AUDIO") return cap ? `🎵 ${cap}` : "🎵 Áudio";
  if (kind === "VIDEO") return cap ? `🎥 ${cap}` : "🎥 Vídeo";
  if (kind === "DOCUMENT" || kind === "FILE") return `📄 ${filename || "Documento"}`;
  return cap || "[Mídia]";
}

// =========================================================================
// 1. OUTBOUND: ENVIO DE MÍDIA PELO NEXAFLOW PARA O WHATSAPP
// =========================================================================

export type OutboundMediaRequest = {
  tenantId: string;
  channelId: string;
  conversationId: string;
  contactId: string;
  to: string;
  mediaType: UnifiedMediaKind;
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

export async function processOutboundMedia(req: OutboundMediaRequest) {
  const startTime = Date.now();
  cleanIdempotency();

  const idempotencyKey =
    req.idempotencyKey ||
    req.clientMessageId ||
    `outbound_media:${req.conversationId}:${req.to}:${createHash("sha256")
      .update(req.mediaUrl + (req.caption || "") + (req.filename || ""))
      .digest("hex")
      .slice(0, 16)}`;

  const cached = unifiedIdempotencyCache.get(idempotencyKey);
  if (cached) return { ...cached.result, skipped: true };

  const inFlight = unifiedInflight.get(idempotencyKey);
  if (inFlight) return { ...(await inFlight), skipped: true };

  const task = (async () => {
    let stage = "VALIDATION";
    try {
      if (!req.tenantId || !req.channelId || !req.conversationId) {
        throw new AppError("Parâmetros obrigatórios ausentes para envio de mídia", 400);
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: req.conversationId, tenantId: req.tenantId },
        include: { channel: true, contact: true },
      });

      if (!conversation) throw new AppError("Conversa não encontrada", 404);
      if (conversation.channel?.type !== "WHATSAPP") throw new AppError("Canal não é WhatsApp", 400);

      const contactCustom = (conversation.contact.customData || {}) as Record<string, unknown>;
      const destination =
        req.to ||
        (contactCustom.wahaChatId as string) ||
        (contactCustom.wahaLid as string) ||
        conversation.contact.phone ||
        "";

      if (!destination) throw new AppError("Destinatário WhatsApp não configurado", 400);

      const formattedChatId = formatWahaDestinationChatId(destination);
      if (!formattedChatId) throw new AppError("Chat ID inválido", 400);

      stage = "STORAGE";
      let absPath = req.absPath;
      let base64Data = req.dataBase64;
      let fileSizeBytes = req.filesize || 0;

      // Resolução segura de absPath com isolamento estrito de tenant
      if (!absPath && req.mediaUrl) {
        const cleanUrl = req.mediaUrl.replace(/^\/(?:api\/)?media\/(?:files|wa)\//, "");
        const parts = cleanUrl.split("/");
        if (parts.length >= 2) {
          const fileTenantId = parts[0];
          const filename = parts[1];

          if (fileTenantId !== req.tenantId) {
            throw new AppError("Acesso não autorizado ao arquivo de outro tenant", 403);
          }

          const resolved = await resolveMediaFilePath(fileTenantId, filename);
          if (resolved.exists) absPath = resolved.absPath;
        }
      }

      if (absPath) {
        const fileStat = await stat(absPath).catch(() => null);
        if (!fileStat) throw new AppError("Arquivo não encontrado no servidor", 404);
        fileSizeBytes = fileStat.size;

        const maxLimit = UNIFIED_MEDIA_LIMITS[req.mediaType] || UNIFIED_MEDIA_LIMITS.FILE;
        if (fileSizeBytes > maxLimit) {
          throw new AppError(`Arquivo excede o limite máximo de ${Math.round(maxLimit / (1024 * 1024))}MB`, 400);
        }

        const buf = await readFile(absPath);
        base64Data = buf.toString("base64");
      } else if (base64Data) {
        base64Data = base64Data.replace(/^data:[^;]+;base64,/, "");
        fileSizeBytes = Buffer.byteLength(base64Data, "base64");

        const maxLimit = UNIFIED_MEDIA_LIMITS[req.mediaType] || UNIFIED_MEDIA_LIMITS.FILE;
        if (fileSizeBytes > maxLimit) {
          throw new AppError(`Arquivo excede o limite máximo de ${Math.round(maxLimit / (1024 * 1024))}MB`, 400);
        }
      } else {
        throw new AppError("Conteúdo da mídia indisponível para envio", 400);
      }

      const rawFilename = req.filename || req.originalName || "arquivo";
      const cleanFilename = sanitizeFilename(rawFilename);
      const classification = classifyFile(req.mimetype || "", cleanFilename);
      const finalMime = req.mimetype || classification.mime;

      const formattedDataUri = base64Data.startsWith("data:")
        ? base64Data
        : `data:${finalMime};base64,${base64Data}`;

      stage = "WAHA_DISPATCH";
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

      let sendResult = { ok: false, externalId: undefined as string | undefined, error: undefined as string | undefined };
      let lastErrorNormalized = { error: "", code: "UNKNOWN_ERROR" as UnifiedMediaErrorCode, isRetryable: false };

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await connector.sendMedia(config as any, destination, {
            kind: req.mediaType,
            mimetype: finalMime,
            filename: cleanFilename,
            dataBase64: formattedDataUri,
            caption: req.caption,
          });

          if (res.ok) {
            sendResult = { ok: true, externalId: res.externalId, error: undefined };
            break;
          } else {
            lastErrorNormalized = normalizeUnifiedMediaError(res.error);
            sendResult = { ok: false, externalId: undefined, error: lastErrorNormalized.error };
            if (!lastErrorNormalized.isRetryable || attempt >= 2) break;
            await new Promise((r) => setTimeout(r, attempt * 1000));
          }
        } catch (err) {
          lastErrorNormalized = normalizeUnifiedMediaError(err);
          sendResult = { ok: false, externalId: undefined, error: lastErrorNormalized.error };
          if (!lastErrorNormalized.isRetryable || attempt >= 2) break;
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }

      stage = "PERSISTENCE";
      const now = new Date();
      const deliveryStatus: UnifiedMediaStatus = sendResult.ok ? "SENT" : "FAILED";

      const metadata: UnifiedMediaMetadata = {
        filename: cleanFilename,
        originalName: req.originalName || rawFilename,
        mimetype: finalMime,
        sizeBytes: fileSizeBytes,
        duration: req.duration,
        isVoice: req.mediaType === "VOICE",
        deliveryStatus,
        deliveryError: sendResult.ok ? null : sendResult.error,
        sendError: sendResult.ok ? null : sendResult.error,
        errorCode: sendResult.ok ? undefined : lastErrorNormalized.code,
        clientMessageId: req.clientMessageId || idempotencyKey,
        externalId: sendResult.externalId,
        source: req.purpose === "ai" ? "AI_ASSISTANT" : "NEXAFLOW_COMPOSER",
        dispatchedAt: now.toISOString(),
        deliveredAt: sendResult.ok ? now.toISOString() : null,
      };

      const message = await prisma.message.create({
        data: {
          conversationId: req.conversationId,
          authorId: req.userId,
          direction: req.isInternal ? "INTERNAL" : "OUTBOUND",
          type: req.isInternal ? "TEXT" : req.mediaType,
          content: req.caption || "",
          mediaUrl: req.mediaUrl,
          externalId: sendResult.externalId,
          isAiGenerated: req.purpose === "ai",
          metadata: asInputJson(metadata),
        },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      });

      const preview = formatMediaConversationPreview(req.mediaType, req.caption, cleanFilename);
      const updated = await prisma.conversation.update({
        where: { id: req.conversationId },
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

      broadcastToTenant(req.tenantId, "message.created", {
        conversationId: req.conversationId,
        message,
        conversation: updated,
      });

      return {
        ok: sendResult.ok,
        messageId: message.id,
        externalId: sendResult.externalId,
        deliveryStatus,
        error: sendResult.error,
        errorCode: lastErrorNormalized.code,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const norm = normalizeUnifiedMediaError(err);
      return {
        ok: false,
        deliveryStatus: "FAILED" as UnifiedMediaStatus,
        error: norm.error,
        errorCode: norm.code,
        durationMs: Date.now() - startTime,
      };
    }
  })();

  unifiedInflight.set(idempotencyKey, task);
  try {
    const res = await task;
    if (res.ok) unifiedIdempotencyCache.set(idempotencyKey, { at: Date.now(), result: res });
    return res;
  } finally {
    unifiedInflight.delete(idempotencyKey);
  }
}

// =========================================================================
// 2. INBOUND: RECEBIMENTO DE MÍDIA DO WHATSAPP
// =========================================================================

export type InboundMediaRequest = {
  tenantId: string;
  channelId: string;
  phone: string;
  name?: string;
  content?: string;
  externalId?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaFilename?: string;
  mediaData?: string;
  caption?: string;
  chatId?: string;
  from?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  addressingMode?: string;
  providerTimestamp?: Date;
  fromMe?: boolean;
};

export async function processInboundMedia(req: InboundMediaRequest) {
  const eventTime = req.providerTimestamp || new Date();

  // Deduplicação estrita por externalId
  if (req.externalId) {
    const existing = await prisma.message.findFirst({
      where: {
        externalId: req.externalId,
        conversation: { tenantId: req.tenantId },
      },
      include: { conversation: true },
    });

    if (existing) {
      // Reconcilia status se for mensagem do próprio atendente
      if (req.fromMe) {
        const curMeta = (existing.metadata || {}) as Record<string, unknown>;
        if (curMeta.deliveryStatus !== "SENT" && curMeta.deliveryStatus !== "DELIVERED" && curMeta.deliveryStatus !== "READ") {
          await prisma.message.update({
            where: { id: existing.id },
            data: {
              deliveredAt: existing.deliveredAt || eventTime,
              metadata: asInputJson({
                ...curMeta,
                deliveryStatus: "SENT",
                reconciledFromMe: true,
              }),
            },
          });
        }
      }
      return { conversation: existing.conversation, message: existing, duplicate: true };
    }
  }

  // Download e persistência permanente em storage/media/{tenantId}
  let storedMediaUrl: string | undefined = undefined;
  let classifiedKind: UnifiedMediaKind = "FILE";
  let metadata: Partial<UnifiedMediaMetadata> = {
    deliveryStatus: "DELIVERED",
    source: req.fromMe ? "WHATSAPP_DEVICE" : "WHATSAPP_INBOUND",
  };

  if (req.mediaUrl || req.mediaData) {
    try {
      const stored = await downloadWahaMedia({
        tenantId: req.tenantId,
        url: req.mediaUrl,
        dataBase64: req.mediaData,
        mime: req.mediaMime,
        filename: req.mediaFilename,
      });

      if (stored) {
        storedMediaUrl = stored.publicUrl;
        const isVoice =
          req.mediaType === "VOICE" ||
          (req.mediaMime || "").includes("ogg") ||
          (req.mediaMime || "").includes("opus");

        classifiedKind = isVoice ? "VOICE" : (stored.kind as UnifiedMediaKind);
        metadata = {
          ...metadata,
          filename: stored.filename,
          originalName: req.mediaFilename || stored.filename,
          mimetype: stored.mime,
          sizeBytes: stored.bytes,
          isVoice,
        };
      } else {
        if (req.mediaType) classifiedKind = (req.mediaType as UnifiedMediaKind) || "FILE";
        metadata = {
          ...metadata,
          filename: req.mediaFilename || "anexo",
          originalName: req.mediaFilename || "anexo",
          mimetype: req.mediaMime || "application/octet-stream",
          errorCode: "WAHA_MEDIA_DOWNLOAD_FAILED",
        };
      }
    } catch (err) {
      console.warn("[unified-media] Ingest de mídia falhou ao persistir:", err);
    }
  } else if (req.mediaType) {
    classifiedKind = (req.mediaType as UnifiedMediaKind) || "TEXT";
  }

  // Resolução canônica de contato e conversa por JID / LID
  const identity = await resolveWhatsAppIdentity({
    tenantId: req.tenantId,
    chatId: req.chatId,
    from: req.from,
    remoteJid: req.remoteJid,
    remoteJidAlt: req.remoteJidAlt,
    addressingMode: req.addressingMode,
    pushName: req.name,
    phone: req.phone,
  });

  const contact = await prisma.contact.findUnique({
    where: { id: identity.contactId },
  });
  if (!contact) throw new Error("Falha ao resolver contato WhatsApp");

  broadcastToTenant(
    req.tenantId,
    identity.contactWasCreated ? "contact.created" : "contact.updated",
    { id: contact.id }
  );

  const { resolveConversationForInbound } = await import("../conversation-close");
  const resolvedConv = await resolveConversationForInbound({
    tenantId: req.tenantId,
    contactId: contact.id,
    channelId: req.channelId,
  });

  let conversation = await prisma.conversation.findFirst({
    where: { id: resolvedConv.conversationId, tenantId: req.tenantId },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: req.tenantId,
        contactId: contact.id,
        channelId: req.channelId,
        status: "OPEN",
        isUnread: !req.fromMe,
      },
    });
  }

  const cleanContent = req.caption || (req.content && !/^\[(?:imagem|áudio|audio|vídeo|video|documento|sticker|figurinha|mídia|midia)\]$/i.test(req.content.trim()) ? req.content.trim() : "");
  const direction = req.fromMe ? "OUTBOUND" : "INBOUND";

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction,
      content: cleanContent,
      externalId: req.externalId,
      type: storedMediaUrl || req.mediaType ? classifiedKind : "TEXT",
      mediaUrl: storedMediaUrl,
      createdAt: eventTime,
      deliveredAt: eventTime,
      metadata: asInputJson(metadata),
    },
  });

  const preview = formatMediaConversationPreview(classifiedKind, cleanContent, metadata.filename);

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: eventTime,
      lastMessagePreview: preview.slice(0, 200),
      isUnread: !req.fromMe,
      status: "OPEN",
      channelId: req.channelId,
    },
    include: { contact: true, channel: true },
  });

  broadcastToTenant(req.tenantId, "message.created", {
    conversationId: conversation.id,
    message,
    conversation: updated,
  });

  return { conversation: updated, message };
}
