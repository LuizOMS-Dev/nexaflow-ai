import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@nexaflow/db";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const leadEmail = `qa-browser-${suffix}@example.invalid`;

test.afterAll(async () => {
  await prisma.salesLead.deleteMany({ where: { email: leadEmail } }).catch(() => null);
  await prisma.$disconnect();
});

function captureRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return failures;
}

test.describe("Landing comercial", () => {
  test("desktop carrega o catálogo oficial e registra a demonstração", async ({ page }) => {
    const failures = captureRuntimeFailures(page);
    const plansResponse = page.waitForResponse(
      (response) => response.url().includes("/nexa-api/public/plans") && response.request().method() === "GET"
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect((await plansResponse).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /Transforme conversas no WhatsApp em vendas/i })
    ).toBeVisible();
    await expect(page.locator("#planos article").first()).toBeVisible();
    await expect(page.getByText("Carregando catálogo oficial...")).toHaveCount(0);

    await page.locator("#demonstracao").scrollIntoViewIfNeeded();
    await page.getByLabel("Seu nome").fill("Pessoa QA Browser");
    await page.getByLabel("E-mail profissional").fill(leadEmail);
    await page.getByLabel("Empresa").fill("Empresa de teste automatizado");
    await page.getByLabel("WhatsApp ou telefone").fill("+55 11 99999-0000");
    await page.getByLabel("Tamanho da equipe").selectOption("3-5");
    await page.getByLabel("O que você quer melhorar?").fill(
      "Fixture temporária do teste E2E; remover automaticamente ao concluir."
    );

    const submit = page.getByRole("button", { name: "Solicitar demonstração" });
    await submit.focus();
    await expect(submit).toBeFocused();

    const demoResponse = page.waitForResponse(
      (response) => response.url().includes("/nexa-api/public/demo-requests") && response.request().method() === "POST"
    );
    await submit.click();
    expect((await demoResponse).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("Pedido recebido");
    expect(failures).toEqual([]);
  });

  test("mobile não cria rolagem horizontal e mantém o formulário acessível", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const failures = captureRuntimeFailures(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Transforme conversas no WhatsApp em vendas/i })
    ).toBeVisible();
    await expect(page.locator("#planos article").first()).toBeVisible();
    await page.locator("#demonstracao").scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Seu nome")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(failures).toEqual([]);
  });
});
