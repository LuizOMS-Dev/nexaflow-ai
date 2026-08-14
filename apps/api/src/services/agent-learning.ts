/**
 * Aprendizado contínuo da empresa — OPCIONAL por tenant.
 *
 * - Default: DESATIVADO
 * - Isolado por tenantId (nunca compartilha entre empresas)
 * - Independente da política global de VERACIDADE (sempre ativa)
 * - Nunca fine-tuning cego; só lacunas, sugestões, rascunhos controlados
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export type LearningLevel = 1 | 2 | 3;

export type LearningSourceKey =
  | "knowledge"
  | "companyData"
  | "crm"
  | "aiAttendance"
  | "humanAttendance"
  | "humanCorrections"
  | "feedbacks"
  | "handoffs";

export type ContinuousLearningConfig = {
  /** Default false — empresa ativa conscientemente */
  enabled: boolean;
  /** 1 supervisionado (recomendado) | 2 assistido | 3 automático controlado */
  level: LearningLevel;
  sources: Record<LearningSourceKey, boolean>;
};

export const LEARNING_SOURCE_LABELS: Record<LearningSourceKey, string> = {
  knowledge: "Base de conhecimento",
  companyData: "Dados da empresa",
  crm: "Dados do CRM",
  aiAttendance: "Atendimentos da IA",
  humanAttendance: "Atendimentos humanos",
  humanCorrections: "Correções humanas",
  feedbacks: "Feedbacks",
  handoffs: "Handoffs",
};

export function defaultContinuousLearningConfig(): ContinuousLearningConfig {
  return {
    enabled: false,
    level: 1,
    sources: {
      knowledge: true,
      companyData: true,
      crm: true,
      aiAttendance: true,
      humanAttendance: true,
      humanCorrections: true,
      feedbacks: true,
      handoffs: true,
    },
  };
}

export function parseContinuousLearningConfig(raw: unknown): ContinuousLearningConfig {
  const base = defaultContinuousLearningConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const sourcesIn = (o.sources || {}) as Record<string, unknown>;
  const level = Number(o.level);
  return {
    enabled: o.enabled === true,
    level: level === 2 || level === 3 ? (level as LearningLevel) : 1,
    sources: {
      knowledge: sourcesIn.knowledge !== false,
      companyData: sourcesIn.companyData !== false,
      crm: sourcesIn.crm !== false,
      aiAttendance: sourcesIn.aiAttendance !== false,
      humanAttendance: sourcesIn.humanAttendance !== false,
      humanCorrections: sourcesIn.humanCorrections !== false,
      feedbacks: sourcesIn.feedbacks !== false,
      handoffs: sourcesIn.handoffs !== false,
    },
  };
}

export async function getContinuousLearningConfig(
  tenantId: string
): Promise<ContinuousLearningConfig> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const s = (t?.settings || {}) as { continuousLearning?: unknown; learningLevel?: number };
  // legado: learningLevel sozinho não ativa
  const cfg = parseContinuousLearningConfig(s.continuousLearning);
  if (!s.continuousLearning && s.learningLevel) {
    cfg.level = s.learningLevel === 2 || s.learningLevel === 3 ? s.learningLevel : 1;
  }
  return cfg;
}

/** @deprecated use getContinuousLearningConfig */
export async function getTenantLearningLevel(tenantId: string): Promise<LearningLevel> {
  const cfg = await getContinuousLearningConfig(tenantId);
  return cfg.enabled ? cfg.level : 1;
}

/**
 * Pode registrar aprendizado?
 * Isolamento absoluto por tenantId (cada empresa só lê o próprio settings).
 *
 * Regras:
 * 1. empresa enabled === true (default false)
 * 2. fonte permitida nas fontes da empresa
 * 3. se agentId informado: tools.continuousLearning !== false
 *    (Julia com participação desligada → nada dos atendimentos dela entra no pipeline)
 *
 * Ao desativar a empresa:
 * - novas lacunas/sugestões/correções de aprendizado param
 * - KnowledgeDoc já aprovado/publicado permanece intacto
 */
