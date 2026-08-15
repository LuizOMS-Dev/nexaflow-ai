const DEFAULT_TEST_DATABASE_URL =
  "postgresql://nexaflow:nexaflow@localhost:5432/nexaflow?schema=nexaflow_test";

export function resolveTestDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL_TEST,
    process.env.DATABASE_URL,
    DEFAULT_TEST_DATABASE_URL,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    const lower = url.toLowerCase();
    if (lower.startsWith("file:")) continue;
    if (!(lower.startsWith("postgresql://") || lower.startsWith("postgres://"))) {
      continue;
    }
    if (
      lower.includes("prod") ||
      lower.includes("production") ||
      lower.includes("supabase") ||
      lower.includes("neon.tech") ||
      process.env.FORCE_PROD_DB === "1"
    ) {
      throw new Error(`[test-setup] ABORT: URL de teste aponta para producao: ${url}`);
    }

    if (!lower.includes("schema=nexaflow_test") && !lower.includes("nexaflow_test")) {
      if (/[?&]schema=/i.test(url)) {
        return url.replace(/([?&]schema=)[^&]*/i, "$1nexaflow_test");
      }
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}schema=nexaflow_test`;
    }
    return url;
  }

  return DEFAULT_TEST_DATABASE_URL;
}
