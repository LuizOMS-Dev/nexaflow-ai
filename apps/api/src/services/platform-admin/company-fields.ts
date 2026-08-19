import { AppError } from "../../lib/errors";

export const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const UF_SET = new Set<string>(BRAZIL_UFS);

export function normalizeCnpj(raw?: string | null): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 14) {
    throw new AppError("CNPJ deve ter 14 dígitos.", 400, "INVALID_CNPJ");
  }
  if (/^(\d)\1{13}$/.test(digits)) {
    throw new AppError("CNPJ inválido.", 400, "INVALID_CNPJ");
  }
  return digits;
}

export function formatCnpj(digits?: string | null): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length !== 14) return digits || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function normalizePhone(raw?: string | null): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    throw new AppError("Telefone inválido.", 400, "INVALID_PHONE");
  }
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

export function normalizeEmail(raw?: string | null): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new AppError("E-mail comercial inválido.", 400, "INVALID_EMAIL");
  }
  return v;
}

export function normalizeWebsite(raw?: string | null): string | null {
  if (raw == null) return null;
  let v = String(raw).trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new AppError("URL do site inválida.", 400, "INVALID_WEBSITE");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("O site deve usar http ou https.", 400, "INVALID_WEBSITE");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new AppError("URL do site inválida.", 400, "INVALID_WEBSITE");
  }
  return url.toString();
}

export function normalizeUf(raw?: string | null): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().toUpperCase();
  if (!v) return null;
  if (!UF_SET.has(v)) {
    throw new AppError("UF inválida.", 400, "INVALID_UF");
  }
  return v;
}

export function normalizeColor(raw?: string | null): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) {
    throw new AppError("Cor deve estar no formato #RRGGBB.", 400, "INVALID_COLOR");
  }
  return v.toLowerCase();
}

export function normalizeTimezone(raw?: string | null): string {
  const v = (raw || "").trim() || "America/Sao_Paulo";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: v });
  } catch {
    throw new AppError("Fuso horário inválido.", 400, "INVALID_TIMEZONE");
  }
  return v;
}
