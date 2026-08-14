/**
 * Homologação do diagnóstico NIA (achados) com estados estruturados reais do schema.
 * Não mocka o motor de findings — usa buildDiagnosticFindings.
 */
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticFindings,
  type SecureAccountDiagnostic,
} from "./nia-account-tools";
import type { Permission } from "../security/permissions";

function baseDiag(over: Partial<SecureAccountDiagnostic> = {}): SecureAccountDiagnostic {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    probes: ["account", "whatsapp", "agents", "knowledge", "inbox", "billing"],
    account: {
      firstName: "Ana",
      emailMasked: "a***@x.com",
      role: "ADMIN",
      companyName: "Empresa Teste",
      userStatus: "ACTIVE",
      membershipActive: true,
      mfaEnabled: true,
      activeSessions: 1,
    },
    company: {
      status: "ACTIVE",
      planName: "Pro",
      planSlug: "pro",
      features: { api: true, ai: true, inbox: true, crm: true },
      limits: { maxUsers: 10, maxAgents: 5, maxChannels: 3, monthlyAiCredits: 1000 },
      apiEnabled: true,
      seats: { members: 2, maxUsers: 10 },
    },
    accessGate: {
      level: "FULL",
      code: "OK",
      operationalPaused: false,
      financialLabel: null,
      publicMessage: null,
    },
    whatsapp: {
      status: "CONNECTED",
      human: "conectado",
      connected: true,
      configuredCount: 1,
      connectedCount: 1,
    },
    agents: {
      total: 1,
      active: 1,
      modes: [{ name: "Julia", mode: "AUTO", active: true }],
    },
    knowledge: { total: 2, ready: 2, draft: 0, archived: 0 },
    inbox: { openConversations: 0, waitingHuman: 0 },
    findings: [],
    narrativeForModel: "",
    ...over,
  };
}

const adminPerms = [
  "settings.read",
  "settings.update",
  "ai.manage",
  "channels.manage",
  "conversations.read",
] as Permission[];

describe("NIA diagnostic homolog (live schema)", () => {
  it("WHATSAPP OFF: identifica desconectado", () => {
    const f = buildDiagnosticFindings(
      baseDiag({
        whatsapp: {
          status: "DISCONNECTED",
          human: "desconectado",
          connected: false,
          configuredCount: 1,
          connectedCount: 0,
        },
      }),
      adminPerms
    );
    expect(f.some((x) => x.id === "wa_not_connected")).toBe(true);
    expect(f.find((x) => x.id === "wa_not_connected")?.suggestedHref).toBe("/app/integrations");
  });

  it("AGENTE OFF: nenhum ativo", () => {
    const f = buildDiagnosticFindings(
      baseDiag({
        agents: {
          total: 2,
          active: 0,
          modes: [
            { name: "A", mode: "AUTO", active: false },
            { name: "B", mode: "SUGGEST", active: false },
          ],
        },
      }),
      adminPerms
    );
    expect(f.some((x) => x.id === "no_active_agents")).toBe(true);
    expect(f.some((x) => x.id === "wa_not_connected")).toBe(false);
  });

  it("KNOWLEDGE DRAFT: só rascunhos", () => {
    const f = buildDiagnosticFindings(
      baseDiag({ knowledge: { total: 3, ready: 0, draft: 3, archived: 0 } }),
      adminPerms
    );
    expect(f.some((x) => x.id === "knowledge_all_draft")).toBe(true);
  });

  it("HANDOFF ACTIVE: waiting human", () => {
    const f = buildDiagnosticFindings(
      baseDiag({ inbox: { openConversations: 4, waitingHuman: 2 } }),
      adminPerms
    );
    expect(f.some((x) => x.id === "waiting_human")).toBe(true);
  });

  it("PLAN WITHOUT API", () => {
    const f = buildDiagnosticFindings(
      baseDiag({
        company: {
          ...baseDiag().company,
          apiEnabled: false,
          features: { api: false },
        },
      }),
      adminPerms
    );
    expect(f.some((x) => x.id === "plan_no_api")).toBe(true);
  });

  it("ACCESS GATE blocked", () => {
    const f = buildDiagnosticFindings(
      baseDiag({
        accessGate: {
          level: "BLOCKED",
          code: "SUSPENDED",
          operationalPaused: true,
          financialLabel: "Inadimplente",
          publicMessage: "Conta suspensa por cobrança",
        },
      }),
      adminPerms
    );
    expect(f.some((x) => x.id === "access_restricted")).toBe(true);
    expect(f.some((x) => x.id === "ops_paused")).toBe(true);
  });

  it("RBAC DENIED: sem channels.manage e WA off", () => {
    const f = buildDiagnosticFindings(
      baseDiag({
        whatsapp: {
          status: "DISCONNECTED",
          human: "desconectado",
          connected: false,
          configuredCount: 1,
          connectedCount: 0,
        },
      }),
      ["conversations.read"] as Permission[]
    );
    expect(f.some((x) => x.id === "wa_not_connected")).toBe(true);
    expect(f.some((x) => x.id === "rbac_channels")).toBe(true);
  });
});
