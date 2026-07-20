import { test, expect, type Page } from "@playwright/test";

const SUPERADMIN = {
  email: process.env.E2E_SUPERADMIN_EMAIL || "",
  password: process.env.E2E_SUPERADMIN_PASSWORD || "",
};
const HAS_SUPERADMIN = Boolean(SUPERADMIN.email && SUPERADMIN.password);

const TENANT_ADMIN = {
  // fallback: se impersonate não estiver na UI, login via API cookie não é trivial —
  // usamos superadmin + /admin e rotas públicas + login tenant se disponível.
  email: process.env.E2E_TENANT_EMAIL || "",
  password: process.env.E2E_TENANT_PASSWORD || "",
};

const PUBLIC_ROUTES = ["/", "/login", "/register", "/docs/api"];

const APP_ROUTES = [
  "/app",
  "/app/inbox",
  "/app/contacts",
  "/app/crm",
  "/app/tasks",
  "/app/campaigns",
  "/app/automations",
  "/app/ai",
  "/app/ai/learning",
  "/app/knowledge",
  "/app/team",
  "/app/integrations",
  "/app/reports",
  "/app/settings",
  "/app/settings/api",
  "/app/settings/webhooks",
  "/app/account",
  "/app/account/security",
  "/app/account/preferences",
  "/app/whats-new",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/companies",
  "/admin/users",
  "/admin/finance",
  "/admin/plans",
  "/admin/sales-leads",
  "/admin/audit",
  "/admin/system/health",
  "/admin/system/diagnostics",
  "/admin/system/releases",
];

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  // campos comuns
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await emailInput.fill(email);
  await passInput.fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(1500);
}

async function softVisit(page: Page, path: string) {
  // load > networkidle: páginas com WS/polling nunca ficam "idle"
  const res = await page.goto(path, { waitUntil: "load", timeout: 30_000 });
  const status = res?.status() ?? 0;
  expect(status, `${path} status`).toBeLessThan(500);
  await page.waitForTimeout(300);
  const html = await page.content();
  const hasRoot =
    html.includes("__next") ||
    html.includes("nexaflow") ||
    html.includes("NexaFlow") ||
    html.includes("<main") ||
    html.length > 800;
  expect(hasRoot, `${path} empty shell html=${html.length}`).toBeTruthy();
  const links = page.locator("a[href^='/']");
  const n = Math.min(await links.count(), 6);
  for (let i = 0; i < n; i++) {
    const el = links.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.hover({ timeout: 800 }).catch(() => null);
    }
  }
  return { path, status, ok: status > 0 && status < 500 && hasRoot };
}

test.describe("Click-all / smoke UI", () => {
  test("public routes load without 5xx", async ({ page }) => {
    for (const r of PUBLIC_ROUTES) {
      await softVisit(page, r);
    }
  });

  test("superadmin login + admin routes", async ({ page }) => {
    test.skip(!HAS_SUPERADMIN, "Defina E2E_SUPERADMIN_EMAIL e E2E_SUPERADMIN_PASSWORD.");
    await login(page, SUPERADMIN.email, SUPERADMIN.password);
    // pode ir para /admin
    await page.waitForTimeout(800);
    const url = page.url();
    // se MFA bloquear, ainda assim não deve 500
    expect(url.includes("login") || url.includes("admin") || url.includes("app")).toBeTruthy();

    for (const r of ADMIN_ROUTES) {
      await softVisit(page, r);
    }
  });

  test("tenant app routes (after superadmin or tenant login)", async ({ page }) => {
    test.skip(
      !(TENANT_ADMIN.email && TENANT_ADMIN.password) && !HAS_SUPERADMIN,
      "Defina credenciais E2E de tenant ou superadmin."
    );
    if (TENANT_ADMIN.email && TENANT_ADMIN.password) {
      await login(page, TENANT_ADMIN.email, TENANT_ADMIN.password);
    } else {
      // tenta superadmin — rotas /app podem redirecionar para /admin (esperado)
      await login(page, SUPERADMIN.email, SUPERADMIN.password);
    }

    const results: Array<{ path: string; status: number; ok: boolean }> = [];
    for (const r of APP_ROUTES) {
      const row = await softVisit(page, r);
      results.push(row);
    }
    // pelo menos 70% sem 5xx
    const okCount = results.filter((x) => x.ok).length;
    expect(okCount / results.length).toBeGreaterThanOrEqual(0.7);
  });

  test("login page interactive elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    // click show password se existir
    const toggles = page.locator('button[aria-label*="senha"], button[aria-label*="password"]');
    if ((await toggles.count()) > 0) {
      await toggles.first().click();
    }
  });
});
