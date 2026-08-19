/**
 * Memória por conversa (atendimento), distinta de ContactMemory e das instruções do agente.
 * Rollup extractivo — não reenvia o histórico inteiro nem chama o LLM a cada mensagem.
 */
import { prisma } from "../lib/prisma";

const MAX_SUMMARY_CHARS = 1400;
const RECENT_FOR_ROLLUP = 8;

function redactSecrets(text: string): string {
  return text
    .replace(/(?:api[_-]?key|token|senha|password)\s*[:=]\s*\S{6,}/gi, "$1: [redigido]")
    .replace(/\bsk-[a-zA-Z0-9]{12,}\b/g, "[redigido]")
    .replace(/\bgsk_[a-zA-Z0-9]{12,}\b/g, "[redigido]");
}

export function mergeConversationSummary(previous: string, additions: string[]): string {
  const lines = [...(previous || "").split("\n"), ...additions]
    .map((l) => redactSecrets(l).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(l.length > 220 ? `${l.slice(0, 217)}…` : l);
  }
  let out = uniq.join("\n");
  if (out.length > MAX_SUMMARY_CHARS) {
    out = out.slice(out.length - MAX_SUMMARY_CHARS);
    const cut = out.indexOf("\n");
    if (cut > 0 && cut < 80) out = out.slice(cut + 1);
  }
  return out.trim();
}

export async function rollConversationMemory(params: {
  tenantId: string;
  conversationId: string;
}): Promise<{ summary: string; version: number } | null> {
  const conv = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: {
      id: true,
      memorySummary: true,
      memoryVersion: true,
      lastMemoryMessageId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 80,
        select: { id: true, direction: true, content: true, isAiGenerated: true },
      },
    },
  });
  if (!conv) return null;

  const msgs = conv.messages;
  if (!msgs.length) return { summary: conv.memorySummary || "", version: conv.memoryVersion };

  let start = 0;
  if (conv.lastMemoryMessageId) {
    const idx = msgs.findIndex((m) => m.id === conv.lastMemoryMessageId);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const fresh = msgs.slice(Math.max(start, msgs.length - RECENT_FOR_ROLLUP));
  if (!fresh.length && conv.memorySummary) {
    return { summary: conv.memorySummary, version: conv.memoryVersion };
  }

  const additions = fresh.map((m) => {
    const who = m.direction === "INBOUND" ? "Cliente" : m.isAiGenerated ? "IA" : "Atendente";
    return `${who}: ${(m.content || "").replace(/\s+/g, " ").trim().slice(0, 180)}`;
  });
  const summary = mergeConversationSummary(conv.memorySummary || "", additions);
  const lastId = msgs[msgs.length - 1]?.id || conv.lastMemoryMessageId;
  const version = (conv.memoryVersion || 0) + 1;

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      memorySummary: summary || null,
      memoryVersion: version,
      lastMemoryMessageId: lastId,
    },
  });

  return { summary, version };
}

export async function getConversationMemory(
  tenantId: string,
  conversationId: string
): Promise<{ summary: string; version: number } | null> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { memorySummary: true, memoryVersion: true },
  });
  if (!conv) return null;
  return { summary: conv.memorySummary || "", version: conv.memoryVersion || 0 };
}

export async function setConversationMemory(params: {
  tenantId: string;
  conversationId: string;
  summary: string | null;
}): Promise<void> {
  const existing = await prisma.conversation.findFirst({
    where: { id: params.conversationId, tenantId: params.tenantId },
    select: { id: true, memoryVersion: true },
  });
  if (!existing) return;
  await prisma.conversation.update({
    where: { id: existing.id },
    data: {
      memorySummary: params.summary ? redactSecrets(params.summary).slice(0, MAX_SUMMARY_CHARS) : null,
      memoryVersion: (existing.memoryVersion || 0) + 1,
    },
  });
}
