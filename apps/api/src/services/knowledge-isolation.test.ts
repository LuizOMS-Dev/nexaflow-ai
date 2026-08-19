import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { retrieveForAgent } from "./knowledge-retrieval";
import { indexKnowledgeDocument } from "./knowledge-pipeline";

async function seedTenant(name: string) {
  const slug = `kb-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.tenant.create({
    data: {
      name,
      slug,
      status: "ACTIVE",
    },
  });
}

describe("knowledge retrieval isolation", () => {
  it("nunca devolve chunk de outro tenant", async () => {
    const a = await seedTenant("Tenant A");
    const b = await seedTenant("Tenant B");
    const docA = await prisma.knowledgeDoc.create({
      data: {
        tenantId: a.id,
        title: "Segredo A",
        content: "O código confidencial da empresa A é AZUL-42.",
        status: "ready",
        scope: "all",
        sourceType: "manual",
      },
    });
    const docB = await prisma.knowledgeDoc.create({
      data: {
        tenantId: b.id,
        title: "Segredo B",
        content: "O código confidencial da empresa B é VERMELHO-99.",
        status: "ready",
        scope: "all",
        sourceType: "manual",
      },
    });
    await indexKnowledgeDocument(docA.id, docA.content);
    await indexKnowledgeDocument(docB.id, docB.content);

    const ra = await retrieveForAgent({
      tenantId: a.id,
      query: "código confidencial",
      take: 8,
    });
    const rb = await retrieveForAgent({
      tenantId: b.id,
      query: "código confidencial",
      take: 8,
    });

    expect(ra.chunks.every((c) => c.documentId === docA.id)).toBe(true);
    expect(rb.chunks.every((c) => c.documentId === docB.id)).toBe(true);
    expect(ra.chunks.some((c) => /VERMELHO-99/.test(c.content))).toBe(false);
    expect(rb.chunks.some((c) => /AZUL-42/.test(c.content))).toBe(false);
  });
});
