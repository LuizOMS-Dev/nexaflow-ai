/**
 * Modelo de qualificação NexaFlow:
 * Status + Prioridade + Score (0–100 + breakdown) + Próxima ação
 * Substitui quente/morno/frio.
 */

export const LEAD_STATUSES = [
  "NOVO",
  "EM_ANALISE",
  "QUALIFICADO",
  "NAO_QUALIFICADO",
  "EM_NEGOCIACAO",
  "CLIENTE",
  "PERDIDO",
  "NUTRICAO",
] as const;

export const LEAD_PRIORITIES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;

export type LeadStatusCode = (typeof LEAD_STATUSES)[number];
export type LeadPriorityCode = (typeof LEAD_PRIORITIES)[number];

export type ScoreFactor = {
  factor: string;
  delta: number;
  label: string;
};

/** Mapeamento legado temperature → novo modelo (migração / IA antiga) */
export function mapLegacyTemperature(temp?: string | null): {
  commercialStatus: LeadStatusCode;
  priority: LeadPriorityCode;
  scoreSeed: number;
} {
  switch ((temp || "").toUpperCase()) {
    case "COLD":
      return { commercialStatus: "NOVO", priority: "BAIXA", scoreSeed: 20 };
    case "WARM":
      return { commercialStatus: "EM_ANALISE", priority: "NORMAL", scoreSeed: 48 };
    case "HOT":
      return { commercialStatus: "QUALIFICADO", priority: "ALTA", scoreSeed: 78 };
    case "PRIORITY":
      return { commercialStatus: "EM_NEGOCIACAO", priority: "URGENTE", scoreSeed: 90 };
    case "UNQUALIFIED":
      return { commercialStatus: "NAO_QUALIFICADO", priority: "BAIXA", scoreSeed: 10 };
    default:
      return { commercialStatus: "NOVO", priority: "NORMAL", scoreSeed: 25 };
  }
}

export function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function reasonsToBreakdown(reasons: string[], score: number): ScoreFactor[] {
  if (!reasons?.length) {
    return [{ factor: "base", delta: score, label: "Pontuação base" }];
  }
  // Distribui score nos motivos (exibição); deltas aproximados
  const share = Math.round(score / reasons.length);
  return reasons.map((label, i) => ({
    factor: `r${i + 1}`,
    delta: i === reasons.length - 1 ? score - share * (reasons.length - 1) : share,
    label,
  }));
}

/** Infere status/prioridade a partir de score + intenção (sem quente/morno/frio) */
export function inferStatusPriority(params: {
  score: number;
  intent?: string;
  urgent?: boolean;
}): { commercialStatus: LeadStatusCode; priority: LeadPriorityCode } {
  const intent = (params.intent || "").toLowerCase();
  if (intent.includes("reclama")) {
    return {
      commercialStatus: "EM_ANALISE",
      priority: params.urgent ? "URGENTE" : "ALTA",
    };
  }
  if (intent.includes("compra") || params.score >= 75) {
    return {
      commercialStatus: params.score >= 85 ? "EM_NEGOCIACAO" : "QUALIFICADO",
      priority: params.urgent ? "URGENTE" : params.score >= 80 ? "ALTA" : "NORMAL",
    };
  }
  if (params.score >= 45) {
    return { commercialStatus: "EM_ANALISE", priority: "NORMAL" };
  }
  if (params.score < 15) {
    return { commercialStatus: "NUTRICAO", priority: "BAIXA" };
  }
  return { commercialStatus: "NOVO", priority: "BAIXA" };
}
