import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";
import { asInputJson } from "../lib/json";
import { generateApiKeySecret } from "../services/api-keys";
import { hashPassword } from "../services/security/password";
import { cleanupTestTenant, testTenantSettings } from "../test/fixtures";

type ErrBody = { error?: string; code?: string; message?: string };
type ContactBody = {
  id: string;
  name?: string;
  phone?: string | null;
  company?: string | null;
  stage?: string | null;
};
type ListBody = { items: Array<{ id: string; name?: string }>; total: number };
type BulkRes = { ok?: boolean; affected: number };
type ImportRes = { created: number; invalid: number; skipped: number };

function errCode(payload: unknown): string | undefined {
  const b = payload as ErrBody;
  return b.code ?? b.error;
}

describe("Contatos 3.0 API — isolamento / RBAC / IDOR", () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let tokenAgent: string;
  let tokenReadonly: string;
  let tenantAId: string;
  let tenantBId: string;
  let userBId: string;
  let apiSecretA: string;
  const suffix = Date.now().toString(36);
  let phoneSeq = 0;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const passwordHash = await hashPassword("Test@Pass12345");
    const plan = await prisma.plan.findFirst();

    const tenantA = await prisma.tenant.create({
      data: {
        name: `C3 A ${suffix}`,
        slug: `c3-a-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "contacts-3-sec" }),
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: `C3 B ${suffix}`,
        slug: `c3-b-${suffix}`,
        planId: plan?.id,
        status: "ACTIVE",
        settings: testTenantSettings({ suite: "contacts-3-sec" }),
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        email: `c3a-${suffix}@test.nexaflow.local`,
        name: "Admin A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "ADMIN" } },
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `c3b-${suffix}@test.nexaflow.local`,
        name: "Admin B",
        passwordHash,
        memberships: { create: { tenantId: tenantB.id, role: "ADMIN" } },
      },
    });
    userBId = userB.id;

    await prisma.user.create({
      data: {
        email: `c3agent-${suffix}@test.nexaflow.local`,
        name: "Agent A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "AGENT", isActive: true } },
      },
    });
    await prisma.user.create({
      data: {
        email: `c3ro-${suffix}@test.nexaflow.local`,
        name: "Readonly A",
        passwordHash,
        memberships: { create: { tenantId: tenantA.id, role: "READONLY", isActive: true } },
      },
    });

    const { secret, prefix, hash } = generateApiKeySecret();
    apiSecretA = secret;
    await prisma.apiKey.create({
      data: {
        tenantId: tenantA.id,
        name: `c3-sec-${suffix}`,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: asInputJson(["conversations:read"]),
      },
    });

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test@Pass12345" },
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { accessToken: string }).accessToken;
    };

    tokenA = await login(`c3a-${suffix}@test.nexaflow.local`);
    tokenB = await login(`c3b-${suffix}@test.nexaflow.local`);
    tokenAgent = await login(`c3agent-${suffix}@test.nexaflow.local`);
    tokenReadonly = await login(`c3ro-${suffix}@test.nexaflow.local`);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestTenant(tenantAId);
    await cleanupTestTenant(tenantBId);
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function uniquePhone(): string {
    phoneSeq += 1;
    const n = `${Date.now()}${phoneSeq}`.slice(-8);
    return `1199${n}`;
  }

  async function createContactAs(
    token: string,
    payload: Record<string, unknown>
  ): Promise<ContactBody> {
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(token),
      payload,
    });
    expect(res.statusCode).toBe(200);
    return res.json() as ContactBody;
  }

  function expectNotFoundNoLeak(
    res: { statusCode: number; json: () => unknown; body: string },
    secret: string
  ) {
    expect(res.statusCode).toBe(404);
    expect(errCode(res.json())).toBe("NOT_FOUND");
    expect(res.body).not.toContain(secret);
    const parsed = res.json() as Record<string, unknown>;
    expect(parsed.id).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
    expect(parsed.email).toBeUndefined();
  }

  it("1. telefone 'teste' → 400 PHONE_INVALID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: { name: "X", phone: "teste" },
    });
    expect(res.statusCode).toBe(400);
    expect(errCode(res.json())).toBe("PHONE_INVALID");
  });

  it("2. IDOR GET/PATCH/DELETE (e score-history) de outro tenant → 404 sem leak", async () => {
    const victimName = `victim-${suffix}`;
    const victimPhone = uniquePhone();
    const created = await createContactAs(tokenA, {
      name: victimName,
      phone: victimPhone,
    });

    const attacks: InjectOptions[] = [
      { method: "GET", url: `/contacts/${created.id}` },
      {
        method: "PATCH",
        url: `/contacts/${created.id}`,
        payload: { name: "Hijacked" },
      },
      { method: "DELETE", url: `/contacts/${created.id}` },
      { method: "DELETE", url: `/contacts/${created.id}?force=true` },
      { method: "GET", url: `/contacts/${created.id}/score-history` },
    ];

    for (const attack of attacks) {
      const res = await app.inject({
        ...attack,
        headers: auth(tokenB),
      });
      expectNotFoundNoLeak(res, victimName);
      expect(res.body).not.toContain(victimPhone);
    }

    const still = await app.inject({
      method: "GET",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
    });
    expect(still.statusCode).toBe(200);
    expect((still.json() as ContactBody).name).toBe(victimName);
  });

  it("3. list isolada por tenant (query tenantId do client é ignorada)", async () => {
    const phone = uniquePhone();
    const created = await createContactAs(tokenA, { phone, name: `list-a-${suffix}` });

    const listA = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: auth(tokenA),
    });
    expect(listA.statusCode).toBe(200);
    expect((listA.json() as ListBody).items.some((i) => i.id === created.id)).toBe(true);

    const listB = await app.inject({
      method: "GET",
      url: `/contacts?tenantId=${tenantAId}&archived=all`,
      headers: auth(tokenB),
    });
    expect(listB.statusCode).toBe(200);
    const bodyB = listB.json() as ListBody;
    expect(bodyB.items.some((i) => i.id === created.id)).toBe(false);

    const listASpoof = await app.inject({
      method: "GET",
      url: `/contacts?tenantId=${tenantBId}&archived=all`,
      headers: auth(tokenA),
    });
    expect(listASpoof.statusCode).toBe(200);
    expect((listASpoof.json() as ListBody).items.some((i) => i.id === created.id)).toBe(true);
  });

  it("4. bulk ids com ID de outro tenant → affected 0 para o alheio", async () => {
    const a = await createContactAs(tokenA, { name: `bulk-own-${suffix}`, phone: uniquePhone() });
    const b = await createContactAs(tokenB, { name: `bulk-other-${suffix}`, phone: uniquePhone() });

    const bulk = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenA),
      payload: { action: "archive", mode: "ids", ids: [a.id, b.id] },
    });
    expect(bulk.statusCode).toBe(200);
    expect((bulk.json() as BulkRes).affected).toBe(1);

    const rowB = await prisma.contact.findUnique({ where: { id: b.id } });
    expect(rowB?.tenantId).toBe(tenantBId);
    expect(rowB?.stage).not.toBe("archived");

    const rowA = await prisma.contact.findUnique({ where: { id: a.id } });
    expect(rowA?.stage).toBe("archived");
  });

  it("5. bulk allMatching NÃO vaza tenant mesmo com filters.tenantId", async () => {
    // Nome só com letras: search também OR-match em phone.contains(digits),
    // então dígitos no termo inchariam o lote sem ser vazamento de tenant.
    const twin = `zzqTwinIsol${suffix.replace(/\d/g, "x")}`;
    const a = await createContactAs(tokenA, { name: twin, phone: uniquePhone() });
    const b = await createContactAs(tokenB, { name: twin, phone: uniquePhone() });

    const rowA0 = await prisma.contact.findUnique({ where: { id: a.id } });
    const rowB0 = await prisma.contact.findUnique({ where: { id: b.id } });
    expect(rowA0?.tenantId).toBe(tenantAId);
    expect(rowB0?.tenantId).toBe(tenantBId);

    const bulk = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenA),
      payload: {
        action: "archive",
        mode: "allMatching",
        filters: { tenantId: tenantBId, search: twin, archived: "all" },
      },
    });
    expect(bulk.statusCode).toBe(200);
    expect((bulk.json() as BulkRes).affected).toBe(1);

    const rowA = await prisma.contact.findUnique({ where: { id: a.id } });
    const rowB = await prisma.contact.findUnique({ where: { id: b.id } });
    expect(rowA?.stage).toBe("archived");
    expect(rowB?.stage).not.toBe("archived");
    expect(rowB?.tenantId).toBe(tenantBId);
  });

  it("6. DELETE sem contacts.delete (AGENT) → 403", async () => {
    const created = await createContactAs(tokenA, {
      name: `no-del-${suffix}`,
      phone: uniquePhone(),
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}`,
      headers: auth(tokenAgent),
    });
    expect(res.statusCode).toBe(403);
    expect(errCode(res.json())).toBe("FORBIDDEN");

    const still = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(still).not.toBeNull();
  });

  it("7. import CSV malformado / aspas / BOM não 500", async () => {
    const phone = uniquePhone();
    const malformed = `\uFEFF"nome","telefone"\n"Silva, João","${phone}"\n"aspas abertas sem fechar\n`;

    const preview = await app.inject({
      method: "POST",
      url: "/contacts/import/preview",
      headers: auth(tokenA),
      payload: { csv: malformed },
    });
    expect(preview.statusCode).toBeLessThan(500);
    expect(preview.statusCode).toBe(200);

    const imp = await app.inject({
      method: "POST",
      url: "/contacts/import",
      headers: auth(tokenA),
      payload: { csv: malformed, fieldMap: { nome: "name", telefone: "phone" } },
    });
    expect(imp.statusCode).toBeLessThan(500);
    expect(imp.statusCode).toBe(200);

    const emptyish = await app.inject({
      method: "POST",
      url: "/contacts/import/preview",
      headers: auth(tokenA),
      payload: { csv: '"' },
    });
    expect(emptyish.statusCode).toBeLessThan(500);
    expect([200, 400]).toContain(emptyish.statusCode);
  });

  it("8. import 'teste' incrementa invalid", async () => {
    const phone = uniquePhone();
    const csv = `nome,telefone\nValido,${phone}\nRuim,teste\n`;
    const preview = await app.inject({
      method: "POST",
      url: "/contacts/import/preview",
      headers: auth(tokenA),
      payload: { csv },
    });
    expect(preview.statusCode).toBe(200);
    expect((preview.json() as { rowCount: number }).rowCount).toBe(2);

    const imp = await app.inject({
      method: "POST",
      url: "/contacts/import",
      headers: auth(tokenA),
      payload: { csv, fieldMap: { nome: "name", telefone: "phone" } },
    });
    expect(imp.statusCode).toBe(200);
    const body = imp.json() as ImportRes;
    expect(body.created).toBeGreaterThanOrEqual(1);
    expect(body.invalid).toBeGreaterThanOrEqual(1);
  });

  it("9. DELETE sem force com conversation → 409 CONTACT_HAS_HISTORY", async () => {
    const created = await createContactAs(tokenA, {
      name: `hist-${suffix}`,
      phone: uniquePhone(),
    });
    await prisma.conversation.create({
      data: { tenantId: tenantAId, contactId: created.id, status: "OPEN" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
    });
    expect(res.statusCode).toBe(409);
    expect(errCode(res.json())).toBe("CONTACT_HAS_HISTORY");
    const body = res.json() as { conversations?: number };
    expect((body.conversations ?? 0) >= 1).toBe(true);

    const still = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(still).not.toBeNull();
  });

  it("10. force delete só com contacts.delete", async () => {
    const created = await createContactAs(tokenA, {
      name: `force-${suffix}`,
      phone: uniquePhone(),
    });
    await prisma.conversation.create({
      data: { tenantId: tenantAId, contactId: created.id, status: "OPEN" },
    });

    const agentDel = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}?force=true`,
      headers: auth(tokenAgent),
    });
    expect(agentDel.statusCode).toBe(403);
    expect(errCode(agentDel.json())).toBe("FORBIDDEN");

    const agentBulk = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenAgent),
      payload: {
        action: "delete",
        mode: "ids",
        ids: [created.id],
        payload: { force: true },
      },
    });
    expect(agentBulk.statusCode).toBe(403);
    expect(errCode(agentBulk.json())).toBe("FORBIDDEN");

    const still = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(still).not.toBeNull();

    const adminDel = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}?force=true`,
      headers: auth(tokenA),
    });
    expect(adminDel.statusCode).toBe(200);
    expect(await prisma.contact.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("11. public GET /api/v1/contacts → 404", async () => {
    const withKey = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
      headers: { authorization: `Bearer ${apiSecretA}` },
    });
    expect(withKey.statusCode).toBe(404);

    const postKey = await app.inject({
      method: "POST",
      url: "/api/v1/contacts",
      headers: { authorization: `Bearer ${apiSecretA}` },
      payload: { name: "Nope" },
    });
    expect(postKey.statusCode).toBe(404);

    const noKey = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
    });
    expect(noKey.statusCode).not.toBe(200);
    expect([401, 404]).toContain(noKey.statusCode);
  });

  it("13. responsibleUserId de outro tenant → 400 INVALID_RESPONSIBLE", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: {
        name: `resp-${suffix}`,
        phone: uniquePhone(),
        responsibleUserId: userBId,
      },
    });
    expect(create.statusCode).toBe(400);
    expect(errCode(create.json())).toBe("INVALID_RESPONSIBLE");

    const own = await createContactAs(tokenA, {
      name: `resp-own-${suffix}`,
      phone: uniquePhone(),
    });
    const patch = await app.inject({
      method: "PATCH",
      url: `/contacts/${own.id}`,
      headers: auth(tokenA),
      payload: { responsibleUserId: userBId },
    });
    expect(patch.statusCode).toBe(400);
    expect(errCode(patch.json())).toBe("INVALID_RESPONSIBLE");
  });

  it("14. mass assignment: body.tenantId não troca o tenant do contato", async () => {
    const phone = uniquePhone();
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: {
        name: `mass-${suffix}`,
        phone,
        tenantId: tenantBId,
        id: "attacker-chosen-id",
        customData: { x: 1 },
        scoreBreakdown: [{ factor: "x", delta: 99 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json() as ContactBody;
    expect(created.id).not.toBe("attacker-chosen-id");

    const row = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull();
    expect(row?.tenantId).toBe(tenantAId);
    expect(row?.tenantId).not.toBe(tenantBId);
    expect(row?.phone).toBeTruthy();

    const patch = await app.inject({
      method: "PATCH",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
      payload: { tenantId: tenantBId, name: `mass-patched-${suffix}` },
    });
    expect(patch.statusCode).toBe(200);
    const after = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(after?.tenantId).toBe(tenantAId);
    expect(after?.name).toBe(`mass-patched-${suffix}`);
  });

  it("15. identidade: nome vazio + phone válido persiste nome=telefone", async () => {
    const phone = uniquePhone();
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: { name: "   ", phone },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ContactBody;
    expect(body.phone).toBeTruthy();
    expect(body.name).toBe(body.phone);
    expect(body.name).toMatch(/^\d{10,15}$/);
  });

  it("16. identidade: sem nome e sem phone → 400 IDENTITY_REQUIRED", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: { name: "", phone: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(errCode(res.json())).toBe("IDENTITY_REQUIRED");
  });

  it("17. CRUD: create → get → patch → archive → restore → delete sem histórico", async () => {
    const phone = uniquePhone();
    const created = await createContactAs(tokenA, {
      name: `crud-${suffix}`,
      phone,
      company: "ACME",
    });

    const got = await app.inject({
      method: "GET",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
    });
    expect(got.statusCode).toBe(200);
    expect((got.json() as ContactBody).company).toBe("ACME");

    const patched = await app.inject({
      method: "PATCH",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
      payload: { company: "ACME 2" },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { company?: string }).company).toBe("ACME 2");

    const archived = await app.inject({
      method: "PATCH",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect((archived.json() as { stage?: string | null }).stage).toBe("archived");

    const listActive = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: auth(tokenA),
    });
    expect(listActive.statusCode).toBe(200);
    expect((listActive.json() as ListBody).items.some((i) => i.id === created.id)).toBe(false);

    const listArchived = await app.inject({
      method: "GET",
      url: "/contacts?archived=1",
      headers: auth(tokenA),
    });
    expect(listArchived.statusCode).toBe(200);
    expect((listArchived.json() as ListBody).items.some((i) => i.id === created.id)).toBe(true);

    const restored = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenA),
      payload: { action: "restore", mode: "ids", ids: [created.id] },
    });
    expect(restored.statusCode).toBe(200);
    expect((restored.json() as BulkRes).affected).toBe(1);
    const row = await prisma.contact.findUnique({ where: { id: created.id } });
    expect(row?.stage).not.toBe("archived");

    const listAfterRestore = await app.inject({
      method: "GET",
      url: "/contacts",
      headers: auth(tokenA),
    });
    expect((listAfterRestore.json() as ListBody).items.some((i) => i.id === created.id)).toBe(
      true
    );

    const del = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
    });
    expect(del.statusCode).toBe(200);
    expect(await prisma.contact.findUnique({ where: { id: created.id } })).toBeNull();

    const gone = await app.inject({
      method: "GET",
      url: `/contacts/${created.id}`,
      headers: auth(tokenA),
    });
    expect(gone.statusCode).toBe(404);
  });

  it("18. bulk allMatching + excludeIds não arquiva o excluído (nem outro tenant)", async () => {
    const mark = `zzqBlkEx${suffix.replace(/\d/g, "x")}`;
    const keep = await createContactAs(tokenA, { name: mark, phone: uniquePhone() });
    const hit1 = await createContactAs(tokenA, { name: mark, phone: uniquePhone() });
    const hit2 = await createContactAs(tokenA, { name: mark, phone: uniquePhone() });
    const other = await createContactAs(tokenB, { name: mark, phone: uniquePhone() });

    const bulk = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenA),
      payload: {
        action: "archive",
        mode: "allMatching",
        excludeIds: [keep.id, other.id],
        filters: { search: mark, archived: "all" },
      },
    });
    expect(bulk.statusCode).toBe(200);
    expect((bulk.json() as BulkRes).affected).toBe(2);

    expect((await prisma.contact.findUnique({ where: { id: keep.id } }))?.stage).not.toBe(
      "archived"
    );
    expect((await prisma.contact.findUnique({ where: { id: hit1.id } }))?.stage).toBe("archived");
    expect((await prisma.contact.findUnique({ where: { id: hit2.id } }))?.stage).toBe("archived");
    expect((await prisma.contact.findUnique({ where: { id: other.id } }))?.stage).not.toBe(
      "archived"
    );
    expect((await prisma.contact.findUnique({ where: { id: other.id } }))?.tenantId).toBe(
      tenantBId
    );
  });

  it("19. import skipDuplicates (default) não recria telefone existente", async () => {
    const existingPhone = uniquePhone();
    const freshPhone = uniquePhone();
    await createContactAs(tokenA, { name: `imp-dup-${suffix}`, phone: existingPhone });

    const csv = `nome,telefone\nJaExiste,${existingPhone}\nNovo,${freshPhone}\nTambemJa,${existingPhone}\n`;
    const imp = await app.inject({
      method: "POST",
      url: "/contacts/import",
      headers: auth(tokenA),
      payload: { csv, fieldMap: { nome: "name", telefone: "phone" } },
    });
    expect(imp.statusCode).toBe(200);
    const body = imp.json() as ImportRes;
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(2);
    expect(body.invalid).toBe(0);

    const list = await prisma.contact.count({
      where: { tenantId: tenantAId, phone: existingPhone },
    });
    expect(list).toBe(1);
  });

  it("20. import CSV BOM + ; + aspas cria nome com vírgula", async () => {
    const phone = uniquePhone();
    const csv = `\uFEFF"nome";"telefone"\n"Silva, João";${phone}\n`;
    const preview = await app.inject({
      method: "POST",
      url: "/contacts/import/preview",
      headers: auth(tokenA),
      payload: { csv },
    });
    expect(preview.statusCode).toBe(200);
    const prev = preview.json() as { delimiter: string; rowCount: number; headers: string[] };
    expect(prev.delimiter).toBe(";");
    expect(prev.rowCount).toBe(1);
    expect(prev.headers[0]).toBe("nome");

    const imp = await app.inject({
      method: "POST",
      url: "/contacts/import",
      headers: auth(tokenA),
      payload: { csv, fieldMap: { nome: "name", telefone: "phone" } },
    });
    expect(imp.statusCode).toBe(200);
    expect((imp.json() as ImportRes).created).toBe(1);

    const row = await prisma.contact.findFirst({
      where: { tenantId: tenantAId, phone },
    });
    expect(row?.name).toBe("Silva, João");
  });

  it("21. DUPLICATE_PHONE 409 no mesmo tenant; mesmo número em outro tenant é ok", async () => {
    const phone = uniquePhone();
    const first = await createContactAs(tokenA, { name: `dup-a-${suffix}`, phone });

    const again = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenA),
      payload: { name: `dup-a2-${suffix}`, phone },
    });
    expect(again.statusCode).toBe(409);
    expect(errCode(again.json())).toBe("DUPLICATE_PHONE");
    expect((again.json() as { contactId?: string }).contactId).toBe(first.id);

    const otherTenant = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenB),
      payload: { name: `dup-b-${suffix}`, phone },
    });
    expect(otherTenant.statusCode).toBe(200);
    expect((otherTenant.json() as ContactBody).id).not.toBe(first.id);
  });

  it("22. AGENT cria/atualiza; READONLY só lê; AGENT/READONLY não deletam", async () => {
    const created = await createContactAs(tokenAgent, {
      name: `agent-crud-${suffix}`,
      phone: uniquePhone(),
    });

    const patch = await app.inject({
      method: "PATCH",
      url: `/contacts/${created.id}`,
      headers: auth(tokenAgent),
      payload: { company: "Agent Co" },
    });
    expect(patch.statusCode).toBe(200);

    const roCreate = await app.inject({
      method: "POST",
      url: "/contacts",
      headers: auth(tokenReadonly),
      payload: { name: `ro-${suffix}`, phone: uniquePhone() },
    });
    expect(roCreate.statusCode).toBe(403);

    const roPatch = await app.inject({
      method: "PATCH",
      url: `/contacts/${created.id}`,
      headers: auth(tokenReadonly),
      payload: { name: "Hijack" },
    });
    expect(roPatch.statusCode).toBe(403);

    const roGet = await app.inject({
      method: "GET",
      url: `/contacts/${created.id}`,
      headers: auth(tokenReadonly),
    });
    expect(roGet.statusCode).toBe(200);

    const roDel = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}`,
      headers: auth(tokenReadonly),
    });
    expect(roDel.statusCode).toBe(403);

    const agentDel = await app.inject({
      method: "DELETE",
      url: `/contacts/${created.id}`,
      headers: auth(tokenAgent),
    });
    expect(agentDel.statusCode).toBe(403);
    expect(errCode(agentDel.json())).toBe("FORBIDDEN");
    expect(await prisma.contact.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("23. bulk delete sem force com histórico → 409 CONTACT_HAS_HISTORY", async () => {
    const created = await createContactAs(tokenA, {
      name: `bulk-hist-${suffix}`,
      phone: uniquePhone(),
    });
    await prisma.conversation.create({
      data: { tenantId: tenantAId, contactId: created.id, status: "OPEN" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/contacts/bulk",
      headers: auth(tokenA),
      payload: { action: "delete", mode: "ids", ids: [created.id] },
    });
    expect(res.statusCode).toBe(409);
    expect(errCode(res.json())).toBe("CONTACT_HAS_HISTORY");
    expect(await prisma.contact.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("24. sem auth → 401; GET /contacts não aceita tenantId do client para vazar B", async () => {
    const anon = await app.inject({ method: "GET", url: "/contacts" });
    expect(anon.statusCode).toBe(401);

    const secretName = `iso-b-${suffix}`;
    const bOnly = await createContactAs(tokenB, { name: secretName, phone: uniquePhone() });

    const spoof = await app.inject({
      method: "GET",
      url: `/contacts?search=${encodeURIComponent(secretName)}&archived=all&tenantId=${tenantBId}`,
      headers: auth(tokenA),
    });
    expect(spoof.statusCode).toBe(200);
    expect((spoof.json() as ListBody).items.some((i) => i.id === bOnly.id)).toBe(false);
  });
});
