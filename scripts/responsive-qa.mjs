/**
 * Homologação responsiva automatizada (Chromium via Playwright).
 * Uso: node scripts/responsive-qa.mjs
 * Requer stack em http://localhost:3000 e API saudável.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "qa-screenshots");
const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.E2E_SUPERADMIN_EMAIL || "";
const PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD || "";

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 },
  { name: "375x812", width: 375, height: 812 },
  { name: "360x800", width: 360, height: 800 },
];

const ROUTES = [
  { path: "/admin", key: "admin" },
  { path: "/admin/companies", key: "admin-companies" },
  { path: "/admin/users", key: "admin-users" },
  { path: "/admin/finance", key: "admin-finance" },
  { path: "/admin/plans", key: "admin-plans" },
  { path: "/admin/audit", key: "admin-audit" },
  { path: "/app/account", key: "account" },
  { path: "/app/account/security", key: "account-security" },
];

const findings = [];
const results = [];

function log(msg) {
  console.log(msg);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientW = doc.clientWidth;
    const overflowX = scrollW - clientW;
    const hasGlobalX = overflowX > 2;
    // elementos fixed fora da viewport (amostra)
    let fixedIssues = 0;
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (r.right > window.innerWidth + 4 || r.left < -4) fixedIssues += 1;
    });
    return { overflowX, hasGlobalX, fixedIssues, scrollW, clientW };
  });
}

async function pageErrors(page, run) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await run();
  return errors;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);
  // campos de login
  const email = page.locator('input[type="email"], input[name="email"], input[autocomplete="username"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: "visible", timeout: 20000 });
  await email.fill(EMAIL);
  await password.fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(admin|app)/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Defina E2E_SUPERADMIN_EMAIL e E2E_SUPERADMIN_PASSWORD antes da QA autenticada."
    );
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log(`→ Login ${BASE} as ${EMAIL}`);
  const loginErrors = await pageErrors(page, async () => {
    try {
      await login(page);
    } catch (e) {
      findings.push({ severity: "CRÍTICO", msg: `Login falhou: ${e.message}` });
    }
  });
  if (loginErrors.length) {
    findings.push({ severity: "ALTO", msg: `Console no login: ${loginErrors.slice(0, 3).join(" | ")}` });
  }

  const url = page.url();
  log(`→ Pós-login URL: ${url}`);

  // Zoom 125% em 1366
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      const shotKey = `${vp.name}_${route.key}`;
      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(800);
        const m = await measureOverflow(page);
        const bodyText = await page.locator("body").innerText().catch(() => "");
        const crashed =
          bodyText.includes("Application error") ||
          bodyText.includes("Unhandled Runtime Error") ||
          bodyText.includes("This page couldn’t load");

        if (crashed) {
          findings.push({
            severity: "CRÍTICO",
            msg: `Crash em ${route.path} @ ${vp.name}`,
          });
        }
        if (m.hasGlobalX) {
          findings.push({
            severity: "ALTO",
            msg: `Scroll horizontal global ${m.overflowX}px em ${route.path} @ ${vp.name}`,
          });
        }

        // screenshots em resoluções chave
        if (["1920x1080", "1366x768", "390x844"].includes(vp.name) && ["admin", "account", "account-security"].includes(route.key)) {
          await page.screenshot({
            path: path.join(OUT, `${shotKey}.png`),
            fullPage: false,
          });
        }

        results.push({
          viewport: vp.name,
          route: route.path,
          overflowX: m.overflowX,
          fixedIssues: m.fixedIssues,
          crashed: Boolean(crashed),
        });
        process.stdout.write(".");
      } catch (e) {
        findings.push({
          severity: "ALTO",
          msg: `Falha navegação ${route.path} @ ${vp.name}: ${e.message}`,
        });
        results.push({
          viewport: vp.name,
          route: route.path,
          error: e.message,
        });
        process.stdout.write("x");
      }
    }
  }

  // Zoom 125% em 1366
  log("\n→ Zoom 125% @ 1366x768 /admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => {
    document.body.style.zoom = "1.25";
  });
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const zoomOverflow = await measureOverflow(page);
  if (zoomOverflow.hasGlobalX) {
    findings.push({
      severity: "MÉDIO",
      msg: `Overflow com zoom 125% @ 1366x768: ${zoomOverflow.overflowX}px`,
    });
  }
  await page.screenshot({ path: path.join(OUT, "1366x768_zoom125_admin.png") });
  await page.evaluate(() => {
    document.body.style.zoom = "1";
  });

  // MFA gate copy present for superadmin
  const mfaGate = await page.locator("text=Proteja sua conta").count();
  log(`\n→ Gate MFA visível: ${mfaGate > 0 ? "sim" : "não (MFA já ativo ou outro estado)"}`);

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    viewports: VIEWPORTS.map((v) => v.name),
    routes: ROUTES.map((r) => r.path),
    findings,
    results,
    screenshotsDir: "docs/qa-screenshots",
    physicalDevice: "NOT_TESTED_ON_PHYSICAL_DEVICE",
    browsers: ["Chromium (Playwright)"],
  };

  fs.writeFileSync(
    path.join(ROOT, "docs", "responsive-qa-raw.json"),
    JSON.stringify(report, null, 2)
  );

  log("\n=== FINDINGS ===");
  if (!findings.length) log("Nenhum finding automático.");
  for (const f of findings) log(`[${f.severity}] ${f.msg}`);
  log(`\nResultados: ${results.length} combinações | screenshots em docs/qa-screenshots/`);
  log("JSON: docs/responsive-qa-raw.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
