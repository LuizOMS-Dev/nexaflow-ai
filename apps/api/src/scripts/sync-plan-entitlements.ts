/**
 * Sincroniza features de Plan com o catálogo oficial (idempotente).
 * Não altera preço contratado do tenant nem overrides de assinatura.
 *
 * Uso: npx tsx apps/api/src/scripts/sync-plan-entitlements.ts
 */
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";

/**
 * Features oficiais por slug (espelho do packages/db official-plans).
 * Mantido aqui para o script não violar rootDir do tsc da API.
 */
const PLAN_FEATURES: Record<string, Record<string, unknown>> = {
  free: { api: false, webhooks: false, webhooksLimit: 0, apiKeysLimit: 0 },
  starter: { api: false, webhooks: false, webhooksLimit: 0, apiKeysLimit: 0 },
  pro: { api: false, webhooks: true, webhooksLimit: 5, apiKeysLimit: 0 },
  business: { api: true, webhooks: true, webhooksLimit: 20, apiKeysLimit: 10 },
  enterprise: {
    api: true,
    webhooks: true,
    webhooksLimit: 50,
    apiKeysLimit: 25,
    whiteLabel: true,
  },
};

async function main() {
  let updated = 0;
  for (const [slug, features] of Object.entries(PLAN_FEATURES)) {
    const plan = await prisma.plan.findUnique({ where: { slug } });
    if (!plan) {
      console.log(`[skip] plano ${slug} não existe no banco`);
      continue;
    }
    const prev = (plan.features || {}) as Record<string, unknown>;
    const next = { ...prev, ...features };
    await prisma.plan.update({
      where: { id: plan.id },
      data: { features: asInputJson(next) },
    });
    updated += 1;
    console.log(
      `[ok] ${slug}: api=${Boolean(features.api)} webhooks=${Boolean(features.webhooks)} webhooksLimit=${features.webhooksLimit ?? "—"}`
    );
  }
  console.log(
    `Sincronizados ${updated} plano(s). Tenants herdam via planId (sem overwrite de contrato).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
