/**
 * NexaFlow Plans & Commercial Catalog Utilities
 * Regras de formatação, cálculo de desconto anual e helpers de formulário
 */

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceMonthly: string | number;
  priceAnnual?: string | number | null;
  priceOnRequest?: boolean;
  maxUsers: number;
  maxChannels: number;
  maxContacts: number;
  maxConversations: number;
  maxAiMessages: number;
  badge?: string | null;
  sortOrder?: number;
  isActive: boolean;
  features?: Record<string, unknown> | null;
  _count?: { tenants: number };
};

export type PlanFormState = {
  name: string;
  slug: string;
  description: string;
  priceType: "fixed" | "on_request" | "free";
  priceMonthly: string;
  priceAnnual: string;
  maxUsers: string;
  maxChannels: string;
  maxAgents: string;
  maxContacts: string;
  maxActiveFlows: string;
  maxAiMessages: string;
  isActive: boolean;
  badge: string;
  sortOrder: string;
};

export const PRICE_TYPE_OPTIONS = [
  { value: "fixed", label: "Preço fixo comercial" },
  { value: "on_request", label: "Sob consulta (Enterprise)" },
  { value: "free", label: "Gratuito" },
];

export const BADGE_OPTIONS = [
  { value: "", label: "Nenhum" },
  { value: "popular", label: "Mais popular" },
  { value: "recommended", label: "Recomendado" },
  { value: "best_value", label: "Melhor custo-benefício" },
];

export const BADGE_LABEL: Record<string, string> = {
  popular: "Mais popular",
  recommended: "Recomendado",
  best_value: "Melhor custo-benefício",
};

/** Formatação BRL (centavos para visualização R$) */
export function formatBrlInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Conversão de string formatada para float monetário */
export function parseBrlInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

/** Formatação de número inteiro para visualização brasileira */
export function formatIntegerInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return num.toLocaleString("pt-BR");
}

/** Conversão de string para inteiro puro com fallback seguro */
export function parseIntegerInput(value: string, fallback = 0): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return fallback;
  return parseInt(digits, 10);
}

/** Normalização de slugs de plano (acentos, espaços, múltiplos hífens) */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Retorna o percentual de desconto anual arredondado se annual < monthly * 12.
 * Se annual >= monthly * 12 ou valores nulos/inválidos, retorna 0 (nunca negativo).
 */
export function getAnnualDiscountPercent(monthly: number, annual: number | null | undefined): number {
  if (!monthly || monthly <= 0 || !annual || annual <= 0) return 0;
  const fullYear = monthly * 12;
  if (annual >= fullYear) return 0;
  const pct = Math.round((1 - annual / fullYear) * 100);
  return pct > 0 ? pct : 0;
}

/** Calcula o valor anual com base em um percentual de desconto (padrão 15%) */
export function calculateAnnualPriceWithDiscount(monthly: number, discountPercent = 15): number {
  if (!monthly || monthly <= 0) return 0;
  return Math.round(monthly * 12 * (1 - discountPercent / 100) * 100) / 100;
}

/** Calcula o valor anual cheio (sem desconto: mensal * 12) */
export function calculateFullAnnualPrice(monthly: number): number {
  if (!monthly || monthly <= 0) return 0;
  return Math.round(monthly * 12 * 100) / 100;
}

/** Estado inicial rigorosamente limpo para o modal de Novo Plano (zero state leakage) */
export function emptyForm(): PlanFormState {
  return {
    name: "",
    slug: "",
    description: "",
    priceType: "fixed",
    priceMonthly: "",
    priceAnnual: "",
    maxUsers: "1",
    maxChannels: "1",
    maxAgents: "1",
    maxContacts: "500",
    maxActiveFlows: "5",
    maxAiMessages: "100",
    isActive: true,
    badge: "",
    sortOrder: "100",
  };
}

/** Converte um plano existente do banco para o estado do formulário */
export function planToForm(p: Plan): PlanFormState {
  const feats = (p.features || {}) as Record<string, unknown>;
  const isEnterprise = Boolean(p.priceOnRequest) || p.slug === "enterprise";
  const isFree = p.slug === "free" || Number(p.priceMonthly) === 0 && !isEnterprise;

  let pType: "fixed" | "on_request" | "free" = "fixed";
  if (isEnterprise) pType = "on_request";
  else if (isFree) pType = "free";

  return {
    name: p.name,
    slug: p.slug,
    description: p.description || "",
    priceType: pType,
    priceMonthly: p.priceMonthly != null && Number(p.priceMonthly) > 0 ? formatBrlInput(Math.round(Number(p.priceMonthly) * 100).toString()) : "",
    priceAnnual: p.priceAnnual != null && Number(p.priceAnnual) > 0 ? formatBrlInput(Math.round(Number(p.priceAnnual) * 100).toString()) : "",
    maxUsers: p.maxUsers != null ? formatIntegerInput(p.maxUsers.toString()) : "1",
    maxChannels: p.maxChannels != null ? formatIntegerInput(p.maxChannels.toString()) : "1",
    maxAgents: feats.maxAgents != null ? formatIntegerInput(String(feats.maxAgents)) : "1",
    maxContacts: p.maxContacts != null ? formatIntegerInput(p.maxContacts.toString()) : "500",
    maxActiveFlows: feats.maxActiveFlows != null ? formatIntegerInput(String(feats.maxActiveFlows)) : "5",
    maxAiMessages: p.maxAiMessages != null ? formatIntegerInput(p.maxAiMessages.toString()) : "100",
    isActive: p.isActive,
    badge: p.badge || "",
    sortOrder: (p.sortOrder ?? 100).toString(),
  };
}
