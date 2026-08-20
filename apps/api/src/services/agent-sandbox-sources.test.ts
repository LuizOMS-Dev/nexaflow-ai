import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./ai-core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./ai-core")>();
  return {
    ...orig,
    generateForScope: vi.fn(async () => ({
      content: "O plano Pro custa R$ 299 por mês.",
      model: "mock-model",
      provider: "mock",
      usage: { inputTokens: 12, outputTokens: 18 },
    })),
  };
});

import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { chatWithAgent } from "./ai";
import { indexKnowledgeDocument } from "./knowledge-pipeline";

describe("sandbox chatWithAgent — fontes de knowledge", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";
  let agentId = "";

  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = "mock";
    const tenant = await prisma.tenant.create({
      data: {
        name: `SandboxSrc ${suffix}`,
        slug: `sandbox-src-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "sandbox-sources" }),
      },
    });
    tenantId = tenant.id;
    const agent = await prisma.aiAgent.create({
      data: {
        tenantId,
        name: "Ana Sandbox",
        isActive: true,
        mode: "SUGGEST",
        publishStatus: "PUBLISHED",
      },
    });
    agentId = agent.id;
    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: "Planos e preços",
        content: "O plano Pro custa R$ 299 por mês. Frete para o Sudeste é R$ 15.",
        status: "ready",
        scope: "all",
        sourceType: "manual",
      },
    });
    await indexKnowledgeDocument(doc.id, doc.content);
  });

  afterAll(async () => {
    delete process.env.EMBEDDING_PROVIDER;
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("devolve sources do retrieval em vez de lista vazia", async () => {
    const result = await chatWithAgent({
      tenantId,
      agentId,
      messages: [{ role: "user", content: "Quanto custa o plano Pro?" }],
    });
    expect("sources" in result).toBe(true);
    const sources = (result as { sources?: Array<{ title?: string; documentId?: string }> }).sources;
    expect(Array.isArray(sources)).toBe(true);
    expect(sources?.some((s) => /planos|preços|pro/i.test(s.title || ""))).toBe(true);
  });
});
