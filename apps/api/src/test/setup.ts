/**
 * Setup Vitest — força Postgres isolado antes de qualquer import de prisma.
 * Deve ser carregado via vitest.config setupFiles.
 */
import { execSync } from "child_process";
import path from "path";

process.env.NODE_ENV = "test";
process.env.VITEST = "true";

/**
 * Schema oficial = postgresql.
 * Preferência:
 * 1) DATABASE_URL_TEST se for postgres
 * 2) default Docker local com schema nexaflow_test
 * Nunca file:/SQLite no schema principal.
 */
function resolveTestDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL_TEST,
    process.env.DATABASE_URL,
    "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow?schema=nexaflow_test",
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    const lower = url.toLowerCase();
    if (lower.startsWith("file:")) continue;
    if (!(lower.startsWith("postgresql://") || lower.startsWith("postgres://"))) continue;
    if (
      lower.includes("prod") ||
      lower.includes("production") ||
      lower.includes("supabase") ||
      lower.includes("neon.tech") ||
      process.env.FORCE_PROD_DB === "1"
    ) {
      throw new Error(`[test-setup] ABORT: URL de teste aponta para produção: ${url}`);
    }
    // Força schema de teste se alguém passou o DB principal sem schema isolado
    if (!lower.includes("schema=nexaflow_test") && !lower.includes("nexaflow_test")) {
      const sep = url.includes("?") ? "&" : "?";
      // se já tem schema=public, troca; senão acrescenta
      if (/[?&]schema=/i.test(url)) {
        return url.replace(/([?&]schema=)[^&]*/i, "$1nexaflow_test");
      }
      return `${url}${sep}schema=nexaflow_test`;
    }
    return url;
  }

  return "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow?schema=nexaflow_test";
}

const TEST_DB = resolveTestDatabaseUrl();
process.env.DATABASE_URL = TEST_DB;
process.env.DATABASE_URL_TEST = TEST_DB;

// Secrets de teste (não usam produção)
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-nexaflow-min-32-chars!!";
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET || "test-cookie-secret-nexaflow-32chars!";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-nexaflow-32b!!";

// Testes nunca podem disparar e-mails externos, mesmo que a máquina tenha
// credenciais reais carregadas no ambiente local.
process.env.MAIL_PROVIDER = "none";
process.env.SALES_EMAIL = "";

// Sincroniza schema no banco de teste (uma vez por processo)
const schemaPath = path.resolve(__dirname, "../../../../packages/db/prisma/schema.prisma");
try {
  execSync(
    `npx prisma db push --schema "${schemaPath}" --skip-generate --accept-data-loss`,
    {
      env: { ...process.env, DATABASE_URL: TEST_DB, NODE_ENV: "test" },
      stdio: "pipe",
      cwd: path.resolve(__dirname, "../../../../"),
    }
  );
} catch (err) {
  console.warn(
    "[test-setup] prisma db push warning:",
    err instanceof Error ? err.message : err
  );
}

console.log(`[test-setup] NODE_ENV=test DATABASE_URL=${TEST_DB}`);
