/**
 * Força upsert da Help Knowledge da NIA (seed).
 * Uso: DATABASE_URL=... npx tsx src/scripts/seed-help-knowledge.ts
 */
import { prisma } from "../lib/prisma";
import { ensureHelpKnowledgeSeeded } from "../services/nexaflow-assistant";

async function main() {
  const before = await prisma.helpKnowledgeDoc.count();
  console.log("before", before);
  await ensureHelpKnowledgeSeeded();
  const after = await prisma.helpKnowledgeDoc.count();
  const withKey = await prisma.helpKnowledgeDoc.count({ where: { seedKey: { not: null } } });
  console.log("after", after, "seedKeys", withKey);
  const sample = await prisma.helpKnowledgeDoc.findMany({
    select: { title: true, seedKey: true, status: true, category: true },
    orderBy: { sortOrder: "asc" },
    take: 20,
  });
  for (const s of sample) {
    console.log(`- [${s.status}] ${s.seedKey || "—"} | ${s.category} | ${s.title}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
