import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { resolveProductionAutoAgent } from "./resolve-production-agent";

describe("resolveProductionAutoAgent", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `ResolveAuto ${suffix}`,
        slug: `resolve-auto-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "resolve-production-agent" }),
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("não escolhe agente AUTO em DRAFT", async () => {
    await prisma.aiAgent.create({
      data: {
        tenantId,
        name: "Rascunho",
        isActive: true,
        mode: "AUTO",
        publishStatus: "DRAFT",
      },
    });
    const agent = await resolveProductionAutoAgent(tenantId);
    expect(agent).toBeNull();
  });

  it("escolhe somente AUTO + PUBLISHED + ativo", async () => {
    await prisma.aiAgent.create({
      data: {
        tenantId,
        name: "Produção",
        isActive: true,
        mode: "AUTO",
        publishStatus: "PUBLISHED",
      },
    });
    const agent = await resolveProductionAutoAgent(tenantId);
    expect(agent?.name).toBe("Produção");
    expect(agent?.publishStatus).toBe("PUBLISHED");
  });
});
