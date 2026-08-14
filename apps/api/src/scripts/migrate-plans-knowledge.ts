/**
 * Migração one-shot: remove catálogo SYSTEM/NexaFlow do Knowledge do tenant.
 * Uso: npx tsx apps/api/src/scripts/migrate-plans-knowledge.ts
 */
import { prisma } from "../lib/prisma";
import {
  ensureStarterPlansKnowledge,
  migrateLegacyPlansDocIfNeeded,
} from "../services/knowledge-starter";

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log(`Migrando knowledge de ${tenants.length} empresa(s)...`);

  let migrated = 0;
  let seeded = 0;

  for (const t of tenants) {
    const m = await migrateLegacyPlansDocIfNeeded(t.id);
    if (m.migrated) {
      migrated += 1;
      console.log(`  [migrated] ${t.slug || t.name}`);
    }
    const s = await ensureStarterPlansKnowledge(t.id);
    if (s.created) {
      seeded += 1;
      console.log(`  [seeded]   ${t.slug || t.name}`);
    }
  }

  console.log(`Concluído. Migrados: ${migrated}. Templates criados: ${seeded}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
