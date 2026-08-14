import { prisma } from "../lib/prisma";

/**
 * Registra evolução do score se mudou.
 * source: AI | RULE | MANUAL | AUTOMATION
 */
export async function recordScoreChange(params: {
  tenantId: string;
  contactId: string;
  previousScore: number;
  newScore: number;
  breakdown?: unknown;
  source?: string;
  note?: string | null;
}) {
  if (params.previousScore === params.newScore) return null;
  return prisma.contactScoreHistory.create({
    data: {
      tenantId: params.tenantId,
      contactId: params.contactId,
      previousScore: params.previousScore,
      newScore: params.newScore,
      breakdown: (params.breakdown as object) || undefined,
      source: params.source || "MANUAL",
      note: params.note || null,
    },
  });
}
