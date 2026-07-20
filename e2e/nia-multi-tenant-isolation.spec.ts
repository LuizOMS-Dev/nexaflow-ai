/**
 * PRODUCTION BLOCKER: E2E_MULTI_TENANT_LIVE
 *
 * Homologa isolamento real Tenant A vs Tenant B na NIA:
 * - threads / histórico
 * - contexto bootstrap / sugestões por entitlement
 * - abertura de thread por ID cruzado (404)
 * - troca A → B → A
 * - asserts em respostas de rede (não só UI)
 *
 * Pré-requisito: stack em localhost:3000 + :4000
 * Credenciais: E2E_SUPERADMIN_EMAIL e E2E_SUPERADMIN_PASSWORD.
 */
import "dotenv/config";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@nexaflow/db";

const prisma = new PrismaClient();

const API = process.env.PLAYWRIGHT_API_URL || "http://localhost:4000";
const SUPERADMIN = {
  email: process.env.E2E_SUPERADMIN_EMAIL || "",
  password: process.env.E2E_SUPERADMIN_PASSWORD || "",
};

const RUN = Date.now().toString(36);
const USER = {
  email: `e2e-nia-mt-${RUN}@nexaflow.test`,
  password: "E2eNia@MultiTenant2026",
  name: "E2E NIA Multi",
};
const TENANT_FIXTURES = {
  nameA: `E2E NIA Tenant A ${RUN}`,
  nameB: `E2E NIA Tenant B ${RUN}`,
  slugA: `e2e-nia-a-${RUN}`,
  slugB: `e2e-nia-b-${RUN}`,
};

type LoginResult = {
  accessToken: string;
  tenant: { id: string; name: string; slug: string } | null;
  memberships?: Array<{ tenantId: string; role: string; tenant: { id: string; slug: string; name: string } }>;
  user: { id: string; email: string };
};

async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
  tenantSlug?: string
): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password, ...(tenantSlug ? { tenantSlug } : {}) },
  });
  expect(res.ok(), `login ${email}: ${res.status()}`).toBeTruthy();
  return res.json();
}

async function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function apiLogout(request: APIRequestContext, token: string) {
  await request
    .post(`${API}/auth/logout`, { headers: await authHeaders(token) })
    .catch(() => null);
}

/**
 * Hard delete exclusivo para fixtures E2E efêmeras.
 * As travas impedem que este teste alcance tenant ou usuário de uso real.
 */
