/**
 * Base de conhecimento central — multi-tenant.
 * Não é RAG/pgvector; recuperação filtrada por tenant + status + vínculo.
 * Não sincroniza planos de assinatura NexaFlow (tabela Plan).
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import {
  hasStarterPlaceholders,
  STARTER_SOURCE_URL,
  STARTER_PLANS_TITLE,
} from "./knowledge-starter";

export type KnowledgeStatus = "draft" | "ready" | "archived";
export type KnowledgeSource =
  | "manual"
  | "document"
  | "system"
  | "import"
  | "gap"
  | "learning"
  | "text";
export type KnowledgeScope = "all" | "agents";

export const KNOWLEDGE_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  ready: "Pronto",
  published: "Pronto",
  archived: "Arquivado",
};

export const KNOWLEDGE_SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  text: "Manual",
  document: "Documento",
  system: "Sistema NexaFlow",
  import: "Importação",
  gap: "Lacuna resolvida",
  learning: "Aprendizado",
};

export function normalizeKnowledgeStatus(raw?: string | null): KnowledgeStatus {
  const s = (raw || "ready").toLowerCase();
  if (s === "draft" || s === "rascunho") return "draft";
  if (s === "archived" || s === "arquivado") return "archived";
  // published / ready / processing / error → ready for agent use only when published/ready
  if (s === "published" || s === "ready" || s === "pronto") return "ready";
  if (s === "processing" || s === "error") return "draft";
  return "ready";
}

export function normalizeKnowledgeSource(raw?: string | null): string {
  const s = (raw || "manual").toLowerCase();
  if (s === "text") return "manual";
  if (s === "pdf" || s === "file") return "document";
  return s;
}

/** SYSTEM legado — não usar para "Planos e preços" da empresa. */
export function isSystemKnowledge(doc: {
  sourceType?: string | null;
  title?: string | null;
}): boolean {
  return normalizeKnowledgeSource(doc.sourceType) === "system";
}

/** @deprecated Catálogo NexaFlow não deve ir para Knowledge do tenant. */
export async function buildOfficialCatalogContent(): Promise<{
  content: string;
  syncedAt: Date;
}> {
  return {
    content: "",
    syncedAt: new Date(),
  };
}

/** @deprecated No-op — removida sync Plan → Knowledge. */
export async function syncSystemCatalogDocs(_tenantId: string): Promise<void> {
  return;
}

export type KnowledgeListItem = {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  category: string | null;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  scope: string;
  syncedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  agents: Array<{ id: string; name: string }>;
  agentCount: number;
  usedByLabel: string;
  sourceLabel: string;
  statusLabel: string;
  isSystem: boolean;
  editableContent: boolean;
  /** Modelo inicial "Planos e preços" (seed da empresa) */
  isStarterTemplate?: boolean;
  hasExamplePlaceholders?: boolean;
};

function mapDoc(
  doc: {
    id: string;
    tenantId: string;
    title: string;
    content: string;
    category: string | null;
    sourceType: string;
    sourceUrl: string | null;
    status: string;
    scope?: string | null;
    syncedAt?: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    agentLinks?: Array<{ agent: { id: string; name: string } }>;
  },
  opts?: { contentPreview?: boolean }
): KnowledgeListItem {
  const status = normalizeKnowledgeStatus(doc.status);
  const sourceType = normalizeKnowledgeSource(doc.sourceType);
  const scope = (doc.scope === "agents" ? "agents" : "all") as KnowledgeScope;
  const agents = (doc.agentLinks || []).map((l) => l.agent);
  const system = isSystemKnowledge({ sourceType: doc.sourceType, title: doc.title });
  const isStarterTemplate =
    (doc.sourceUrl || "") === STARTER_SOURCE_URL ||
    doc.title === STARTER_PLANS_TITLE ||
    hasStarterPlaceholders(doc.content);
  let usedByLabel = "Todos os agentes";
  if (scope === "agents") {
    if (agents.length === 0) usedByLabel = "Sem agentes";
    else if (agents.length === 1) usedByLabel = agents[0].name;
    else usedByLabel = `${agents.length} agentes`;
  }
  const content =
    opts?.contentPreview && doc.content.length > 400
      ? `${doc.content.slice(0, 400)}…`
      : doc.content;

  return {
    id: doc.id,
    tenantId: doc.tenantId,
    title: doc.title,
    content,
    category: doc.category,
    sourceType: system ? "manual" : sourceType, // nunca expor catálogo NexaFlow como SYSTEM na UI
    sourceUrl: doc.sourceUrl,
    status,
    scope,
    syncedAt: system ? null : doc.syncedAt ?? null,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    agents,
    agentCount: agents.length,
    usedByLabel,
    sourceLabel: system
      ? KNOWLEDGE_SOURCE_LABEL.manual
      : KNOWLEDGE_SOURCE_LABEL[sourceType] || sourceType,
    statusLabel: KNOWLEDGE_STATUS_LABEL[status] || status,
    isSystem: false, // Planos e preços da empresa nunca são SYSTEM
    editableContent: true,
    isStarterTemplate,
    hasExamplePlaceholders: hasStarterPlaceholders(doc.content),
  };
}

