/**
 * One-shot: renomeia tag residual "Quente" → "Alta prioridade" no dev.db
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:C:/nexaflow-data/dev.db" } },
});

async function main() {
  const tags = await prisma.tag.findMany({
    where: { name: { equals: "Quente" } },
  });
  console.log("tags Quente:", tags.length);
  for (const t of tags) {
    // se já existir "Alta prioridade" no tenant, só remove a residual
    const exists = await prisma.tag.findFirst({
      where: { tenantId: t.tenantId, name: "Alta prioridade" },
    });
    if (exists) {
      await prisma.contactTag.updateMany({
        where: { tagId: t.id },
        data: { tagId: exists.id },
      });
      await prisma.tag.delete({ where: { id: t.id } });
      console.log("merged/deleted", t.id);
    } else {
      await prisma.tag.update({
        where: { id: t.id },
        data: { name: "Alta prioridade" },
      });
      console.log("renamed", t.id);
    }
  }
  const tenants = await prisma.tenant.findMany({ select: { name: true, slug: true } });
  console.log("tenants:", tenants);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
