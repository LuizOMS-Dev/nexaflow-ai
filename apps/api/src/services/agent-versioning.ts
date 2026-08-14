import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

export function agentSnapshot(agent: {
  name: string;
  role?: string | null;
  objective?: string | null;
  personality?: string | null;
  tone?: string | null;
  language?: string;
  instructions: string;
  restrictions?: string | null;
  mode: string;
  model: string;
  temperature: number;
  maxMessages: number;
  isActive: boolean;
  greeting?: string | null;
  farewell?: string | null;
  transferRules?: unknown;
  tools?: unknown;
}) {
  return {
    name: agent.name,
    role: agent.role,
    objective: agent.objective,
    personality: agent.personality,
    tone: agent.tone,
    language: agent.language,
    instructions: agent.instructions,
    restrictions: agent.restrictions,
    mode: agent.mode,
    model: agent.model,
    temperature: agent.temperature,
    maxMessages: agent.maxMessages,
    isActive: agent.isActive,
    greeting: agent.greeting,
    farewell: agent.farewell,
    transferRules: agent.transferRules,
    tools: agent.tools,
  };
}

export async function publishAgentVersion(params: {
  tenantId: string;
  agentId: string;
  userId?: string | null;
  changeNote?: string | null;
}) {
  const agent = await prisma.aiAgent.findFirst({
    where: { id: params.agentId, tenantId: params.tenantId },
  });
  if (!agent) throw new Error("Agente não encontrado");

  // Se há draftSnapshot, aplica no agente antes de versionar
  const draft = agent.draftSnapshot as Record<string, unknown> | null;
  let live = agent;
  if (draft && typeof draft === "object") {
    live = await prisma.aiAgent.update({
      where: { id: agent.id },
      data: {
        name: typeof draft.name === "string" ? draft.name : agent.name,
        role: (draft.role as string) ?? agent.role,
        objective: (draft.objective as string) ?? agent.objective,
        personality: (draft.personality as string) ?? agent.personality,
        tone: (draft.tone as string) ?? agent.tone,
        instructions:
          typeof draft.instructions === "string" ? draft.instructions : agent.instructions,
        restrictions: (draft.restrictions as string) ?? agent.restrictions,
        mode: (draft.mode as "SUGGEST" | "APPROVE" | "AUTO") || agent.mode,
        model: typeof draft.model === "string" ? draft.model : agent.model,
        transferRules: draft.transferRules != null ? asInputJson(draft.transferRules) : undefined,
        tools: draft.tools != null ? asInputJson(draft.tools) : undefined,
        greeting: (draft.greeting as string) ?? agent.greeting,
        farewell: (draft.farewell as string) ?? agent.farewell,
        draftSnapshot: Prisma.DbNull,
        publishStatus: "PUBLISHED",
      },
    });
  }

  const nextVersion = (live.currentVersion || 0) + 1;
  const snap = agentSnapshot(live);
  const version = await prisma.agentVersion.create({
    data: {
      tenantId: params.tenantId,
      agentId: live.id,
      version: nextVersion,
      snapshot: asInputJson(snap),
      changeNote: params.changeNote || `Publicação v${nextVersion}`,
      createdById: params.userId || undefined,
    },
  });

  await prisma.aiAgent.update({
    where: { id: live.id },
    data: {
      currentVersion: nextVersion,
      publishStatus: "PUBLISHED",
      draftSnapshot: Prisma.DbNull,
    },
  });

  return version;
}

export async function saveAgentDraft(params: {
  tenantId: string;
  agentId: string;
  patch: Record<string, unknown>;
}) {
  const agent = await prisma.aiAgent.findFirst({
    where: { id: params.agentId, tenantId: params.tenantId },
  });
  if (!agent) throw new Error("Agente não encontrado");

  const base =
    (agent.draftSnapshot as Record<string, unknown>) ||
    (agentSnapshot(agent) as unknown as Record<string, unknown>);
  const next = { ...base, ...params.patch };

  return prisma.aiAgent.update({
    where: { id: agent.id },
    data: {
      draftSnapshot: asInputJson(next),
      // se já publicado, marca que há rascunho sem derrubar produção
      publishStatus: agent.publishStatus === "ARCHIVED" ? "ARCHIVED" : agent.publishStatus,
    },
  });
}

export async function rollbackAgentVersion(params: {
  tenantId: string;
  agentId: string;
  version: number;
  userId?: string | null;
}) {
  const row = await prisma.agentVersion.findFirst({
    where: {
      tenantId: params.tenantId,
      agentId: params.agentId,
      version: params.version,
    },
  });
  if (!row) throw new Error("Versão não encontrada");

  const snap = row.snapshot as Record<string, unknown>;
  await prisma.aiAgent.update({
    where: { id: params.agentId },
    data: {
      draftSnapshot: asInputJson(snap),
    },
  });

  return publishAgentVersion({
    tenantId: params.tenantId,
    agentId: params.agentId,
    userId: params.userId,
    changeNote: `Rollback para v${params.version}`,
  });
}
