/**
 * Utilitários de apresentação de contato e formatação de telefone para a interface.
 */

export function cleanJid(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/@(c\.us|s\.whatsapp\.net|g\.us|broadcast|lid|newsletter)$/i, "")
    .trim();
}

export function formatPhone(input?: string | null): string {
  if (!input) return "";
  const cleaned = cleanJid(input);
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return cleaned;

  // Brasil com DDI 55
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
    }
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }

  // Brasil sem DDI (10 ou 11 dígitos)
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

  // Genérico internacional
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return cleaned;
}

export function isPhoneLike(val?: string | null): boolean {
  if (!val) return true;
  const t = val.trim();
  if (!t) return true;
  if (/@(c\.us|s\.whatsapp\.net|g\.us|broadcast)/i.test(t)) return true;
  const digits = t.replace(/[\s\-().+]/g, "");
  if (/^\d{8,16}$/.test(digits)) return true;
  return false;
}

export function getContactDisplayName(contact?: { name?: string | null; phone?: string | null } | null): string {
  if (!contact) return "Cliente";
  const name = (contact.name || "").trim();
  if (name && !isPhoneLike(name)) {
    return name;
  }
  const phone = contact.phone || contact.name;
  if (phone) {
    return formatPhone(phone);
  }
  return "Cliente";
}

export function getContactSecondaryText(contact?: { name?: string | null; phone?: string | null } | null): string {
  if (!contact) return "";
  const name = (contact.name || "").trim();
  // Se tem nome real e tem telefone, retorna o telefone formatado como linha secundária
  if (name && !isPhoneLike(name) && contact.phone) {
    return formatPhone(contact.phone);
  }
  return "";
}
