/**
 * Setup Vitest — força Postgres isolado antes de qualquer import de prisma.
 * Deve ser carregado via vitest.config setupFiles.
 */
import { resolveTestDatabaseUrl } from "./test-database";

process.env.NODE_ENV = "test";
process.env.VITEST = "true";

/**
 * Schema oficial = postgresql.
 * Preferência:
 * 1) DATABASE_URL_TEST se for postgres
 * 2) default Docker local com schema nexaflow_test
 * Nunca file:/SQLite no schema principal.
 */
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

console.log(`[test-setup] NODE_ENV=test DATABASE_URL=${TEST_DB}`);
