import { execSync } from "child_process";
import path from "path";
import { resolveTestDatabaseUrl } from "./test-database";

export default function globalSetup(): void {
  const testDatabaseUrl = resolveTestDatabaseUrl();
  const workspaceRoot = path.resolve(__dirname, "../../../../");
  const schemaPath = path.resolve(workspaceRoot, "packages/db/prisma/schema.prisma");

  try {
    execSync(
      `npx prisma db push --schema "${schemaPath}" --skip-generate --accept-data-loss`,
      {
        env: {
          ...process.env,
          DATABASE_URL: testDatabaseUrl,
          DATABASE_URL_TEST: testDatabaseUrl,
          NODE_ENV: "test",
        },
        stdio: "pipe",
        cwd: workspaceRoot,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[test-setup] Nao foi possivel preparar o PostgreSQL de teste (${testDatabaseUrl}). ` +
        `Inicie o banco ou configure DATABASE_URL_TEST.\n${message}`
    );
  }
}
