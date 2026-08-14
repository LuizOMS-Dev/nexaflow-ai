import { describe, expect, it } from "vitest";
import {
  detectConversationClosure,
  parseAttendanceCloseConfig,
  defaultAttendanceCloseConfig,
} from "./conversation-close";

describe("parseAttendanceCloseConfig", () => {
  it("default: inatividade e IA desligados", () => {
    const cfg = defaultAttendanceCloseConfig();
    expect(cfg.inactivity.enabled).toBe(false);
    expect(cfg.aiClose.mode).toBe("off");
    expect(cfg.reopen.mode).toBe("new");
  });

  it("só ativa com enabled true", () => {
    const cfg = parseAttendanceCloseConfig({
      inactivity: { enabled: true, timeoutMinutes: 120 },
      aiClose: { mode: "suggest" },
      reopen: { mode: "reopen", windowHours: 48 },
    });
    expect(cfg.inactivity.enabled).toBe(true);
    expect(cfg.inactivity.timeoutMinutes).toBe(120);
    expect(cfg.aiClose.mode).toBe("suggest");
    expect(cfg.reopen.mode).toBe("reopen");
    expect(cfg.reopen.windowHours).toBe(48);
  });
});

describe("detectConversationClosure", () => {
  const base = {
    lastAgentMessages: ["Seu pedido foi confirmado."],
    hasHumanAssignee: false,
    hasPendingApproval: false,
    openCriticalTasks: false,
  };

  it("não encerra com ok fraco", () => {
    const s = detectConversationClosure({
      ...base,
      lastClientMessages: ["ok"],
    });
    expect(s.shouldClose).toBe(false);
    expect(s.confidence).toBe("low");
  });

  it("não encerra com reclamação", () => {
    const s = detectConversationClosure({
      ...base,
      lastClientMessages: ["Obrigado mas ainda não resolveu o problema"],
    });
    expect(s.shouldClose).toBe(false);
  });

  it("não encerra com humano/handoff", () => {
    const s = detectConversationClosure({
      ...base,
      hasHumanAssignee: true,
      lastClientMessages: ["Era só isso, obrigado!"],
    });
    expect(s.shouldClose).toBe(false);
  });

  it("não encerra com aprovação pendente", () => {
    const s = detectConversationClosure({
      ...base,
      hasPendingApproval: true,
      lastClientMessages: ["Perfeito, resolveu. Era isso."],
    });
    expect(s.shouldClose).toBe(false);
  });

  it("alta confiança quando cliente confirma conclusão", () => {
    const s = detectConversationClosure({
      ...base,
      lastClientMessages: ["Perfeito, era só isso. Obrigado pela ajuda!"],
    });
    expect(s.shouldClose).toBe(true);
    expect(s.confidence).toBe("high");
  });

  it("média confiança com agradecimento longo", () => {
    const s = detectConversationClosure({
      ...base,
      lastClientMessages: ["Muito obrigado pela atenção de vocês"],
    });
    expect(s.shouldClose).toBe(true);
    expect(s.confidence).toBe("medium");
  });
});