export async function canRecordLearning(params: {
  tenantId: string;
  agentId?: string | null;
  source: LearningSourceKey;
}): Promise<{ ok: boolean; config: ContinuousLearningConfig; reason?: string }> {
  // Sempre lê settings do tenantId informado — nunca cruza empresas
  const config = await getContinuousLearningConfig(params.tenantId);
  if (!config.enabled) {
    return { ok: false, config, reason: "disabled_by_tenant" };
  }
  if (!config.sources[params.source]) {
    return { ok: false, config, reason: "source_disabled" };
  }
  if (params.agentId) {
    const agent = await prisma.aiAgent.findFirst({
      // tenantId no where impede uso de agentId de outra empresa
      where: { id: params.agentId, tenantId: params.tenantId },
      select: { tools: true },
    });
    // Agente inexistente neste tenant → bloqueia (não vaza)
    if (!agent) {
      return { ok: false, config, reason: "agent_not_in_tenant" };
    }
    const tools = (agent.tools || {}) as { continuousLearning?: boolean | null };
    // false = não participa; true/undefined = herda e participa
    if (tools.continuousLearning === false) {
      return { ok: false, config, reason: "disabled_by_agent" };
    }
  }
  return { ok: true, config };
}

export function normalizeGapKey(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/** Registra lacuna — no-op se aprendizado desativado */
export async function recordKnowledgeGap(params: {
  tenantId: string;
  agentId?: string | null;
  question: string;
  metadata?: Record<string, unknown>;
  source?: LearningSourceKey;
}) {
  const gate = await canRecordLearning({
    tenantId: params.tenantId,
    agentId: params.agentId,
    source: params.source || "aiAttendance",
  });
  if (!gate.ok) return null;

  const q = (params.question || "").trim();
  if (q.length < 8) return null;
  if (/ignore (all )?(previous|prior)|system prompt|api[_-]?key|password/i.test(q)) {
    return null;
  }
  // Não grava lacunas a partir de tentativas de jailbreak / engenharia reversa
  try {
    const { detectAgentSecurityThreat } = await import("./agent-security");
    if (detectAgentSecurityThreat(q)) return null;
  } catch {
    /* ignore */
  }
  const key = normalizeGapKey(q);
  if (key.length < 6) return null;

  const existing = await prisma.knowledgeGap.findUnique({
    where: { tenantId_normalizedKey: { tenantId: params.tenantId, normalizedKey: key } },
  });
  if (existing) {
    return prisma.knowledgeGap.update({
      where: { id: existing.id },
      data: {
        occurrences: { increment: 1 },
        lastSeenAt: new Date(),
        agentId: params.agentId || existing.agentId,
        metadata: params.metadata
          ? asInputJson({ ...(existing.metadata as object), ...params.metadata })
          : undefined,
      },
    });
  }
  return prisma.knowledgeGap.create({
    data: {
      tenantId: params.tenantId,
      agentId: params.agentId || undefined,
      question: q.slice(0, 500),
      normalizedKey: key,
      occurrences: 1,
      status: "NEW",
      metadata: params.metadata ? asInputJson(params.metadata) : undefined,
    },
  });
}

export async function recordLearningSuggestion(params: {
  tenantId: string;
  agentId?: string | null;
  kind: string;
  title: string;
  content: string;
  source?: string;
  sourceKey?: LearningSourceKey;
  metadata?: Record<string, unknown>;
}) {
  const gate = await canRecordLearning({
    tenantId: params.tenantId,
    agentId: params.agentId,
    source: params.sourceKey || mapLegacySource(params.source),
  });
  if (!gate.ok) return null;

  const level = gate.config.level;
  const sug = await prisma.learningSuggestion.create({
    data: {
      tenantId: params.tenantId,
      agentId: params.agentId || undefined,
      kind: params.kind,
      title: params.title.slice(0, 200),
      content: params.content.slice(0, 8000),
      source: params.source,
      status: "PENDING",
      metadata: params.metadata ? asInputJson(params.metadata) : undefined,
    },
  });

  // Nível 2+: rascunho de knowledge (nunca published automático de conversa)
  // Nível 3: rascunho só de fontes estruturadas/oficiais — nunca conversa isolada
  const canDraft =
    level >= 2 &&
    params.kind === "knowledge" &&
    params.content.length > 20 &&
    (level < 3 ||
      params.sourceKey === "companyData" ||
      params.sourceKey === "knowledge" ||
      params.sourceKey === "crm");

  if (canDraft) {
    await prisma.knowledgeDoc.create({
      data: {
        tenantId: params.tenantId,
        title: `[Rascunho] ${params.title}`.slice(0, 180),
        content: params.content.slice(0, 20000),
        category: "Aprendizado",
        sourceType: "learning",
        status: "draft",
        scope: "all",
      },
    });
  }

  return sug;
}

function mapLegacySource(source?: string): LearningSourceKey {
  if (source === "feedback") return "feedbacks";
  if (source === "human_edit") return "humanCorrections";
  if (source === "handoff") return "handoffs";
  return "aiAttendance";
}

/** Feedback do atendente — sempre pode registrar rating; gaps/sugestões só se learning on */
export async function recordAgentFeedback(params: {
  tenantId: string;
  agentId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  rating: "up" | "down" | string;
  reason?: string | null;
  note?: string | null;
  createdById?: string | null;
}) {
  const fb = await prisma.agentFeedback.create({
    data: {
      tenantId: params.tenantId,
      agentId: params.agentId || undefined,
      conversationId: params.conversationId || undefined,
      messageId: params.messageId || undefined,
      rating: params.rating,
      reason: params.reason || undefined,
      note: params.note || undefined,
      createdById: params.createdById || undefined,
    },
  });

  const numeric = Number(params.rating);
  const isCsatLow =
    params.reason === "csat_customer" &&
    Number.isFinite(numeric) &&
    numeric >= 1 &&
    numeric <= 2;
  const isCsatHigh =
    params.reason === "csat_customer" &&
    Number.isFinite(numeric) &&
    numeric >= 4 &&
    numeric <= 5;

  if (params.rating === "down" || params.rating === "negative" || isCsatLow) {
    await recordKnowledgeGap({
      tenantId: params.tenantId,
      agentId: params.agentId,
      question: params.note || params.reason || "Feedback negativo sem detalhe",
      metadata: { fromFeedback: true, feedbackId: fb.id, csat: numeric || null },
      source: "feedbacks",
    });
    await recordLearningSuggestion({
      tenantId: params.tenantId,
      agentId: params.agentId,
      kind: "correction",
      title: isCsatLow
        ? `CSAT baixo do cliente (${numeric}/5)`
        : "Resposta com feedback negativo",
      content:
        params.note ||
        params.reason ||
        "Revisar tom, clareza e se a dúvida do cliente foi resolvida",
      source: "feedback",
      sourceKey: "feedbacks",
      metadata: { feedbackId: fb.id, csat: numeric || null },
    });
  } else if (isCsatHigh) {
    await recordLearningSuggestion({
      tenantId: params.tenantId,
      agentId: params.agentId,
      kind: "pattern",
      title: `CSAT alto do cliente (${numeric}/5)`,
      content:
        "Atendimento bem avaliado — reforçar clareza, objetividade e confirmação de entendimento.",
      source: "feedback",
      sourceKey: "feedbacks",
      metadata: { feedbackId: fb.id, csat: numeric },
    });
  }
  return fb;
}

export async function recordHumanCorrection(params: {
  tenantId: string;
  agentId?: string | null;
  conversationId?: string | null;
  originalAi: string;
  finalHuman: string;
}) {
  if (!params.originalAi?.trim() || !params.finalHuman?.trim()) return null;
  if (params.originalAi.trim() === params.finalHuman.trim()) return null;
  return recordLearningSuggestion({
    tenantId: params.tenantId,
    agentId: params.agentId,
    kind: "correction",
    title: "Correção humana de resposta da IA",
    content: `Original IA:\n${params.originalAi.slice(0, 1500)}\n\nEnviado por humano:\n${params.finalHuman.slice(0, 1500)}`,
    source: "human_edit",
    sourceKey: "humanCorrections",
    metadata: { conversationId: params.conversationId },
  });
}

export async function maybeGapFromReply(params: {
  tenantId: string;
  agentId?: string | null;
  userMessage: string;
  reply: string;
}) {
  const r = (params.reply || "").toLowerCase();
  const unsure =
    /não (tenho|sei|encontrei|possuo)|sem (essa )?informação|não consta|não posso confirmar|vou verificar|encaminhar/.test(
      r
    );
  if (!unsure) return null;
  return recordKnowledgeGap({
    tenantId: params.tenantId,
    agentId: params.agentId,
    question: params.userMessage,
    metadata: { reason: "low_confidence_reply" },
    source: "aiAttendance",
  });
}
