/**
 * Observabilidade de execuções de IA.
 * Não persiste prompt completo nem secrets.
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export type AiExecutionStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

const COST_PER_MILLION: Record<string, { in: number; out: number }> = {
  "openai/gpt-oss-20b": { in: 0.1, out: 0.5 },
  "openai/gpt-oss-120b": { in: 0.15, out: 0.75 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
};

export function estimateCostUsd(params: {
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}): number {
  const rates = COST_PER_MILLION[params.model || ""] || { in: 0.1, out: 0.5 };
  const inn = Math.max(0, params.inputTokens || 0);
  const out = Math.max(0, params.outputTokens || 0);
  return Number(((inn / 1_000_000) * rates.in + (out / 1_000_000) * rates.out).toFixed(6));
}

export async function startAiExecution(params: {
  tenantId: string;
  agentId?: string | null;
  agentVersionId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  purpose?: string | null;
  correlationId?: string | null;
  retrievalCount?: number;
}): Promise<{ id: string; startedAt: Date }> {
  const row = await prisma.aiExecution.create({
    data: {
      tenantId: params.tenantId,
      agentId: params.agentId || null,
      agentVersionId: params.agentVersionId || null,
      conversationId: params.conversationId || null,
      messageId: params.messageId || null,
      provider: params.provider || null,
      model: params.model || null,
      mode: params.mode || null,
      purpose: params.purpose || null,
      correlationId: params.correlationId || null,
      retrievalCount: params.retrievalCount ?? 0,
      status: "RUNNING",
    },
    select: { id: true, startedAt: true },
  });
  return row;
}

export async function finishAiExecution(params: {
  id: string;
  status: Exclude<AiExecutionStatus, "QUEUED" | "RUNNING">;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  retrievalCount?: number;
  toolCallsCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  messageId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const inputTokens = params.inputTokens ?? 0;
  const outputTokens = params.outputTokens ?? 0;
  const started = await prisma.aiExecution.findUnique({
    where: { id: params.id },
    select: { startedAt: true, model: true },
  });
  const finishedAt = new Date();
  const latencyMs = started ? Math.max(0, finishedAt.getTime() - started.startedAt.getTime()) : null;
  const estimatedCost = estimateCostUsd({
    model: params.model || started?.model,
    inputTokens,
    outputTokens,
  });

  const safeMeta = params.metadata
    ? Object.fromEntries(
        Object.entries(params.metadata).filter(
          ([k]) => !/prompt|secret|api[-_]?key|password|token/i.test(k)
        )
      )
    : null;

  await prisma.aiExecution.update({
    where: { id: params.id },
    data: {
      status: params.status,
      finishedAt,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost,
      retrievalCount: params.retrievalCount,
      toolCallsCount: params.toolCallsCount,
      errorCode: params.errorCode || null,
      errorMessage: params.errorMessage ? String(params.errorMessage).slice(0, 400) : null,
      messageId: params.messageId || undefined,
      provider: params.provider || undefined,
      model: params.model || undefined,
      metadata: safeMeta ? asInputJson(safeMeta) : undefined,
    },
  });
}

export async function listAiExecutionsForConversation(tenantId: string, conversationId: string, take = 20) {
  return prisma.aiExecution.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      provider: true,
      model: true,
      mode: true,
      purpose: true,
      latencyMs: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCost: true,
      retrievalCount: true,
      errorCode: true,
      errorMessage: true,
      correlationId: true,
      createdAt: true,
      finishedAt: true,
      metadata: true,
    },
  });
}
