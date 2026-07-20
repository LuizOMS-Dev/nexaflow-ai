import { createHash } from "node:crypto";
import type { AiAgent, TenantAiConfig } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  describeRuntime,
  findModel,
  PROVIDER_META,
  resolveAiRuntime,
  type AiRuntimeConfig,
} from "./ai-core";

const DANGEROUS_TOOLS = [
  "delete_contact",
  "manage_users",
  "cancel_subscription",
  "register_payment",
  "change_contract",
  "grant_discount",
] as const;

export type AgentReadinessCheck = {
  id:
    | "identity"
    | "guardrails"
    | "tools"
    | "provider"
    | "knowledge"
    | "sandbox"
    | "required_tests";
  label: string;
  passed: boolean;
  severity: "blocker" | "warning";
  detail: string;
};

export type AgentReadiness = {
  agentId: string;
  score: number;
  readyForAuto: boolean;
  fingerprint: string;
  checks: AgentReadinessCheck[];
  blockers: AgentReadinessCheck[];
  knowledgeCount: number;
  testCases: number;
  requiredTestCases: number;
  requiredTestsPassed: number;
  lastSandboxTest: {
    result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
    createdAt: string;
    currentConfiguration: boolean;
  } | null;
  provider: {
    configured: boolean;
    id: string | null;
    name: string | null;
    model: string | null;
    modelDisplayName: string | null;
    credentialMode: string | null;
    lastTestedAt: string | null;
    lastTestOk: boolean | null;
  };
};

type AgentConfigLike = Omit<
  Pick<
    AiAgent,
  | "id"
  | "name"
  | "role"
  | "objective"
  | "personality"
  | "tone"
  | "language"
  | "instructions"
  | "restrictions"
  | "mode"
  | "model"
  | "temperature"
  | "maxMessages"
  | "greeting"
  | "farewell"
  | "transferRules"
  | "tools"
  >,
  "transferRules" | "tools"
> & {
  transferRules: unknown;
  tools: unknown;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value ?? null;
}

