/**
 * NexaFlow Plans & Commercial Catalog Utilities
 * Regras de formatação, cálculo de desconto anual customizado e helpers de formulário
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
  activeCustomerCount?: number;
  isMostPopular?: boolean;
  _count?: { tenants: number };
};

export type PlanFormState = {
  name: string;
  slug: string;
  description: string;
  priceType: "fixed" | "on_request" | "free";
  priceMonthly: string;
  priceAnnual: string;
  annualPricingMode: "full" | "percentage" | "manual";
  discountMode: "0" | "5" | "10" | "15" | "20" | "25" | "30" | "custom";
  customDiscountPercent: string;
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

export const DISCOUNT_PRESET_OPTIONS = [
  { value: "0", label: "Sem desconto" },
  { value: "5", label: "5% de desconto" },
  { value: "10", label: "10% de desconto" },
  { value: "15", label: "15% de desconto" },
  { value: "20", label: "20% de desconto" },
  { value: "25", label: "25% de desconto" },
  { value: "30", label: "30% de desconto" },
  { value: "custom", label: "Personalizado..." },
];

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

/** Formatação de percentual (aceita números e strings pt-BR como 12,5) */
export function parsePercentInput(value: string): number {
  if (!value) return 0;
  const clean = value.replace(/[^0-9.,]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(99.99, num);
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
  const pct = ((fullYear - annual) / fullYear) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return rounded > 0 ? rounded : 0;
}

/** Formata percentual com até 2 casas decimais no padrão pt-BR */
export function formatDiscountPercent(pct: number): string {
  if (!pct || pct <= 0) return "0%";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(pct) + "%";
}

/** Calcula o valor anual com base em um percentual de desconto (ex: 15, 12.5) */
export function calculateAnnualPriceWithDiscount(monthly: number, discountPercent = 15): number {
  if (!monthly || monthly <= 0) return 0;
  const validPct = Math.max(0, Math.min(99.99, discountPercent));
  return Math.round(monthly * 12 * (1 - validPct / 100) * 100) / 100;
}

/** Calcula o valor anual cheio (sem desconto: mensal * 12) */
export function calculateFullAnnualPrice(monthly: number): number {
  if (!monthly || monthly <= 0) return 0;
  return Math.round(monthly * 12 * 100) / 100;
}

/** Calcula a economia monetária anual */
export function calculateAnnualSavings(monthly: number, annual: number | null | undefined): number {
  if (!monthly || monthly <= 0 || !annual || annual <= 0) return 0;
  const fullYear = monthly * 12;
  return Math.max(0, Math.round((fullYear - annual) * 100) / 100);
}

/** Identifica o modo do preset a partir do percentual */
export function detectDiscountMode(pct: number): { mode: PlanFormState["discountMode"]; customVal: string } {
  if (pct <= 0) return { mode: "0", customVal: "" };
  if (pct === 5) return { mode: "5", customVal: "" };
  if (pct === 10) return { mode: "10", customVal: "" };
  if (pct === 15) return { mode: "15", customVal: "" };
  if (pct === 20) return { mode: "20", customVal: "" };
  if (pct === 25) return { mode: "25", customVal: "" };
  if (pct === 30) return { mode: "30", customVal: "" };
  return { mode: "custom", customVal: pct.toString().replace(".", ",") };
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
    annualPricingMode: "full",
    discountMode: "0",
    customDiscountPercent: "",
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
  const isFree = p.slug === "free" || (Number(p.priceMonthly) === 0 && !isEnterprise);

  let pType: "fixed" | "on_request" | "free" = "fixed";
  if (isEnterprise) pType = "on_request";
  else if (isFree) pType = "free";

  const monthlyNum = p.priceMonthly != null ? Number(p.priceMonthly) : 0;
  const annualNum = p.priceAnnual != null ? Number(p.priceAnnual) : null;
  const discountPct = getAnnualDiscountPercent(monthlyNum, annualNum);
  const { mode, customVal } = detectDiscountMode(discountPct);

  let pricingMode: "full" | "percentage" | "manual" = "full";
  if (discountPct === 0) {
    pricingMode = "full";
  } else if (mode !== "custom") {
    pricingMode = "percentage";
  } else {
    pricingMode = "manual";
  }

  return {
    name: p.name,
    slug: p.slug,
    description: p.description || "",
    priceType: pType,
    priceMonthly: monthlyNum > 0 ? formatBrlInput(Math.round(monthlyNum * 100).toString()) : "",
    priceAnnual: annualNum != null && annualNum > 0 ? formatBrlInput(Math.round(annualNum * 100).toString()) : "",
    annualPricingMode: pricingMode,
    discountMode: mode,
    customDiscountPercent: customVal,
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
