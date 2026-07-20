/**
 * Helpers para fixtures de teste — sempre marcados e isolados.
 */
import { prisma } from "../lib/prisma";

export const TEST_FIXTURE_META = {
  environment: "test" as const,
  fixture: true as const,
  createdByTest: true as const,
};

/** Metadata obrigatória em tenants de teste */
export function testTenantSettings(extra?: Record<string, unknown>) {
  return {
    ...TEST_FIXTURE_META,
    ...extra,
  };
}

export function isTestEnv() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

/**
 * Remove tenant de teste e usuários órfãos @test.* associados.
 * Só roda em NODE_ENV=test por segurança.
 */
export async function cleanupTestTenant(tenantId: string) {
  if (!isTestEnv()) {
    throw new Error("cleanupTestTenant só pode rodar em ambiente de teste");
  }
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => null);
  for (const m of memberships) {
    const left = await prisma.membership.count({ where: { userId: m.userId } });
    if (left === 0) {
      const user = await prisma.user.findUnique({ where: { id: m.userId } });
      if (
        user &&
        (user.email.endsWith("@test.local") ||
          user.email.endsWith("@test.nexaflow.local") ||
          user.email.includes("@test."))
      ) {
        await prisma.user.delete({ where: { id: m.userId } }).catch(() => null);
      }
    }
  }
}