/** Identifica a configuração funcional sem depender de updatedAt/status operacional. */
export function agentConfigFingerprint(agent: AgentConfigLike): string {
  const payload = canonicalize({
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
    greeting: agent.greeting,
    farewell: agent.farewell,
    transferRules: agent.transferRules,
    tools: agent.tools,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function evaluateAgentReadiness(input: {
  agent: AgentConfigLike;
  providerConfigured: boolean;
  providerLastTestOk?: boolean | null;
  knowledgeCount: number;
  sandboxPassedForCurrentConfig: boolean;
  requiredTestCases: number;
  requiredTestsPassed: number;
}): Pick<AgentReadiness, "score" | "readyForAuto" | "checks" | "blockers"> {
  const transfer = (input.agent.transferRules || {}) as { triggers?: unknown };
  const tools = (input.agent.tools || {}) as { allowed?: unknown; blocked?: unknown };
  const allowed = Array.isArray(tools.allowed) ? tools.allowed.map(String) : [];
  const blocked = Array.isArray(tools.blocked) ? tools.blocked.map(String) : [];
  const triggers = Array.isArray(transfer.triggers) ? transfer.triggers.map(String) : [];

  const identityOk =
    input.agent.name.trim().length >= 2 &&
    Boolean(input.agent.role?.trim() || input.agent.objective?.trim()) &&
    input.agent.instructions.trim().length >= 20;
  const guardrailsOk =
    Boolean(input.agent.restrictions?.trim()) && triggers.filter(Boolean).length > 0;
  const toolsOk =
    allowed.length > 0 && DANGEROUS_TOOLS.every((tool) => blocked.includes(tool));
  const providerOk = input.providerConfigured && input.providerLastTestOk !== false;
  const requiredOk =
    input.requiredTestCases > 0 && input.requiredTestsPassed === input.requiredTestCases;

  const checks: AgentReadinessCheck[] = [
    {
      id: "identity",
      label: "Identidade e objetivo",
      passed: identityOk,
      severity: "blocker",
      detail: identityOk
        ? "Nome, função/objetivo e comportamento definidos."
        : "Defina nome, função ou objetivo e pelo menos 20 caracteres de comportamento.",
    },
    {
      id: "guardrails",
      label: "Limites e transferência",
      passed: guardrailsOk,
      severity: "blocker",
      detail: guardrailsOk
        ? "Limites e ao menos uma regra de transferência configurados."
        : "Configure limites explícitos e quando transferir para uma pessoa.",
    },
    {
      id: "tools",
      label: "Ferramentas seguras",
      passed: toolsOk,
      severity: "blocker",
      detail: toolsOk
        ? "Ferramentas permitidas com ações críticas bloqueadas."
        : "Selecione ferramentas permitidas e mantenha ações críticas bloqueadas.",
    },
    {
      id: "provider",
      label: "Provedor de IA",
      passed: providerOk,
      severity: "blocker",
      detail: !input.providerConfigured
        ? "Nenhum provedor de IA está disponível para esta empresa."
        : input.providerLastTestOk === false
          ? "O último teste de conexão do provedor falhou."
          : "Runtime de IA disponível para a empresa.",
    },
    {
      id: "knowledge",
      label: "Conhecimento",
      passed: input.knowledgeCount > 0,
      severity: "blocker",
      detail:
        input.knowledgeCount > 0
          ? `${input.knowledgeCount} fonte${input.knowledgeCount === 1 ? "" : "s"} pronta${input.knowledgeCount === 1 ? "" : "s"} para este agente.`
          : "Vincule ao menos uma fonte pronta antes de responder automaticamente.",
    },
    {
      id: "sandbox",
      label: "Teste no sandbox",
      passed: input.sandboxPassedForCurrentConfig,
      severity: "blocker",
      detail: input.sandboxPassedForCurrentConfig
        ? "A configuração atual respondeu com sucesso no sandbox."
        : "Execute um teste bem-sucedido depois da última alteração funcional.",
    },
    {
      id: "required_tests",
      label: "Casos obrigatórios",
      passed: requiredOk,
      severity: "blocker",
      detail:
        input.requiredTestCases === 0
          ? "Crie e aprove ao menos um caso obrigatório antes de liberar o modo automático."
          : `${input.requiredTestsPassed} de ${input.requiredTestCases} casos obrigatórios aprovados na configuração atual.`,
    },
  ];
  const blockers = checks.filter((check) => check.severity === "blocker" && !check.passed);
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { score, readyForAuto: blockers.length === 0, checks, blockers };
}

function runFingerprint(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as Record<string, unknown>).configFingerprint;
  return typeof value === "string" ? value : null;
}

export function countLatestRequiredTestPasses(
  requiredCases: ReadonlyArray<{ id: string }>,
  runsMostRecentFirst: ReadonlyArray<{
    testCaseId: string | null;
    result: string;
    details: unknown;
  }>,
  fingerprint: string
): number {
  return requiredCases.filter((testCase) => {
    const latestForCurrentConfig = runsMostRecentFirst.find(
      (run) =>
        run.testCaseId === testCase.id && runFingerprint(run.details) === fingerprint
    );
    return latestForCurrentConfig?.result === "PASS";
  }).length;
}

export async function getAgentReadiness(params: {
  tenantId: string;
  agentId: string;
  agent?: AiAgent;
  runtime?: AiRuntimeConfig | null;
  providerConfig?: TenantAiConfig | null;
}): Promise<AgentReadiness> {
  const agent =
    params.agent ||
    (await prisma.aiAgent.findFirst({
      where: { id: params.agentId, tenantId: params.tenantId },
    }));
  if (!agent) throw new Error("Agente não encontrado");

  const fingerprint = agentConfigFingerprint(agent);
  const [runtime, providerConfig, knowledgeCount, testCases, sandboxRuns] = await Promise.all([
    params.runtime !== undefined
      ? Promise.resolve(params.runtime)
      : resolveAiRuntime({
          scope: "tenant",
          tenantId: params.tenantId,
          agentModelOverride: agent.model,
        }),
    params.providerConfig !== undefined
      ? Promise.resolve(params.providerConfig)
      : prisma.tenantAiConfig.findUnique({ where: { tenantId: params.tenantId } }).catch(() => null),
    prisma.knowledgeDoc.count({
      where: {
        tenantId: params.tenantId,
        status: { in: ["ready", "published"] },
        NOT: { sourceType: "system" },
        OR: [{ scope: "all" }, { agentLinks: { some: { agentId: agent.id } } }],
      },
    }),
    prisma.agentTestCase.findMany({
      where: { tenantId: params.tenantId, agentId: agent.id },
      select: { id: true, isRequired: true },
    }),
    prisma.agentTestRun.findMany({
      where: { tenantId: params.tenantId, agentId: agent.id, testCaseId: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { result: true, createdAt: true, details: true },
    }),
  ]);

  const requiredCases = testCases.filter((testCase) => testCase.isRequired);
  const requiredRuns = requiredCases.length
    ? await prisma.agentTestRun.findMany({
        where: {
          tenantId: params.tenantId,
          agentId: agent.id,
          testCaseId: { in: requiredCases.map((testCase) => testCase.id) },
        },
        orderBy: { createdAt: "desc" },
        take: Math.max(50, requiredCases.length * 10),
        select: { testCaseId: true, result: true, details: true },
      })
    : [];

  const currentSandbox = sandboxRuns.find(
    (run) => run.result === "PASS" && runFingerprint(run.details) === fingerprint
  );
  const requiredTestsPassed = countLatestRequiredTestPasses(
    requiredCases,
    requiredRuns,
    fingerprint
  );

  const evaluated = evaluateAgentReadiness({
    agent,
    providerConfigured: Boolean(runtime?.apiKey),
    providerLastTestOk: providerConfig?.lastTestOk ?? null,
    knowledgeCount,
    sandboxPassedForCurrentConfig: Boolean(currentSandbox),
    requiredTestCases: requiredCases.length,
    requiredTestsPassed,
  });
  const described = describeRuntime(runtime);
  const providerEntry = runtime ? findModel(runtime.provider, runtime.model) : null;
  const providerName = runtime ? PROVIDER_META[runtime.provider]?.name || runtime.provider : null;

  return {
    agentId: agent.id,
    fingerprint,
    ...evaluated,
    knowledgeCount,
    testCases: testCases.length,
    requiredTestCases: requiredCases.length,
    requiredTestsPassed,
    lastSandboxTest: sandboxRuns[0]
      ? {
          result: sandboxRuns[0].result,
          createdAt: sandboxRuns[0].createdAt.toISOString(),
          currentConfiguration: runFingerprint(sandboxRuns[0].details) === fingerprint,
        }
      : null,
    provider: {
      configured: described.configured,
      id: described.provider,
      name: providerName,
      model: described.model,
      modelDisplayName: providerEntry?.displayName || described.model,
      credentialMode: described.configured ? described.credentialMode || null : null,
      lastTestedAt: providerConfig?.lastTestedAt?.toISOString() || null,
      lastTestOk: providerConfig?.lastTestOk ?? null,
    },
  };
}

export async function getTenantAgentOverview(tenantId: string) {
  const [agents, runtime, providerConfig, readyKnowledge, gaps, suggestions] = await Promise.all([
    prisma.aiAgent.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    resolveAiRuntime({ scope: "tenant", tenantId }),
    prisma.tenantAiConfig.findUnique({ where: { tenantId } }).catch(() => null),
    prisma.knowledgeDoc.count({
      where: {
        tenantId,
        status: { in: ["ready", "published"] },
        NOT: { sourceType: "system" },
      },
    }),
    prisma.knowledgeGap.count({
      where: { tenantId, status: { in: ["NEW", "REVIEWING"] } },
    }),
    prisma.learningSuggestion.count({ where: { tenantId, status: "PENDING" } }),
  ]);

  const readiness = await Promise.all(
    agents.map((agent) =>
      getAgentReadiness({
        tenantId,
        agentId: agent.id,
        agent,
        runtime,
        providerConfig,
      })
    )
  );
  const described = describeRuntime(runtime);
  const model = runtime ? findModel(runtime.provider, runtime.model) : null;
  const providerName = runtime ? PROVIDER_META[runtime.provider]?.name || runtime.provider : null;

  return {
    totals: {
      agents: agents.length,
      active: agents.filter((agent) => agent.isActive).length,
      automatic: agents.filter((agent) => agent.mode === "AUTO").length,
      readyForAuto: readiness.filter((item) => item.readyForAuto).length,
    },
    provider: {
      configured: described.configured,
      id: described.provider,
      name: providerName,
      model: described.model,
      modelDisplayName: model?.displayName || described.model,
      credentialMode: described.configured ? described.credentialMode || null : null,
      lastTestedAt: providerConfig?.lastTestedAt?.toISOString() || null,
      lastTestOk: providerConfig?.lastTestOk ?? null,
    },
    knowledge: { ready: readyKnowledge },
    learning: { openGaps: gaps, pendingSuggestions: suggestions },
    agents: readiness,
  };
}
