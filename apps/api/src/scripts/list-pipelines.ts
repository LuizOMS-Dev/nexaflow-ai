import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:C:/nexaflow-data/dev.db" } },
});

async function main() {
  const pipes = await prisma.pipeline.findMany({
    include: {
      stages: true,
      _count: { select: { opportunities: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(
    JSON.stringify(
      pipes.map((x) => ({
        id: x.id,
        tenantId: x.tenantId,
        name: x.name,
        isDefault: x.isDefault,
        stages: x.stages.length,
        ops: x._count.opportunities,
        createdAt: x.createdAt,
      })),
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
