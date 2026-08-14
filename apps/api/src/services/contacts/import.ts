/**
 * Contatos 3.0 — preview e commit de import CSV.
 * Parser: csv-parse.ts (não usa split(",") ).
 */

import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import {
  contactIdentityOk,
  isValidEmail,
  normalizePhone,
  phoneLookupVariants,
  resolveContactName,
} from "../../lib/contact-fields";
import { audit } from "../audit";
import { getTenantLimits } from "../entitlements";
import { parseCsv, rowsToObjects, suggestFieldMap } from "./csv-parse";

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_CHARS = 2_000_000;

const IMPORT_FIELDS = new Set([
  "name",
  "phone",
  "email",
  "company",
  "jobTitle",
  "city",
  "state",
  "source",
  "document",
  "notes",
]);

export type ImportRow = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  source?: string;
  document?: string;
  notes?: string;
};

export type ImportPreview = {
  headers: string[];
  delimiter: string;
  rowCount: number;
  warnings: string[];
  suggestedMap: Record<string, string>;
  sample: Record<string, string>[];
};

function assignImportField(out: ImportRow, field: string, value: string) {
  if (!IMPORT_FIELDS.has(field)) return;
  out[field as keyof ImportRow] = value;
}

export function previewContactImport(csv: string, delimiter?: string): ImportPreview {
  const parsed = parseCsv(csv, delimiter);
  if (parsed.rows.length > IMPORT_MAX_ROWS) {
    throw new AppError(`Máximo ${IMPORT_MAX_ROWS} linhas de dados`, 400, "IMPORT_TOO_LARGE");
  }
  const suggestedMap = suggestFieldMap(parsed.headers);
  const sample = parsed.rows.slice(0, 5).map((r) => {
    const o: Record<string, string> = {};
    parsed.headers.forEach((h, i) => {
      o[h || `col_${i}`] = r[i] ?? "";
    });
    return o;
  });

  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    rowCount: parsed.rows.length,
    warnings: parsed.warnings,
    suggestedMap,
    sample,
  };
}

export function mapCsvToImportRows(
  csv: string,
  fieldMap?: Record<string, string>,
  delimiter?: string
): ImportRow[] {
  const parsed = parseCsv(csv, delimiter);
  if (parsed.rows.length > IMPORT_MAX_ROWS) {
    throw new AppError(`Máximo ${IMPORT_MAX_ROWS} linhas`, 400, "IMPORT_TOO_LARGE");
  }
  const map = fieldMap || suggestFieldMap(parsed.headers);
  const objects = rowsToObjects(parsed.headers, parsed.rows);
  return objects.map((o) => {
    const out: ImportRow = {};
    for (const [header, field] of Object.entries(map)) {
      if (field && field !== "skip" && o[header] !== undefined) {
        assignImportField(out, field, o[header]);
      }
    }
    return out;
  });
}

/** Tamanho do IN no prefetch de identidade (phones/emails do lote, nunca o tenant inteiro). */
export const IMPORT_IDENTITY_IN_CHUNK = 2000;

export function collectImportLookups(rows: ImportRow[]): { phones: string[]; emails: string[] } {
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const row of rows) {
    const phoneRaw = row.phone?.trim();
    if (phoneRaw) {
      const n = normalizePhone(phoneRaw);
      if (n) {
        for (const v of phoneLookupVariants(n)) phones.add(v);
      }
    }
    const emailRaw = row.email?.trim();
    if (emailRaw && isValidEmail(emailRaw)) {
      emails.add(emailRaw.toLowerCase());
    }
  }
  return { phones: [...phones], emails: [...emails] };
}

/** Equivale a findPhoneDuplicate: stored phone ∈ variants(incoming). */
export function phoneExistsInSet(phoneNormalized: string, existingPhones: Set<string>): boolean {
  return phoneLookupVariants(phoneNormalized).some((v) => existingPhones.has(v));
}

function chunkValues(values: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < values.length; i += IMPORT_IDENTITY_IN_CHUNK) {
    out.push(values.slice(i, i + IMPORT_IDENTITY_IN_CHUNK));
  }
  return out;
}

async function loadExistingIdentities(tenantId: string, rows: ImportRow[]) {
  const { phones: phoneKeys, emails: emailKeys } = collectImportLookups(rows);
  const phones = new Set<string>();
  const emails = new Set<string>();

  const [phoneChunks, emailChunks] = await Promise.all([
    Promise.all(
      chunkValues(phoneKeys).map((chunk) =>
        prisma.contact.findMany({
          where: { tenantId, phone: { in: chunk } },
          select: { phone: true },
        })
      )
    ),
    Promise.all(
      chunkValues(emailKeys).map((chunk) =>
        prisma.contact.findMany({
          where: { tenantId, email: { in: chunk } },
          select: { email: true },
        })
      )
    ),
  ]);

  for (const found of phoneChunks) {
    for (const row of found) if (row.phone) phones.add(row.phone);
  }
  for (const found of emailChunks) {
    for (const row of found) if (row.email) emails.add(row.email.toLowerCase());
  }
  return { phones, emails };
}

