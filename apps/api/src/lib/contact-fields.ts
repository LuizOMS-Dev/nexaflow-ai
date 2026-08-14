/**
 * Validação e normalização de campos de contato (autoridade de negócio).
 * Telefone: dígitos E.164-ish (10–15), sem texto arbitrário.
 * Nome pode ser vazio se houver telefone válido (padrão WhatsApp).
 */

export function digitsOnly(input: string): string {
  return (input || "").replace(/\D/g, "");
}

/** Aceita apenas caracteres típicos de telefone (dígitos + formatação). */
export function looksLikePhoneInput(input: string): boolean {
  const t = (input || "").trim();
  if (!t) return false;
  return /^[\d\s+\-()./]+$/.test(t);
}

/**
 * Normaliza telefone para dígitos apenas.
 * BR: 10–11 locais; com 55 → 12–13; genérico E.164 até 15.
 */
export function normalizePhone(input: string): string | null {
  if (!looksLikePhoneInput(input)) return null;
  let d = digitsOnly(input);
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 10 || d.length > 15) return null;
  // rejeita sequências trivialmente inválidas (ex.: 0000000000)
  if (/^(\d)\1{9,}$/.test(d)) return null;
  return d;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/**
 * Variantes de armazenamento/busca para o mesmo número
 * (legado com "+", dígitos, com/sem 55).
 * Usado em dedupe e ingest WhatsApp — evita contato duplicado por máscara.
 */
export function phoneLookupVariants(input: string): string[] {
  const n = normalizePhone(input);
  if (!n) {
    const raw = digitsOnly(input);
    return raw ? [raw] : [];
  }
  const variants = new Set<string>([n, `+${n}`]);
  // BR: com DDI 55
  if (n.startsWith("55") && n.length >= 12) {
    const local = n.slice(2);
    variants.add(local);
    variants.add(`+${local}`);
    variants.add(`+${n}`);
  } else if (n.length === 10 || n.length === 11) {
    variants.add(`55${n}`);
    variants.add(`+55${n}`);
  }
  return [...variants];
}

export function isValidEmail(input: string): boolean {
  const t = (input || "").trim();
  if (!t) return true; // vazio = opcional
  if (t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(t);
}

export type ContactFieldIssue =
  | "PHONE_INVALID"
  | "PHONE_REQUIRED"
  | "EMAIL_INVALID"
  | "IDENTITY_REQUIRED";

export function contactIdentityOk(name?: string | null, phone?: string | null): boolean {
  const n = (name || "").trim();
  const p = phone ? normalizePhone(phone) : null;
  return Boolean(n || p);
}

/** Resolve nome persistido: nome digitado, senão telefone (padrão WA). */
export function resolveContactName(name?: string | null, phoneNormalized?: string | null): string {
  const n = (name || "").trim();
  if (n) return n.slice(0, 200);
  if (phoneNormalized) return phoneNormalized;
  return "";
}

export const CONTACT_FIELD_MESSAGES: Record<ContactFieldIssue, string> = {
  PHONE_INVALID: "Informe um telefone válido",
  PHONE_REQUIRED: "Informe um telefone",
  EMAIL_INVALID: "Informe um e-mail válido",
  IDENTITY_REQUIRED: "Informe nome ou telefone",
};
