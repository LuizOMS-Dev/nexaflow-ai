import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { failStuckKnowledgeJobs } from "./knowledge-pipeline";

describe("failStuckKnowledgeJobs", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `KnowStuck ${suffix}`,
        slug: `know-stuck-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "knowledge-stuck" }),
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("marca processing antigo como failed", async () => {
    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: "PDF preso",
        content: "texto de teste knowledge stuck processing",
        status: "processing",
        sourceType: "document",
        processedAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    });
    const n = await failStuckKnowledgeJobs(tenantId);
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await prisma.knowledgeDoc.findUnique({ where: { id: doc.id } });
    expect(after?.status).toBe("failed");
  });

  it("marca queued antigo como failed", async () => {
    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: "Fila presa",
        content: "texto de teste knowledge stuck queued",
        status: "queued",
        sourceType: "document",
        processedAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    });
    await failStuckKnowledgeJobs(tenantId);
    const after = await prisma.knowledgeDoc.findUnique({ where: { id: doc.id } });
    expect(after?.status).toBe("failed");
  });

  it("não mexe em processing recente", async () => {
    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title: "Processando agora",
        content: "texto de teste knowledge stuck recent",
        status: "processing",
        sourceType: "document",
        processedAt: new Date(),
      },
    });
    await failStuckKnowledgeJobs(tenantId);
    const after = await prisma.knowledgeDoc.findUnique({ where: { id: doc.id } });
    expect(after?.status).toBe("processing");
  });
});
