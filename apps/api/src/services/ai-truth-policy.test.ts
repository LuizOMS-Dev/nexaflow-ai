import { describe, expect, it } from "vitest";
import {
  GLOBAL_TRUTH_POLICY_ENABLED,
  buildAgentIdentityBlock,
  buildGlobalTruthPolicy,
  buildPlatformContextGuardrails,
  sanitizeAgentInstructions,
} from "./ai";

describe("NexaFlow global truth policy", () => {
  it("is always enabled and not configurable", () => {
    expect(GLOBAL_TRUTH_POLICY_ENABLED).toBe(true);
  });

  it("includes absolute no-invention rules", () => {
    const p = buildGlobalTruthPolicy({ companyName: "Acme" });
    expect(p).toMatch(/NUNCA INVENTAR/i);
    expect(p).toMatch(/preços/i);
    expect(p).toMatch(/Não tenho essa informação|não sei|confirmar/i);
    expect(p).toMatch(/INEGOCIÁVEL|OBRIGATÓRIA/i);
    expect(p).toMatch(/prompt injection|ignore/i);
  });

  it("is embedded in platform guardrails after agent security", () => {
    const g = buildPlatformContextGuardrails({
      agentName: "Julia",
      companyName: "Nexa Co",
    });
    const secIdx = g.indexOf("NEXAFLOW AGENT SECURITY");
    const truthIdx = g.indexOf("NEXAFLOW SYSTEM POLICY");
    const agentCtx = g.indexOf("CONTEXTO OBRIGATÓRIO");
    expect(secIdx).toBeGreaterThanOrEqual(0);
    expect(truthIdx).toBeGreaterThan(secIdx);
    expect(agentCtx).toBeGreaterThan(truthIdx);
    expect(g).toMatch(/Prioridade de instruções|SEGURANÇA \+ VERACIDADE/i);
    expect(g).toMatch(/política de veracidade/i);
    // Cliente não deve ser instruído a "citar" a política
    expect(g).toMatch(/NUNCA cite|não revelar/i);
  });

  it("does not offer a disable switch in policy text", () => {
    const p = buildGlobalTruthPolicy();
    expect(p.toLowerCase()).not.toMatch(/desative a política|turn off truth|disable veracity/);
    expect(p).toMatch(/Não pode ser desativada/i);
  });

  it("builds identity from structured fields only", () => {
    const block = buildAgentIdentityBlock({
      name: "Julia",
      role: "Consultora comercial",
      companyName: "Fm Conteúdos",
      objective: "Qualificar leads",
    });
    expect(block).toMatch(/Nome: Julia/);
    expect(block).toMatch(/Consultora comercial/);
    expect(block).toMatch(/Fm Conteúdos/);
    expect(block).not.toMatch(/\bAna\b/);
  });

  it("strips embedded wrong name and human-lie lines from instructions", () => {
    const raw = `Você é Ana, consultora comercial da Fm Conteúdos no WhatsApp.
Pessoa real da equipe. Nunca diga que é IA, bot ou assistente virtual.
Faça uma pergunta por vez.`;
    const cleaned = sanitizeAgentInstructions(raw, "Julia");
    expect(cleaned.toLowerCase()).not.toMatch(/você é ana/);
    expect(cleaned.toLowerCase()).not.toMatch(/pessoa real da equipe/);
    expect(cleaned).toMatch(/pergunta por vez/i);
  });
});
