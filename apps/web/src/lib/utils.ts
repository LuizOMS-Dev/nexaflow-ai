import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Data civil (vencimento) — não converter timezone. Aceita YYYY-MM-DD ou ISO UTC. */
export function formatCivilDate(value?: string | Date | null) {
  if (!value) return "—";
  if (typeof value === "string") {
    const dayOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dayOnly) {
      return `${dayOnly[3]}/${dayOnly[2]}/${dayOnly[1]}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

export function isUnlimitedCap(max?: number | null) {
  if (max == null) return true;
  return max === 999 || max >= 999_999;
}

export function formatQuota(used: number, max?: number | null) {
  if (isUnlimitedCap(max)) {
    return `${used.toLocaleString("pt-BR")} · Ilimitado`;
  }
  return `${used.toLocaleString("pt-BR")} de ${Number(max).toLocaleString("pt-BR")}`;
}

export function formatQuotaPercent(used: number, max?: number | null) {
  if (isUnlimitedCap(max) || !max || max <= 0) return null;
  const pct = (used / max) * 100;
  if (used > 0 && pct < 1) return "<1% utilizado";
  return `${Math.round(pct)}% utilizado`;
}

export function formatRelativeTime(date?: string | Date | null) {
  if (!date) return "—";
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (diff < 60) return "alguns segundos";
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export const commercialStatusLabel: Record<string, string> = {
  NOVO: "Novo",
  EM_ANALISE: "Em análise",
  QUALIFICADO: "Qualificado",
  NAO_QUALIFICADO: "Não qualificado",
  EM_NEGOCIACAO: "Em negociação",
  CLIENTE: "Cliente",
  PERDIDO: "Perdido",
  NUTRICAO: "Nutrição",
};

export const leadPriorityLabel: Record<string, string> = {
  BAIXA: "Baixa",
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const statusLabel: Record<string, string> = {
  OPEN: "Aberta",
  PENDING: "Pendente",
  CLOSED: "Encerrada",
  ARCHIVED: "Arquivada",
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

export function pluralizePt(count: number, singular: string, plural: string): string {
  return Math.abs(count) === 1 ? singular : plural;
}


