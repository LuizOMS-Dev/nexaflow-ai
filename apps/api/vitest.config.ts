import { defineConfig } from "vitest/config";
import path from "path";

/** Postgres local Docker — schema isolado nexaflow_test (nunca o DB de app). */
const TEST_DB =
  process.env.DATABASE_URL_TEST ||
  "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow?schema=nexaflow_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
    // Isolamento: setup força NODE_ENV=test + banco separado
    setupFiles: [path.resolve(__dirname, "src/test/setup.ts")],
    env: {
      NODE_ENV: "test",
      VITEST: "true",
      DATABASE_URL: TEST_DB,
      DATABASE_URL_TEST: TEST_DB,
    },
  },
});
