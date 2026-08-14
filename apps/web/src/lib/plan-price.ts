/**
 * Formatação de preço de catálogo — nunca exibir R$ 0,00 para Enterprise/sob consulta.
 */

export function formatCatalogPrice(
  plan: {
    priceMonthly?: number | string | null;
    priceOnRequest?: boolean | null;
    slug?: string | null;
  },
  opts?: { suffix?: boolean }
): string {
  if (plan.priceOnRequest || plan.slug === "enterprise") {
    return "Sob consulta";
  }
  const n = Number(plan.priceMonthly ?? 0);
  if (!Number.isFinite(n) || n <= 0) {
    if (plan.slug === "free") return "Gratuito";
    return "Sob consulta";
  }
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
  return opts?.suffix === false ? formatted : `${formatted}/mês`;
}

/** Slugs inválidos (fixtures / seed antigo) — free NÃO entra aqui */
const INVALID_PLAN_SLUGS = new Set([
  "basic",
  "premium",
  "trial",
  "demo",
  "test",
  "initial", // usar starter
]);

/**
 * Planos elegíveis para cadastro / troca de empresa.
 * - Gratuito (free) sempre entra (padrão de novos clientes)
 * - Demais: ativos e sem slug inválido
 */
export function isSelectableCompanyPlan(plan: {
  isActive?: boolean | null;
  slug?: string | null;
}): boolean {
  const slug = (plan.slug || "").toLowerCase();
  if (INVALID_PLAN_SLUGS.has(slug)) return false;
  if (slug === "free") return true;
  if (plan.isActive === false) return false;
  return true;
}

/** @deprecated use isSelectableCompanyPlan */
export function isCommercialPlan(plan: {
  isActive?: boolean | null;
  slug?: string | null;
  priceOnRequest?: boolean | null;
}): boolean {
  return isSelectableCompanyPlan(plan);
}

/** Planos elegíveis para cadastro / troca de empresa (inclui Gratuito) */
export function selectablePlansForCompany<
  T extends {
    isActive?: boolean | null;
    slug?: string | null;
    name?: string;
    priceMonthly?: number | string | null;
    priceOnRequest?: boolean | null;
  },
>(plans: T[]): T[] {
  return plans
    .filter((p) => isSelectableCompanyPlan(p))
    .sort((a, b) => {
      // free primeiro (padrão), depois catálogo pago
      const order = ["free", "starter", "pro", "business", "enterprise"];
      const ia = order.indexOf((a.slug || "").toLowerCase());
      const ib = order.indexOf((b.slug || "").toLowerCase());
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return (a.name || "").localeCompare(b.name || "", "pt-BR");
    });
}

/** Id do plano free no array (se existir) */
export function defaultCompanyPlanId<T extends { id: string; slug?: string | null }>(
  plans: T[]
): string {
  const free = plans.find((p) => (p.slug || "").toLowerCase() === "free");
  return free?.id || "";
}

/**
 * Label amigável no select de planos.
 * Free nunca vira "Gratuito · Gratuito · padrão".
 */
export function planSelectLabel(
  plan: {
    name: string;
    slug?: string | null;
    priceMonthly?: number | string | null;
    priceOnRequest?: boolean | null;
  },
  opts?: { asDefault?: boolean }
): string {
  const slug = (plan.slug || "").toLowerCase();
  const isFree =
    slug === "free" ||
    plan.name.trim().toLowerCase() === "gratuito" ||
    (Number(plan.priceMonthly) === 0 && !plan.priceOnRequest && slug !== "enterprise");

  if (isFree) {
    // Plano de teste / entrada na plataforma
    return opts?.asDefault
      ? "Gratuito — teste da plataforma (padrão)"
      : "Gratuito — teste da plataforma";
  }
  if (plan.priceOnRequest || slug === "enterprise") {
    return `${plan.name} · Sob consulta`;
  }
  const n = Number(plan.priceMonthly ?? 0);
  if (Number.isFinite(n) && n > 0) {
    const price = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
    return `${plan.name} · ${price}/mês`;
  }
  return plan.name;
}
