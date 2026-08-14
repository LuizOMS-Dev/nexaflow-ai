const KEY = "nexaflow_stale_reload";
const WINDOW_MS = 20_000;

export function isStaleClientError(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : "";
  const msg = error instanceof Error ? error.message : String(error);
  const text = `${name} ${msg}`;
  return (
    name === "ChunkLoadError" ||
    /loading chunk/i.test(text) ||
    /failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /importing a module script failed/i.test(text) ||
    /failed to load script/i.test(text)
  );
}

/** One hard reload after deploy. If it already ran, leave the error UI. */
export function recoverStaleClientOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const prev = Number(sessionStorage.getItem(KEY) || 0);
    if (prev && Date.now() - prev < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}