export async function importContacts(
  tenantId: string,
  userId: string,
  rows: ImportRow[],
  opts?: { skipDuplicates?: boolean }
) {
  const skipDuplicates = opts?.skipDuplicates !== false;
  let created = 0;
  let skipped = 0;
  let invalid = 0;
  const errors: Array<{ row: number; message: string }> = [];

  const existing = skipDuplicates
    ? await loadExistingIdentities(tenantId, rows)
    : { phones: new Set<string>(), emails: new Set<string>() };

  let quotaReady = false;
  let remainingSlots = 0;
  let maxContacts = 0;

  async function assertHasContactSlot() {
    if (!quotaReady) {
      const limits = await getTenantLimits(tenantId);
      maxContacts = limits.maxContacts;
      const used = await prisma.contact.count({ where: { tenantId } });
      remainingSlots = maxContacts - used;
      quotaReady = true;
    }
    if (remainingSlots <= 0) {
      throw new AppError(
        `Seu plano permite até ${maxContacts.toLocaleString("pt-BR")} contatos.`,
        403,
        "PLAN_LIMIT_CONTACTS"
      );
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      const phoneRaw = row.phone?.trim();
      let phone: string | null = null;
      if (phoneRaw) {
        phone = normalizePhone(phoneRaw);
        if (!phone) {
          invalid++;
          errors.push({ row: rowNum, message: "Telefone inválido" });
          continue;
        }
      }
      const name = (row.name || "").trim();
      if (!contactIdentityOk(name, phone)) {
        invalid++;
        errors.push({ row: rowNum, message: "Nome ou telefone obrigatório" });
        continue;
      }
      let email: string | null = null;
      if (row.email?.trim()) {
        if (!isValidEmail(row.email)) {
          invalid++;
          errors.push({ row: rowNum, message: "E-mail inválido" });
          continue;
        }
        email = row.email.trim().toLowerCase();
      }

      if (skipDuplicates) {
        if (phone && phoneExistsInSet(phone, existing.phones)) {
          skipped++;
          continue;
        }
        if (email && existing.emails.has(email)) {
          skipped++;
          continue;
        }
      }

      try {
        await assertHasContactSlot();
      } catch (e) {
        const planHit = e instanceof AppError && e.code.startsWith("PLAN_LIMIT");
        if (planHit && created === 0) {
          throw new AppError(e.message, 403, "PLAN_LIMIT");
        }
        errors.push({ row: rowNum, message: "Limite de contatos do plano atingido" });
        skipped += rows.length - i;
        break;
      }

      await prisma.contact.create({
        data: {
          tenantId,
          name: resolveContactName(name, phone),
          phone,
          email,
          company: row.company?.trim() || null,
          jobTitle: row.jobTitle?.trim() || null,
          city: row.city?.trim() || null,
          state: row.state?.trim() || null,
          document: row.document?.trim() || null,
          notes: row.notes?.trim() || null,
          source: row.source?.trim() || "import",
        },
      });
      created++;
      remainingSlots -= 1;
      if (skipDuplicates) {
        if (phone) existing.phones.add(phone);
        if (email) existing.emails.add(email);
      }
    } catch (e) {
      if (e instanceof AppError && e.code === "PLAN_LIMIT") throw e;
      invalid++;
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Erro ao importar",
      });
    }
  }

  await audit({
    tenantId,
    userId,
    action: "contact.import",
    entity: "contact",
    entityId: "import",
    metadata: { created, skipped, invalid, total: rows.length },
  });

  return { created, skipped, invalid, errors: errors.slice(0, 50) };
}

export async function commitContactImport(
  tenantId: string,
  userId: string,
  input: {
    csv?: string;
    delimiter?: string;
    fieldMap?: Record<string, string>;
    rows?: ImportRow[];
    skipDuplicates?: boolean;
  }
) {
  let rows = input.rows;
  if (!rows && input.csv) {
    rows = mapCsvToImportRows(input.csv, input.fieldMap, input.delimiter);
  }
  if (!rows?.length) {
    throw new AppError("Nenhuma linha para importar", 400);
  }
  return importContacts(tenantId, userId, rows, { skipDuplicates: input.skipDuplicates });
}
