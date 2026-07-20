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
