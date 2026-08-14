export function tenantSettings(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Fixtures de teste não entram na operação da plataforma. */
export function isTestFixtureTenant(t: {
  name: string;
  slug: string;
  settings?: unknown;
}): boolean {
  const s = tenantSettings(t.settings);
  if (s.fixture === true || s.createdByTest === true || s.environment === "test") {
    return true;
  }
  const slug = t.slug || "";
  if (/^(tenant-a-|tenant-b-|nega-|negb-|inv-)/i.test(slug)) return true;
  if (/^(Tenant A |Tenant B |NegA |NegB |Invite Co )/i.test(t.name || "")) return true;
  return false;
}

export function testUserEmailFilter() {
  return {
    OR: [
      { email: { endsWith: "@test.local" } },
      { email: { endsWith: "@test.nexaflow.local" } },
    ],
  };
}

export function normalizeNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
