import { z } from "zod";
import { env } from "./env";

const max = () => Math.min(100, env.maxPageSize || 100);

/** Query padrão de listagem — hard cap anti-DoS */
export function listQuerySchema(defaults?: { page?: number; limit?: number }) {
  return z.object({
    page: z.coerce.number().int().min(1).default(defaults?.page ?? 1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(max())
      .default(Math.min(defaults?.limit ?? 20, max())),
  });
}

export function clampLimit(limit: number | undefined, fallback = 20): number {
  const n = Number(limit ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max());
}
