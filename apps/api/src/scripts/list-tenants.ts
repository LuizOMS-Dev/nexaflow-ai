import { prisma } from "../lib/prisma";

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      settings: true,
      _count: { select: { members: true, contacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify({ total: tenants.length, tenants }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
