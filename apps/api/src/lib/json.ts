import { Prisma } from "@prisma/client";

/**
 * Converte objetos genéricos (ex.: z.record) para InputJsonValue do Prisma.
 * Prisma rejeita `Record<string, unknown>` por causa de `unknown` no valor.
 */
export function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Aceita undefined (omite o campo) ou valor JSON. */
export function asInputJsonOpt(
  value: unknown | undefined | null
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}
