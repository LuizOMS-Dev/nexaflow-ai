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

/**
 * Remove sufixos de JID do WhatsApp (@c.us, @s.whatsapp.net, @g.us, etc).
 */
export function cleanJid(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/@(c\.us|s\.whatsapp\.net|g\.us|broadcast|lid|newsletter)$/i, "")
    .trim();
}

/**
 * Formata telefone para exibição humana agradável.
 * Exemplo BR: +55 (11) 98888-7777 ou +55 (34) 99999-9999
 */
export function formatDisplayPhone(input?: string | null): string {
  if (!input) return "";
  const cleaned = cleanJid(input);
  const digits = digitsOnly(cleaned);
  if (!digits) return cleaned;

  // Brasil com DDI: 55 + DDD (2) + 9 dígitos ou 8 dígitos
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
    }
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }

  // Brasil sem DDI: DDD (2) + 9 ou 8 dígitos
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const num = digits.slice(2);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const num = digits.slice(2);
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }

  // Outros formatos internacionais (E.164 genérico)
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return cleaned;
}

/**
 * Verifica se uma string parece com um telefone ou identificador técnico em vez de nome real.
 */
export function isPhoneOrJidLike(name?: string | null): boolean {
  if (!name) return true;
  const t = name.trim();
  if (!t) return true;
  if (/@(c\.us|s\.whatsapp\.net|g\.us|broadcast)/i.test(t)) return true;
  if (/^\+?\d{8,16}$/.test(t.replace(/[\s\-().]/g, ""))) return true;
  return false;
}

/**
 * Resolve o nome canônico do contato com prioridade estrita:
 * 1. Nome já salvo e customizado pelo operador (não é telefone/JID)
 * 2. pushName confiável vindo do WhatsApp
 * 3. Fallback: telefone formatado amigavelmente
 */
export function resolveContactNameWithPriority(params: {
  currentName?: string | null;
  pushName?: string | null;
  phone: string;
}): string {
  const current = (params.currentName || "").trim();
  if (current && !isPhoneOrJidLike(current)) {
    return current.slice(0, 200);
  }

  const push = cleanJid(params.pushName);
  if (push && !isPhoneOrJidLike(push) && push.length >= 2) {
    return push.slice(0, 200);
  }

  return formatDisplayPhone(params.phone);
}

/** Resolve nome persistido legado. */
export function resolveContactName(name?: string | null, phoneNormalized?: string | null): string {
  const n = (name || "").trim();
  if (n && !isPhoneOrJidLike(n)) return n.slice(0, 200);
  if (phoneNormalized) return formatDisplayPhone(phoneNormalized);
  return "";
}

export const CONTACT_FIELD_MESSAGES: Record<ContactFieldIssue, string> = {
  PHONE_INVALID: "Informe um telefone válido",
  PHONE_REQUIRED: "Informe um telefone",
  EMAIL_INVALID: "Informe um e-mail válido",
  IDENTITY_REQUIRED: "Informe nome ou telefone",
};