export async function listKnowledgeDocs(params: {
  tenantId: string;
  status?: string;
  sourceType?: string;
  agentId?: string;
  q?: string;
}): Promise<KnowledgeListItem[]> {
  // Migração leve legada (sem recriar se excluído)
  try {
    const { migrateLegacyPlansDocIfNeeded } = await import("./knowledge-starter");
    await migrateLegacyPlansDocIfNeeded(params.tenantId);
  } catch {
    /* ignore */
  }

  const statusFilter = params.status
    ? params.status === "ready"
      ? { status: { in: ["ready", "published"] } }
      : { status: params.status }
    : {};

  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      tenantId: params.tenantId,
      ...statusFilter,
      ...(params.sourceType
        ? {
            sourceType:
              params.sourceType === "manual"
                ? { in: ["manual", "text"] }
                : params.sourceType,
          }
        : {}),
      ...(params.agentId
        ? {
            OR: [
              { scope: "all" },
              {
                scope: "agents",
                agentLinks: {
                  some: { agentId: params.agentId, tenantId: params.tenantId },
                },
              },
            ],
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" as const } },
              { content: { contains: params.q, mode: "insensitive" as const } },
              { category: { contains: params.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      agentLinks: {
        where: { tenantId: params.tenantId },
        include: { agent: { select: { id: true, name: true } } },
      },
    },
    take: 200,
  });

  return docs.map((d) =>
    mapDoc(
      {
        ...d,
        scope: d.scope,
        syncedAt: d.syncedAt,
      },
      { contentPreview: true }
    )
  );
}

export async function getKnowledgeDoc(
  tenantId: string,
  id: string
): Promise<KnowledgeListItem | null> {
  const doc = await prisma.knowledgeDoc.findFirst({
    where: { id, tenantId },
    include: {
      agentLinks: {
        where: { tenantId },
        include: { agent: { select: { id: true, name: true } } },
      },
    },
  });
  if (!doc) return null;
  // Converte legado SYSTEM sem sobrescrever com Plan
  if (isSystemKnowledge(doc)) {
    try {
      const { migrateLegacyPlansDocIfNeeded } = await import("./knowledge-starter");
      await migrateLegacyPlansDocIfNeeded(tenantId, doc.id);
      const refreshed = await prisma.knowledgeDoc.findFirst({
        where: { id: doc.id, tenantId },
        include: {
          agentLinks: {
            where: { tenantId },
            include: { agent: { select: { id: true, name: true } } },
          },
        },
      });
      if (refreshed) return mapDoc(refreshed);
    } catch {
      /* fall through */
    }
  }
  return mapDoc(doc);
}

/**
 * Score simples de relevância (sem embeddings).
 * Título pesa mais; categoria e corpo reforçam.
 */
export function scoreKnowledgeDoc(
  query: string,
  title: string,
  content: string,
  category?: string | null
): number {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
  if (!terms.length) return 0;
  const tTitle = (title || "").toLowerCase();
  const tCat = (category || "").toLowerCase();
  const tBody = (content || "").toLowerCase();
  let s = 0;
  for (const term of terms) {
    if (tTitle.includes(term)) s += 5;
    if (tCat.includes(term)) s += 2;
    if (tBody.includes(term)) s += 1;
    // match de palavra inteira no título
    if (new RegExp(`(?:^|\\s)${term}(?:\\s|$)`, "i").test(title)) s += 2;
  }
  return s;
}

/**
 * Knowledge utilizável por um agente em runtime.
 * - só ready/published (rascunho NUNCA entra — protege preços de exemplo)
 * - scope all OU vínculo explícito
 * - tenantId obrigatório
 * - sem sync com Plan
 * - com `query`: ranqueia por relevância (não só os 8 mais recentes)
 */
export async function getKnowledgeForAgent(params: {
  tenantId: string;
  agentId?: string | null;
  take?: number;
  /** última pergunta do cliente — melhora relevância */
  query?: string | null;
}): Promise<Array<{ id: string; title: string; content: string; category: string | null }>> {
  const take = Math.min(Math.max(params.take ?? 12, 1), 24);
  // Candidatos amplos para ranquear (evita “só os 8 últimos” irrelevantes)
  const pool = Math.min(Math.max(take * 5, 40), 80);

  const agentId = params.agentId || undefined;
  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      tenantId: params.tenantId,
      status: { in: ["ready", "published"] },
      // nunca injetar source system legado de catálogo NexaFlow
      NOT: { sourceType: "system" },
      ...(agentId
        ? {
            OR: [
              { scope: "all" },
              {
                scope: "agents",
                agentLinks: {
                  some: { agentId, tenantId: params.tenantId },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: pool,
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      sourceType: true,
    },
  });

  // Defesa extra: se ainda houver placeholders de exemplo, não enviar à IA
  let usable = docs.filter((d) => !hasStarterPlaceholders(d.content));

  const q = (params.query || "").trim();
  if (q && usable.length > 1) {
    const ranked = usable
      .map((d) => ({
        d,
        score: scoreKnowledgeDoc(q, d.title, d.content, d.category),
      }))
      .sort((a, b) => b.score - a.score || b.d.title.localeCompare(a.d.title));

    const withHits = ranked.filter((x) => x.score > 0);
    // Se achar hits, usa os melhores; senão mantém recência (contexto geral)
    usable = (withHits.length ? withHits : ranked).slice(0, take).map((x) => x.d);
  } else {
    usable = usable.slice(0, take);
  }

  return usable.map((d) => ({
    id: d.id,
    title: d.title,
    content: d.content,
    category: d.category,
  }));
}

export async function setKnowledgeAgentLinks(params: {
  tenantId: string;
  knowledgeDocId: string;
  agentIds: string[];
  scope: KnowledgeScope;
}) {
  // Valida agentes do mesmo tenant
  const agents = await prisma.aiAgent.findMany({
    where: { tenantId: params.tenantId, id: { in: params.agentIds } },
    select: { id: true },
  });
  const validIds = agents.map((a) => a.id);

  await prisma.agentKnowledge.deleteMany({
    where: { tenantId: params.tenantId, knowledgeDocId: params.knowledgeDocId },
  });

  if (params.scope === "agents" && validIds.length) {
    await prisma.agentKnowledge.createMany({
      data: validIds.map((agentId) => ({
        tenantId: params.tenantId,
        knowledgeDocId: params.knowledgeDocId,
        agentId,
      })),
      skipDuplicates: true,
    });
  }

  return prisma.knowledgeDoc.update({
    where: { id: params.knowledgeDocId },
    data: { scope: params.scope },
  });
}

export async function rebuildChunks(docId: string, content: string) {
  await prisma.knowledgeChunk.deleteMany({ where: { docId } });
  const parts = content
    .split(/\n{2,}/)
    .filter(Boolean)
    .slice(0, 20);
  if (!parts.length) return;
  await prisma.knowledgeChunk.createMany({
    data: parts.map((c) => ({
      docId,
      content: c.slice(0, 2000),
      metadata: asInputJson({}),
    })),
  });
}

/** Arquiva docs de demo/treino claramente marcados (não apaga). */
export async function archiveDemoKnowledge(tenantId: string): Promise<number> {
  const demoPatterns = ["dados de demonstração", "catálogo de treino", "[demo]", "(demo)"];
  const docs = await prisma.knowledgeDoc.findMany({
    where: { tenantId, status: { not: "archived" } },
    select: { id: true, title: true, content: true, sourceType: true },
  });
  let n = 0;
  for (const d of docs) {
    if (isSystemKnowledge(d)) continue;
    const blob = `${d.title}\n${d.content}`.toLowerCase();
    if (demoPatterns.some((p) => blob.includes(p))) {
      await prisma.knowledgeDoc.update({
        where: { id: d.id },
        data: { status: "archived" },
      });
      n += 1;
    }
  }
  return n;
}