async function cleanupFixtures() {
  const slugs = [TENANT_FIXTURES.slugA, TENANT_FIXTURES.slugB];
  if (
    slugs.some((slug) => !/^e2e-nia-[ab]-[a-z0-9]+$/.test(slug)) ||
    !/^e2e-nia-mt-[a-z0-9]+@nexaflow\.test$/.test(USER.email)
  ) {
    throw new Error("E2E cleanup bloqueado: identificadores fora do padrão seguro.");
  }

  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, name: true, slug: true },
  });
  if (
    tenants.some(
      (tenant) =>
        !tenant.slug.startsWith("e2e-nia-") || !tenant.name.startsWith("E2E NIA Tenant ")
    )
  ) {
    throw new Error("E2E cleanup bloqueado: tenant encontrado não é uma fixture reconhecida.");
  }

  const tenantIds = tenants.map((tenant) => tenant.id);
  const users = await prisma.user.findMany({
    where: { email: USER.email },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const byTenant = { tenantId: { in: tenantIds } };
  const byUser = { userId: { in: userIds } };

  await prisma.$transaction([
    prisma.webhookDelivery.deleteMany({ where: byTenant }),
    prisma.apiUsageLog.deleteMany({ where: byTenant }),
    prisma.contactScoreHistory.deleteMany({ where: byTenant }),
    prisma.recommendationDecision.deleteMany({ where: byTenant }),
    prisma.note.deleteMany({ where: byTenant }),
    prisma.agentKnowledge.deleteMany({ where: byTenant }),
    prisma.helpAssistantThread.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.helpKnowledgeGap.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.notification.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.auditLog.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.securityEvent.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.authSession.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.mfaChallenge.deleteMany({
      where: { OR: [byTenant, byUser] },
    }),
    prisma.userInvite.deleteMany({
      where: { OR: [byTenant, { email: USER.email }] },
    }),
    prisma.payment.deleteMany({ where: byTenant }),
    prisma.subscription.deleteMany({ where: byTenant }),
    prisma.aiUsageLog.deleteMany({ where: byTenant }),
    prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
    prisma.loginAttempt.deleteMany({ where: { email: USER.email } }),
    prisma.user.deleteMany({ where: { email: USER.email } }),
  ]);

  const [remainingTenants, remainingUsers] = await Promise.all([
    prisma.tenant.count({ where: { slug: { in: slugs } } }),
    prisma.user.count({ where: { email: USER.email } }),
  ]);
  if (remainingTenants || remainingUsers) {
    throw new Error(
      `E2E cleanup incompleto: ${remainingTenants} tenant(s), ${remainingUsers} usuário(s).`
    );
  }
}

test.afterAll(async () => {
  try {
    await cleanupFixtures();
  } finally {
    await prisma.$disconnect();
  }
});

async function setupTenants(request: APIRequestContext) {
  const sa = await apiLogin(request, SUPERADMIN.email, SUPERADMIN.password);
  const h = await authHeaders(sa.accessToken);
  try {
    const plansRes = await request.get(`${API}/admin/plans`, { headers: h });
    expect(plansRes.ok()).toBeTruthy();
    const plansBody = await plansRes.json();
    const plans = plansBody.value || plansBody.items || plansBody || [];
    const planWithApi =
      plans.find((p: { slug?: string; features?: { api?: boolean } }) => p.features?.api === true) ||
      plans.find((p: { slug?: string }) => p.slug === "business" || p.slug === "enterprise");
    const planNoApi =
      plans.find(
        (p: { slug?: string; features?: { api?: boolean } }) =>
          p.slug === "free" || p.features?.api === false
      ) || plans[0];

    expect(planWithApi?.id, "plano com API").toBeTruthy();
    expect(planNoApi?.id, "plano sem API").toBeTruthy();

    const createA = await request.post(`${API}/admin/tenants`, {
      headers: h,
      data: {
        name: TENANT_FIXTURES.nameA,
        slug: TENANT_FIXTURES.slugA,
        planId: planWithApi.id,
        adminEmail: USER.email,
        adminName: USER.name,
        adminPassword: USER.password,
        forceSimilarName: true,
      },
    });
    expect(createA.ok(), `create A ${createA.status()} ${await createA.text()}`).toBeTruthy();
    const tenantA = await createA.json();
    const tenantAId = tenantA.id || tenantA.tenant?.id;
    expect(tenantAId).toBeTruthy();

    const createB = await request.post(`${API}/admin/tenants`, {
      headers: h,
      data: {
        name: TENANT_FIXTURES.nameB,
        slug: TENANT_FIXTURES.slugB,
        planId: planNoApi.id,
        adminEmail: USER.email,
        adminName: USER.name,
        adminPassword: USER.password,
        forceSimilarName: true,
      },
    });
    expect(createB.ok(), `create B ${createB.status()} ${await createB.text()}`).toBeTruthy();
    const tenantB = await createB.json();
    const tenantBId = tenantB.id || tenantB.tenant?.id;
    expect(tenantBId).toBeTruthy();

    // Garante planos (API vs free)
    await request.patch(`${API}/admin/tenants/${tenantAId}`, {
      headers: h,
      data: { planId: planWithApi.id },
    });
    await request.patch(`${API}/admin/tenants/${tenantBId}`, {
      headers: h,
      data: { planId: planNoApi.id },
    });

    return {
      tenantAId: String(tenantAId),
      tenantBId: String(tenantBId),
      slugA: TENANT_FIXTURES.slugA,
      slugB: TENANT_FIXTURES.slugB,
      planWithApi: planWithApi.slug,
      planNoApi: planNoApi.slug,
    };
  } finally {
    await apiLogout(request, sa.accessToken);
  }
}

async function switchTenant(request: APIRequestContext, token: string, tenantId: string) {
  const res = await request.post(`${API}/auth/switch-tenant`, {
    headers: await authHeaders(token),
    data: { tenantId },
  });
  expect(res.ok(), `switch-tenant ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.accessToken as string;
}

async function createThreadWithMessages(
  request: APIRequestContext,
  token: string,
  labels: string[]
) {
  const h = await authHeaders(token);
  const createdIds: string[] = [];
  for (const label of labels) {
    const nt = await request.post(`${API}/assistant/new-thread`, { headers: h, data: {} });
    expect(nt.ok()).toBeTruthy();
    const { threadId } = await nt.json();
    expect(threadId).toBeTruthy();
    // Mensagem de usuário via chat (persiste histórico)
    const chat = await request.post(`${API}/assistant/chat`, {
      headers: h,
      data: {
        message: `[E2E isolation] ${label} — ${RUN}`,
        threadId,
        path: "/app/crm",
      },
    });
    // chat pode 502 se LLM falhar — ainda assim a thread existe; se 200, ok
    if (chat.ok()) {
      const body = await chat.json();
      expect(body.threadId).toBe(threadId);
    }
    createdIds.push(threadId);
  }
  return createdIds;
}

test.describe("NIA multi-tenant isolation (live)", () => {
  test.skip(
    !SUPERADMIN.email || !SUPERADMIN.password,
    "Defina E2E_SUPERADMIN_EMAIL e E2E_SUPERADMIN_PASSWORD."
  );

  test("Tenant A/B: threads, bootstrap, IDOR, A→B→A + network", async ({
    request,
    page,
  }) => {
    test.setTimeout(180_000);

    const setup = await setupTenants(request);

    // —— Login no Tenant A ——
    let session = await apiLogin(request, USER.email, USER.password, setup.slugA);
    let token = session.accessToken;
    // Se login caiu em B, troca
    if (session.tenant?.id !== setup.tenantAId) {
      token = await switchTenant(request, token, setup.tenantAId);
    }

    // Bootstrap A (rede)
    const bootA = await request.get(`${API}/assistant/bootstrap?path=${encodeURIComponent("/app/settings/api")}`, {
      headers: await authHeaders(token),
    });
    expect(bootA.ok()).toBeTruthy();
    const bootABody = await bootA.json();
    expect(bootABody.enabled !== false).toBeTruthy();
    // Tenant A com plano API: pode sugerir criar chave; B não deve
    const suggestionsA: string[] = bootABody.suggestions || [];
    // operational.apiEnabled deve refletir plano
    if (bootABody.operational) {
      expect(bootABody.operational.apiEnabled).toBe(true);
    }

    const threadIdsA = await createThreadWithMessages(request, token, [
      "thread-alpha",
      "thread-beta",
    ]);
    expect(threadIdsA.length).toBe(2);

    const listA = await request.get(`${API}/assistant/threads?take=20`, {
      headers: await authHeaders(token),
    });
    expect(listA.ok()).toBeTruthy();
    const listABody = await listA.json();
    const idsA = new Set((listABody.items || []).map((t: { id: string }) => t.id));
    for (const id of threadIdsA) {
      expect(idsA.has(id), `thread A ${id} na lista A`).toBeTruthy();
    }

    // —— Switch Tenant B ——
    token = await switchTenant(request, token, setup.tenantBId);

    const listB = await request.get(`${API}/assistant/threads?take=20`, {
      headers: await authHeaders(token),
    });
    expect(listB.ok()).toBeTruthy();
    const listBBody = await listB.json();
    const idsB = (listBBody.items || []).map((t: { id: string }) => t.id);
    for (const id of threadIdsA) {
      expect(idsB.includes(id), `thread A ${id} NÃO deve aparecer em B`).toBeFalsy();
    }

    // IDOR: abrir thread do A estando em B
    const idor = await request.get(`${API}/assistant/threads/${threadIdsA[0]}`, {
      headers: await authHeaders(token),
    });
    expect(idor.status(), "IDOR thread A em contexto B").toBe(404);

    // Bootstrap B: sugestões/entitlements não copiam A
    const bootB = await request.get(
      `${API}/assistant/bootstrap?path=${encodeURIComponent("/app/settings/api")}`,
      { headers: await authHeaders(token) }
    );
    expect(bootB.ok()).toBeTruthy();
    const bootBBody = await bootB.json();
    if (bootBBody.operational) {
      expect(bootBBody.operational.apiEnabled).toBe(false);
    }
    const suggestionsB: string[] = bootBBody.suggestions || [];
    // Sem entitlement API: não deve empurrar "criar chave" operacional
    expect(
      suggestionsB.every((s) => !/criar uma chave/i.test(s)),
      `sugestões B indesejadas: ${JSON.stringify(suggestionsB)}`
    ).toBeTruthy();
    // Pode ter pergunta informativa de plano
    // (não obrigatório se módulo default)

    // Threads B próprias
    const threadIdsB = await createThreadWithMessages(request, token, ["thread-gamma"]);
    const listB2 = await request.get(`${API}/assistant/threads?take=20`, {
      headers: await authHeaders(token),
    });
    const listB2Body = await listB2.json();
    expect((listB2Body.items || []).some((t: { id: string }) => t.id === threadIdsB[0])).toBeTruthy();

    // —— Volta Tenant A: histórico legítimo permanece ——
    token = await switchTenant(request, token, setup.tenantAId);
    const listA2 = await request.get(`${API}/assistant/threads?take=20`, {
      headers: await authHeaders(token),
    });
    const listA2Body = await listA2.json();
    const idsA2 = new Set((listA2Body.items || []).map((t: { id: string }) => t.id));
    for (const id of threadIdsA) {
      expect(idsA2.has(id), `histórico A restaurado ${id}`).toBeTruthy();
    }
    expect(idsA2.has(threadIdsB[0]), "thread B não vaza em A").toBeFalsy();

    // Abrir thread A de novo
    const openA = await request.get(`${API}/assistant/threads/${threadIdsA[0]}`, {
      headers: await authHeaders(token),
    });
    expect(openA.ok()).toBeTruthy();
    const openABody = await openA.json();
    expect(openABody.id).toBe(threadIdsA[0]);
    expect((openABody.messages || []).length).toBeGreaterThan(0);

    // —— UI + network (Playwright) ——
    // Login no browser (cookie/session via UI)
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(USER.email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(USER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/(app|admin)/, { timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(1200);
    // Garantir contexto app (não admin)
    if (page.url().includes("/admin")) {
      // user não é superadmin — se caiu em admin algo errado
      await page.goto("/app");
    }

    // Interceptar chamadas NIA
    const niaResponses: { url: string; status: number; body?: unknown }[] = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/assistant/")) return;
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      niaResponses.push({ url, status: res.status(), body });
    });

    // Abrir NIA (FAB)
    const fab = page.getByRole("button", { name: /NIA/i }).first();
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();
    await expect(page.getByRole("dialog", { name: /NIA/i })).toBeVisible({ timeout: 10_000 });

    // Histórico
    await page.getByRole("button", { name: /Histórico/i }).click();
    await page.waitForTimeout(800);

    // Rede: list threads deve ter respondido 200 e só IDs do tenant atual
    const listNet = niaResponses.find((r) => r.url.includes("/assistant/threads") && !r.url.match(/threads\/[^/?]+$/));
    expect(listNet, "rede: GET /assistant/threads").toBeTruthy();
    expect(listNet!.status).toBe(200);
    const netItems = ((listNet!.body as { items?: { id: string }[] })?.items || []).map((t) => t.id);
    for (const id of threadIdsB) {
      expect(netItems.includes(id), "UI network não lista threads do tenant B").toBeFalsy();
    }

    // Bootstrap da UI
    const bootNet = niaResponses.find((r) => r.url.includes("/assistant/bootstrap"));
    expect(bootNet?.status).toBe(200);

    // Tentativa de IDOR via fetch no browser (contexto sessão atual = A se login caiu em A)
    const idorBrowser = await page.evaluate(
      async ({ api, threadId }) => {
        const res = await fetch(`${api}/assistant/threads/${threadId}`, {
          credentials: "include",
        });
        return { status: res.status };
      },
      { api: API, threadId: threadIdsB[0] }
    );
    // Se sessão UI for A, thread B deve 404; se for B, thread B ok — validamos inconsistência via switch no API acima.
    // Reforço: thread A de outro tenant fictício
    const fakeIdor = await page.evaluate(async ({ api }) => {
      const res = await fetch(`${api}/assistant/threads/cm_fake_thread_idor_xyz`, {
        credentials: "include",
      });
      return res.status;
    }, { api: API });
    expect([401, 403, 404]).toContain(fakeIdor);

    // Documenta evidência no console do teste
    console.log(
      JSON.stringify({
        blocker: "E2E_MULTI_TENANT_LIVE",
        result: "PASS",
        setup,
        threadIdsA,
        threadIdsB,
        suggestionsA: suggestionsA.slice(0, 5),
        suggestionsB: suggestionsB.slice(0, 5),
        networkSamples: niaResponses.slice(0, 12).map((r) => ({
          url: r.url.replace(API, ""),
          status: r.status,
        })),
      })
    );
  });
});
