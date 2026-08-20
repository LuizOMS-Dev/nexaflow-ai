import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";
import { ensureDefaultAiAgent } from "./ensure-default-agent";

describe("ensureDefaultAiAgent", () => {
  const suffix = Date.now().toString(36);
  let tenantId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `DefaultAgent ${suffix}`,
        slug: `def-agent-${suffix}`,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "ensure-default-agent" }),
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId).catch(() => null);
  });

  it("cria Ana AUTO+PUBLISHED quando a empresa não tem agente", async () => {
    const agent = await ensureDefaultAiAgent(tenantId);
    expect(agent?.name).toBe("Ana");
    expect(agent?.mode).toBe("AUTO");
    expect(agent?.publishStatus).toBe("PUBLISHED");
    expect(agent?.isActive).toBe(true);
  });

  it("não reverte Copiloto/pausado para AUTO ao curar de novo", async () => {
    const current = await prisma.aiAgent.findFirst({ where: { tenantId } });
    expect(current).toBeTruthy();
    await prisma.aiAgent.update({
      where: { id: current!.id },
      data: { mode: "SUGGEST", isActive: false, publishStatus: "DRAFT" },
    });

    const after = await ensureDefaultAiAgent(tenantId);
    expect(after?.id).toBe(current!.id);
    expect(after?.mode).toBe("SUGGEST");
    expect(after?.isActive).toBe(false);
    expect(after?.publishStatus).toBe("DRAFT");
  });
});
