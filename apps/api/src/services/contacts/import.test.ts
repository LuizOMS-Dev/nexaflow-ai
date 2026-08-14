import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../audit", () => ({ audit: vi.fn(async () => undefined) }));

vi.mock("../entitlements", () => ({
  getTenantLimits: vi.fn(),
}));

import { prisma } from "../../lib/prisma";
import { getTenantLimits } from "../entitlements";
import {
  collectImportLookups,
  importContacts,
  phoneExistsInSet,
} from "./import";

describe("collectImportLookups / phoneExistsInSet", () => {
  it("coleta variants de telefone e e-mail normalizado", () => {
    const { phones, emails } = collectImportLookups([
      { name: "Ana", phone: "11988887777", email: "Ana@Exemplo.com" },
      { name: "Bob", phone: "teste" },
      { name: "Cida" },
    ]);
    expect(phones).toEqual(expect.arrayContaining(["11988887777", "5511988887777"]));
    expect(emails).toEqual(["ana@exemplo.com"]);
  });

  it("detecta duplicata por variant (mesmo número, máscaras diferentes)", () => {
    const existing = new Set(["+5511988887777"]);
    expect(phoneExistsInSet("11988887777", existing)).toBe(true);
    expect(phoneExistsInSet("11977776666", existing)).toBe(false);
  });
});

describe("importContacts — batch de identidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantLimits).mockResolvedValue({ maxContacts: 10_000 } as never);
    vi.mocked(prisma.contact.count).mockResolvedValue(0);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "n" } as never);
  });

  it("faz findMany do lote (tenantId) e não findFirst por linha", async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { phone: "11988887777", email: null },
    ] as never);

    const r = await importContacts("ten-1", "user-1", [
      { name: "Ana", phone: "11988887777" },
      { name: "Ana 2", phone: "5511988887777" },
      { name: "Bruno", phone: "11977776666" },
    ]);

    expect(prisma.contact.findFirst).toBeUndefined();
    expect(prisma.contact.findMany).toHaveBeenCalled();
    for (const call of vi.mocked(prisma.contact.findMany).mock.calls) {
      expect(call[0]?.where).toMatchObject({ tenantId: "ten-1" });
    }
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(2);
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "ten-1", phone: "11977776666" }),
      })
    );
  });

  it("skipDuplicates=false não pré-carrega identidades e cria as duas linhas", async () => {
    const r = await importContacts(
      "ten-1",
      "user-1",
      [
        { name: "A", phone: "11988887777" },
        { name: "B", phone: "11988887777" },
      ],
      { skipDuplicates: false }
    );
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(0);
  });

  it("cota do plano é lida uma vez; estouro no primeiro create vira PLAN_LIMIT", async () => {
    vi.mocked(getTenantLimits).mockResolvedValue({ maxContacts: 0 } as never);
    await expect(
      importContacts("ten-1", "user-1", [{ name: "Ana", phone: "11988887777" }])
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_LIMIT" });
    expect(getTenantLimits).toHaveBeenCalledTimes(1);
    expect(prisma.contact.count).toHaveBeenCalledTimes(1);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("cota no meio do lote não relê o plano e aborta o restante", async () => {
    vi.mocked(getTenantLimits).mockResolvedValue({ maxContacts: 1 } as never);
    const r = await importContacts("ten-1", "user-1", [
      { name: "A", phone: "11988887777" },
      { name: "B", phone: "11977776666" },
      { name: "C", phone: "11966665555" },
    ]);
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(2);
    expect(getTenantLimits).toHaveBeenCalledTimes(1);
    expect(prisma.contact.count).toHaveBeenCalledTimes(1);
    expect(prisma.contact.create).toHaveBeenCalledTimes(1);
  });
});
