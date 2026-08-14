/**
 * Remove funis "Funil Comercial" duplicados VAZIOS (0 oportunidades),
 * mantendo o mais antigo (isDefault).
 * Nunca apaga funil com oportunidades.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:C:/nexaflow-data/dev.db" } },
});

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let removed = 0;

  for (const t of tenants) {
    const pipes = await prisma.pipeline.findMany({
      where: { tenantId: t.id },
      include: { _count: { select: { opportunities: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Agrupa por nome (case-insensitive)
    const byName = new Map<string, typeof pipes>();
    for (const p of pipes) {
      const key = p.name.trim().toLowerCase();
      const list = byName.get(key) || [];
      list.push(p);
      byName.set(key, list);
    }

    for (const [, group] of byName) {
      if (group.length < 2) continue;
      const [keep, ...rest] = group;
      console.log(
        `[${t.name}] keep ${keep.id} "${keep.name}" ops=${keep._count.opportunities}`
      );

      // Um único default por tenant
      await prisma.pipeline.update({
        where: { id: keep.id },
        data: { isDefault: true },
      });

      for (const dup of rest) {
        if (dup._count.opportunities > 0) {
          console.log(
            `  SKIP delete ${dup.id} — tem ${dup._count.opportunities} oportunidades`
          );
          // renomeia para diferenciar se nomes iguais e tem dados
          if (dup.name === keep.name) {
            await prisma.pipeline.update({
              where: { id: dup.id },
              data: { name: `${dup.name} (2)`, isDefault: false },
            });
            console.log(`  renamed to "${dup.name} (2)"`);
          }
          continue;
        }
        // vazio: remove estágios + funil
        await prisma.pipelineStage.deleteMany({ where: { pipelineId: dup.id } });
        await prisma.pipeline.delete({ where: { id: dup.id } });
        removed++;
        console.log(`  deleted empty duplicate ${dup.id}`);
      }
    }

    // Garante no máximo um isDefault=true
    const defaults = await prisma.pipeline.findMany({
      where: { tenantId: t.id, isDefault: true },
      orderBy: { createdAt: "asc" },
    });
    if (defaults.length > 1) {
      for (const d of defaults.slice(1)) {
        await prisma.pipeline.update({
          where: { id: d.id },
          data: { isDefault: false },
        });
      }
    }
  }

  console.log("done, removed=", removed);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
