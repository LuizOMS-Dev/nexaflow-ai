import path from "path";
import fs from "fs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

const PROD_URL_MARKERS = [
  "prod",
  "production",
  "supabase",
  "neon.tech",
  "rds.amazonaws",
  "azure.com",
  "planetscale",
];

/**
 * Resolve DATABASE_URL.
 * Schema oficial = PostgreSQL. SQLite só em NODE_ENV=test (banco isolado).
 */
function resolveDatabaseUrl() {
  const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();

  // ─── TESTE: banco descartável isolado ───
  if (nodeEnv === "test" || process.env.VITEST === "true") {
    const testUrl =
      process.env.DATABASE_URL_TEST ||
      process.env.DATABASE_URL ||
      "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow_test?schema=public";

    const lower = testUrl.toLowerCase();
    if (
      PROD_URL_MARKERS.some((m) => lower.includes(m)) ||
      process.env.FORCE_PROD_DB === "1"
    ) {
      throw new Error(
        "[db] ABORT: NODE_ENV=test com DATABASE_URL apontando para produção. Use DATABASE_URL_TEST."
      );
    }
    return testUrl;
  }

  const current = (process.env.DATABASE_URL || "").trim();
  if (
    current.startsWith("postgresql://") ||
    current.startsWith("postgres://")
  ) {
    return current;
  }

  if (!current) {
    // Dev local sem env: tenta stack Docker padrão
    const dockerLocal =
      "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow?schema=public";
    console.warn(
      `[db] DATABASE_URL ausente — usando default local Docker: ${dockerLocal}`
    );
    return dockerLocal;
  }

  throw new Error(
    `[db] DATABASE_URL inválida para provider postgresql: ${current.slice(0, 40)}… ` +
      `Use postgresql://… (SQLite não é mais suportado no schema principal).`
  );
}

process.env.DATABASE_URL = resolveDatabaseUrl();
if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  console.log(
    `[db] env=${process.env.NODE_ENV || "development"} DATABASE_URL=${process.env.DATABASE_URL}`
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

if (globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

globalForPrisma.prisma = prisma;
