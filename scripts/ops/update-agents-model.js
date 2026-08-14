const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient({ datasources: { db: { url: "file:C:/nexaflow-data/dev.db" } } });
(async () => {
  const r = await p.aiAgent.updateMany({ data: { model: "llama-3.3-70b-versatile" } });
  console.log("agents updated", r.count);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
