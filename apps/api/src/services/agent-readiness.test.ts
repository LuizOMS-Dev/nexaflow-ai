import { describe, expect, it } from "vitest";
import {
  agentConfigFingerprint,
  countLatestRequiredTestPasses,
  evaluateAgentReadiness,
} from "./agent-readiness";

const dangerousTools = [
  "delete_contact",
  "manage_users",
  "cancel_subscription",
  "register_payment",
  "change_contract",
  "grant_discount",
];

function configuredAgent() {
  return {
    id: "agent-1",
    name: "Julia",
    role: "Consultora comercial",
    objective: "Qualificar oportunidades e encaminhar negociações complexas.",
    personality: "Clara e cordial",
    tone: "Profissional",
    language: "pt-BR",
    instructions: "Responda com clareza usando somente o conhecimento aprovado da empresa.",
    restrictions: "Não invente preços, prazos, políticas ou condições comerciais.",
    mode: "SUGGEST",
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
    maxMessages: 30,
    greeting: null,
    farewell: null,
    transferRules: { triggers: ["cliente pedir uma pessoa"], destination: "queue" },
    tools: { allowed: ["consult_contact"], blocked: dangerousTools },
  } as Parameters<typeof agentConfigFingerprint>[0];
}

describe("agent readiness", () => {
  it("aprova somente uma configuração completa e testada", () => {
    const result = evaluateAgentReadiness({
      agent: configuredAgent(),
      providerConfigured: true,
      providerLastTestOk: true,
      knowledgeCount: 2,
      sandboxPassedForCurrentConfig: true,
      requiredTestCases: 2,
      requiredTestsPassed: 2,
    });

    expect(result.readyForAuto).toBe(true);
    expect(result.score).toBe(100);
    expect(result.blockers).toEqual([]);
  });

  it("bloqueia automático sem conhecimento e teste da configuração atual", () => {
    const result = evaluateAgentReadiness({
      agent: configuredAgent(),
      providerConfigured: true,
      providerLastTestOk: true,
      knowledgeCount: 0,
      sandboxPassedForCurrentConfig: false,
      requiredTestCases: 1,
      requiredTestsPassed: 0,
    });

    expect(result.readyForAuto).toBe(false);
    expect(result.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining(["knowledge", "sandbox", "required_tests"])
    );
  });

  it("exige ao menos um caso obrigatório, mesmo com sandbox aprovado", () => {
    const result = evaluateAgentReadiness({
      agent: configuredAgent(),
      providerConfigured: true,
      providerLastTestOk: true,
      knowledgeCount: 2,
      sandboxPassedForCurrentConfig: true,
      requiredTestCases: 0,
      requiredTestsPassed: 0,
    });

    expect(result.readyForAuto).toBe(false);
    expect(result.blockers.some((item) => item.id === "required_tests")).toBe(true);
  });

  it("bloqueia ferramentas quando ações críticas não estão explicitamente negadas", () => {
    const agent = configuredAgent();
    agent.tools = { allowed: ["consult_contact"], blocked: ["delete_contact"] };
    const result = evaluateAgentReadiness({
      agent,
      providerConfigured: true,
      knowledgeCount: 1,
      sandboxPassedForCurrentConfig: true,
      requiredTestCases: 0,
      requiredTestsPassed: 0,
    });

    expect(result.blockers.some((item) => item.id === "tools")).toBe(true);
  });
});

describe("agent configuration fingerprint", () => {
  it("é estável para a mesma configuração independentemente da ordem das chaves", () => {
    const first = configuredAgent();
    const second = configuredAgent();
    second.tools = { blocked: dangerousTools, allowed: ["consult_contact"] };

    expect(agentConfigFingerprint(first)).toBe(agentConfigFingerprint(second));
  });

  it("muda quando o comportamento funcional muda", () => {
    const first = configuredAgent();
    const second = { ...configuredAgent(), instructions: "Um comportamento funcional diferente e seguro." };

    expect(agentConfigFingerprint(first)).not.toBe(agentConfigFingerprint(second));
  });
});

describe("latest required test result", () => {
  const currentFingerprint = "current-config";
  const details = (configFingerprint: string) => ({ configFingerprint });

  it("nÃ£o mantÃ©m a aprovaÃ§Ã£o quando o teste atual falha depois de ter passado", () => {
    const passed = countLatestRequiredTestPasses(
      [{ id: "case-1" }],
      [
        { testCaseId: "case-1", result: "FAIL", details: details(currentFingerprint) },
        { testCaseId: "case-1", result: "PASS", details: details(currentFingerprint) },
      ],
      currentFingerprint
    );

    expect(passed).toBe(0);
  });

  it("aprova quando o resultado mais recente da configuraÃ§Ã£o atual passa", () => {
    const passed = countLatestRequiredTestPasses(
      [{ id: "case-1" }],
      [
        { testCaseId: "case-1", result: "PASS", details: details(currentFingerprint) },
        { testCaseId: "case-1", result: "FAIL", details: details(currentFingerprint) },
      ],
      currentFingerprint
    );

    expect(passed).toBe(1);
  });

  it("ignora resultados de configuraÃ§Ãµes antigas", () => {
    const passed = countLatestRequiredTestPasses(
      [{ id: "case-1" }],
      [{ testCaseId: "case-1", result: "PASS", details: details("old-config") }],
      currentFingerprint
    );

    expect(passed).toBe(0);
  });
});
