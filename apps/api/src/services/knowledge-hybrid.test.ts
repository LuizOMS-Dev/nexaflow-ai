import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { indexKnowledgeDocument } from "./knowledge-pipeline";
import { retrieveForAgent } from "./knowledge-retrieval";

describe("hybrid retrieval", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";
  let otherId = "";

  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = "mock";
    const a = await prisma.tenant.create({
      data: {
        name: `Hybrid A ${suffix}`,
        slug: `hyb-a-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "hybrid-rag" }),
      },
    });
    const b = await prisma.tenant.create({
      data: {
        name: `Hybrid B ${suffix}`,
        slug: `hyb-b-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "hybrid-rag" }),
      },
    });
    tenantId = a.id;
    otherId = b.id;

    const faq = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: "Planos e preços",
        content: "O plano Pro custa R$ 299 por mês. Frete para o Sudeste é R$ 15.",
        status: "ready",
        scope: "all",
        sourceType: "manual",
      },
    });
    await indexKnowledgeDocument(faq.id, faq.content);

    const other = await prisma.knowledgeDoc.create({
      data: {
        tenantId: otherId,
        title: "Segredo B",
        content: "Código interno VERMELHO-99 da empresa B.",
        status: "ready",
        scope: "all",
        sourceType: "manual",
      },
    });
    await indexKnowledgeDocument(other.id, other.content);
  });

  afterAll(async () => {
    delete process.env.EMBEDDING_PROVIDER;
    await cleanupTestTenant(tenantId).catch(() => null);
    await cleanupTestTenant(otherId).catch(() => null);
  });

  it("palavra exata encontra o chunk de preço", async () => {
    const res = await retrieveForAgent({ tenantId, query: "preço do plano Pro", take: 4 });
    expect(res.sufficient).toBe(true);
    expect(res.chunks.some((c) => /299/.test(c.content))).toBe(true);
  });

  it("sinônimo valor ainda ranqueia o documento de preço", async () => {
    const res = await retrieveForAgent({ tenantId, query: "qual o valor do plano?", take: 4 });
    expect(res.chunks.some((c) => /299|Pro/i.test(c.content))).toBe(true);
  });

  it("pergunta fora da base fica abaixo do threshold", async () => {
    const res = await retrieveForAgent({
      tenantId,
      query: "qual o código do satélite espacial zxy-alpha?",
      take: 4,
    });
    expect(res.sufficient).toBe(false);
    expect(res.reason).toBe("below_threshold");
  });

  it("nunca recupera chunk de outro tenant", async () => {
    const res = await retrieveForAgent({ tenantId, query: "VERMELHO-99 código interno", take: 8 });
    expect(res.chunks.some((c) => /VERMELHO-99/.test(c.content))).toBe(false);
  });
});
