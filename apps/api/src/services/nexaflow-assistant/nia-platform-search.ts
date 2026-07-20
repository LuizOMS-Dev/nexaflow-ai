/**
 * NIA Platform Search — pesquisa real de navegação + orquestração de fontes.
 *
 * Fontes (papéis distintos):
 *   A) searchPlatformNavigation  → ONDE FICA (estrutura da app)
 *   B) account tools             → ESTADO da conta (sessão)
 *   C) searchHelpKnowledge       → COMO FUNCIONA (help publicada)
 *
 * Prioridade localização: NAV SEARCH > HELP > modelo
 * Prioridade estado:      ACCOUNT TOOLS > HELP > modelo
 *
 * Sem SQL genérico, sem DOM, sem cross-tenant, read-only.
 */

import type { PlanFeatureFlags } from "../entitlements";
import type { Permission } from "../security/permissions";
import {
  FEATURE_NAV,
  NEXAFLOW_NAVIGATION_CATALOG,
  type FeatureNavSpec,
  type NavCatalogEntry,
  type NavRouteId,
  type NiaFeatureId,
  resolveFeatureFromQuestion,
  type NiaNavTarget,
  resolveNiaNavigationTarget,
  ctaFromNavTarget,
} from "./nia-navigation-catalog";

// ——— Index derivado do catálogo (não é lista manual paralela) ———

export type NavigationIndexEntry = {
  featureId: NiaFeatureId;
  routeId: NavRouteId;
  label: string;
  /** Breadcrumb de UI, ex.: ["Agentes"] ou ["Agentes", "Handoff"] */
  path: string[];
  href: string;
  locationText: string;
  sectionLabel?: string;
  keywords: string[];
  permission?: Permission;
  entitlement?: keyof PlanFeatureFlags;
  menuGroup: NavCatalogEntry["menuGroup"];
};

/** Keywords por feature — enriquecem o índice derivado (não definem rota). */
const FEATURE_KEYWORDS: Partial<Record<NiaFeatureId, string[]>> = {
  AGENT_CREATE: ["criar agente", "novo agente", "configurar agente", "agente de ia", "julia"],
  AGENT_EDIT: ["editar agente", "configurar agente", "agente"],
  AGENT_MODE: ["copiloto", "aprovação", "automático", "modo do agente", "modos"],
  AGENT_HANDOFF: ["handoff", "transferir para humano", "quando transferir", "pedir humano"],
  AGENT_TOOLS: ["ferramentas do agente", "tools", "habilitar tool"],
  AGENT_KNOWLEDGE_LINK: ["vincular conhecimento", "conhecimento do agente"],
  KNOWLEDGE_CREATE: [
    "adicionar conhecimento",
    "base de conhecimento",
    "conhecimento",
    "rascunho",
    "publicar conhecimento",
  ],
  CONTINUOUS_LEARNING: ["aprendizado contínuo", "lacuna", "gap", "sugestões de aprendizado"],
  WHATSAPP_CONNECT: ["whatsapp", "conectar whatsapp", "canal", "qr code", "reconectar", "desconectou"],
  FUNNEL_MANAGE: ["funil", "oportunidade", "crm", "pipeline", "estágio"],
  CONTACT_MANAGE: ["contato", "lead", "cliente"],
  TASK_CREATE: ["tarefa", "task"],
  CAMPAIGN_CREATE: ["campanha"],
  FLOW_CREATE: ["fluxo", "automação", "automações"],
  TEAM_MANAGE: ["equipe", "convidar", "membro", "usuário"],
  REPORTS_VIEW: ["relatório", "métrica", "dashboard"],
  CONVERSATION_OPERATE: ["conversas", "inbox", "atendimento"],
  ASSUME_CHAT: ["assumir", "fila humana", "transferir conversa"],
  AUTO_CLOSE: ["encerramento automático", "inatividade", "fechar conversa", "auto close"],
  COMPANY_SETTINGS: ["configurações da empresa", "configurações"],
  COMPANY_AI: ["ia da empresa", "byok", "fornecedor de ia"],
  PUBLIC_API: ["api", "chave de api", "api key", "criar chave"],
  WEBHOOKS: ["webhook", "webhooks", "integração http"],
  PLAN_AND_USAGE: ["plano", "assinatura", "cobrança", "uso do plano", "upgrade"],
  USER_PROFILE: ["minha conta", "perfil", "dados da conta"],
  MFA_PASSWORD: ["senha", "mfa", "2fa", "segurança", "autenticação"],
  ACTIVE_SESSIONS: ["sessões", "dispositivos", "sessão"],
  PREFERENCES: ["preferências", "tema", "notificações"],
  PLATFORM_TOUR: ["tour", "passeio", "ajuda e aprendizado", "tutorial"],
  NOVELTIES: ["novidades", "changelog", "o que mudou", "atualização"],
};

let indexCache: NavigationIndexEntry[] | null = null;

/** Índice pesquisável derivado de FEATURE_NAV + NEXAFLOW_NAVIGATION_CATALOG. */
export function buildNavigationIndex(): NavigationIndexEntry[] {
  if (indexCache) return indexCache;
  const entries: NavigationIndexEntry[] = [];

  for (const [featureId, spec] of Object.entries(FEATURE_NAV) as Array<
    [NiaFeatureId, FeatureNavSpec]
  >) {
    if (featureId === "META_HELP") continue;
    const cat = NEXAFLOW_NAVIGATION_CATALOG[spec.routeId];
    if (!cat) continue;
    const path = [cat.label];
    if (spec.sectionLabel) path.push(spec.sectionLabel);
    const kw = new Set<string>([
      cat.label.toLowerCase(),
      spec.routeId,
      featureId.toLowerCase().replace(/_/g, " "),
      ...(FEATURE_KEYWORDS[featureId] || []),
      ...(cat.sections?.map((s) => s.label.toLowerCase()) || []),
    ]);
    entries.push({
      featureId,
      routeId: cat.routeId,
      label: cat.label,
      path,
      href: cat.href,
      locationText: cat.locationText,
      sectionLabel: spec.sectionLabel,
      keywords: Array.from(kw),
      permission: cat.permission,
      entitlement: cat.entitlement,
      menuGroup: cat.menuGroup,
    });
  }

  indexCache = entries;
  return entries;
}

/** Invalida cache do índice (ex.: hot-reload / testes). */
export function invalidateNavigationIndexCache() {
  indexCache = null;
}

export type PlatformNavMatch = {
  featureId: NiaFeatureId;
  label: string;
  /** Path de UI para humanos (sem href técnico na resposta ao user) */
  path: string[];
  routeId: NavRouteId;
  href: string;
  locationText: string;
  sectionLabel?: string;
  score: number;
  confidence: "high" | "medium" | "low";
  allowed: boolean;
  reasonIfDenied?: "no_permission" | "no_entitlement" | "not_in_allowlist";
  ctaLabel: string;
};

export type SearchPlatformNavigationParams = {
  query: string;
  allowedHrefs: Set<string>;
  features?: PlanFeatureFlags | null;
  permissions?: string[] | null;
  limit?: number;
};

export type SearchPlatformNavigationResult = {
  query: string;
  matches: PlatformNavMatch[];
  /** Melhor match ou null se confiança insuficiente */
  best: PlatformNavMatch | null;
  ambiguous: boolean;
  /** Sugestão de desambiguação em PT-BR (sem JSON) */
  disambiguationHint: string | null;
  /** Latency ms */
  latencyMs: number;
};

function normalizeQuery(q: string): string[] {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreEntry(tokens: string[], rawQ: string, entry: NavigationIndexEntry): number {
  const q = rawQ.toLowerCase();
  let score = 0;
  const hay = `${entry.label} ${entry.path.join(" ")} ${entry.keywords.join(" ")} ${entry.featureId}`.toLowerCase();

  // Frases inteiras nas keywords
  for (const kw of entry.keywords) {
    if (kw.length >= 4 && q.includes(kw)) score += 12 + Math.min(kw.length, 20);
  }

  for (const t of tokens) {
    if (entry.label.toLowerCase() === t) score += 10;
    else if (entry.label.toLowerCase().includes(t)) score += 6;
    if (entry.path.some((p) => p.toLowerCase().includes(t))) score += 4;
    if (entry.keywords.some((k) => k.includes(t) || t.includes(k))) score += 5;
    if (hay.includes(t)) score += 1;
  }

  // Boost feature resolvida explicitamente
  const resolved = resolveFeatureFromQuestion(rawQ);
  if (resolved && resolved === entry.featureId) score += 40;

  // Penalizar "Configurações" quando a query é claramente de outro domínio
  if (
    entry.routeId === "settings" &&
    /agente|whatsapp|conhecimento|senha|sess[aã]o|funil/i.test(q)
  ) {
    score -= 25;
  }

  return score;
}

function confidenceFromScore(score: number, second: number): "high" | "medium" | "low" {
  if (score >= 40 && score - second >= 8) return "high";
  if (score >= 22) return "medium";
  return "low";
}

function accessForEntry(
  entry: NavigationIndexEntry,
  allowedHrefs: Set<string>,
  features?: PlanFeatureFlags | null
): { allowed: boolean; reasonIfDenied?: PlatformNavMatch["reasonIfDenied"] } {
  if (entry.entitlement && features && features[entry.entitlement] === false) {
    return { allowed: false, reasonIfDenied: "no_entitlement" };
  }
  if (!allowedHrefs.has(entry.href)) {
    // pode ser permissão ou simplesmente não na lista
    return { allowed: false, reasonIfDenied: "no_permission" };
  }
  return { allowed: true };
}

/**
 * Tool central: pesquisa a estrutura REAL da plataforma (índice derivado do catálogo de app).
 * O modelo não inventa rota — consome este resultado.
 */
export function searchPlatformNavigation(
  params: SearchPlatformNavigationParams
): SearchPlatformNavigationResult {
  const started = Date.now();
  const query = (params.query || "").trim();
  const tokens = normalizeQuery(query);
  const index = buildNavigationIndex();
  const limit = Math.min(params.limit ?? 5, 10);

  if (!query || tokens.length === 0) {
    return {
      query,
      matches: [],
      best: null,
      ambiguous: false,
      disambiguationHint: null,
      latencyMs: Date.now() - started,
    };
  }

  const scored = index
    .map((entry) => {
      const score = scoreEntry(tokens, query, entry);
      const access = accessForEntry(entry, params.allowedHrefs, params.features);
      return { entry, score, access };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit);
  const secondScore = top[1]?.score ?? 0;

  const matches: PlatformNavMatch[] = top.map((x) => {
    const conf = confidenceFromScore(x.score, secondScore);
    return {
      featureId: x.entry.featureId,
      label: x.entry.label,
      path: x.entry.path,
      routeId: x.entry.routeId,
      href: x.entry.href,
      locationText: x.entry.locationText,
      sectionLabel: x.entry.sectionLabel,
      score: x.score,
      confidence: conf,
      allowed: x.access.allowed,
      reasonIfDenied: x.access.reasonIfDenied,
      ctaLabel: `Abrir ${x.entry.label}`,
    };
  });

  let best: PlatformNavMatch | null = matches[0] || null;
  // Baixa confiança → não afirmar destino
  if (best && best.confidence === "low" && best.score < 25) {
    best = null;
  }

  // Ambiguidade: dois scores próximos e labels diferentes
  let ambiguous = false;
  let disambiguationHint: string | null = null;
  if (matches.length >= 2) {
    const a = matches[0]!;
    const b = matches[1]!;
    if (a.score - b.score < 10 && a.label !== b.label && a.score >= 20) {
      ambiguous = true;
      // Casos clássicos agente vs configurações da empresa
      if (
        (a.routeId === "agents" && b.routeId === "settings") ||
        (a.routeId === "settings" && b.routeId === "agents")
      ) {
        disambiguationHint =
          "Você quer configurar o agente de IA ou as configurações gerais da empresa?";
      } else {
        disambiguationHint = `Você se refere a ${a.label} ou a ${b.label}?`;
      }
      // Em ambiguidade forte sem feature resolvida, não forçar best
      const resolved = resolveFeatureFromQuestion(query);
      if (!resolved) best = null;
    }
  }

  return {
    query,
    matches,
    best,
    ambiguous,
    disambiguationHint,
    latencyMs: Date.now() - started,
  };
}

/**
 * Converte melhor match da pesquisa → NiaNavTarget (texto + CTA alinhados).
 */
export function navTargetFromSearch(
  search: SearchPlatformNavigationResult,
  question: string,
  allowedHrefs: Set<string>,
  features?: PlanFeatureFlags | null
): NiaNavTarget {
  // Preferir resolver por feature quando search e resolver concordam
  const resolved = resolveNiaNavigationTarget({
    question,
    allowedHrefs,
    features,
  });

  if (search.best) {
    const m = search.best;
    if (!m.allowed) {
      if (m.reasonIfDenied === "no_entitlement") {
        // Plano: fallback settings se permitido
        const plan = resolveNiaNavigationTarget({
          question: "meu plano",
          allowedHrefs,
          features,
        });
        return {
          ...resolved,
          featureId: m.featureId,
          routeId: plan.allowed ? plan.routeId : null,
          label: plan.allowed ? plan.label : m.label,
          href: plan.allowed ? plan.href : null,
          locationText: plan.allowed ? plan.locationText : null,
          ctaLabel: plan.allowed ? plan.ctaLabel : null,
          allowed: plan.allowed,
          reason: "no_entitlement",
          promptBlock: `NAV_SEARCH: recurso "${m.label}" sem entitlement no plano.
NÃO diga "Abra ${m.label}". Explique limitação do plano.
${plan.allowed ? `Pode mencionar ${plan.locationText} para plano/uso.` : ""}
Localização real do recurso (só conceito): ${m.locationText}.`,
        };
      }
      return {
        ...resolved,
        featureId: m.featureId,
        routeId: m.routeId,
        label: m.label,
        href: null,
        locationText: null,
        ctaLabel: null,
        allowed: false,
        reason: "no_permission",
        promptBlock: `NAV_SEARCH: "${m.label}" existe, mas o usuário não tem acesso.
NÃO diga apenas "Abra ${m.label}". Explique permissão/admin da empresa.
Sem CTA para área bloqueada.`,
      };
    }

    const sectionHint = m.sectionLabel
      ? `Detalhe: após abrir ${m.label}, use a seção/aba "${m.sectionLabel}" (nome real da UI).`
      : "";

    return {
      featureId: m.featureId,
      routeId: m.routeId,
      label: m.label,
      href: m.href,
      locationText: m.locationText,
      ctaLabel: m.ctaLabel,
      sectionLabel: m.sectionLabel || null,
      allowed: true,
      reason: "ok",
      forbiddenAsDestination: FEATURE_NAV[m.featureId]?.forbiddenAsDestination || [],
      promptBlock: `NAV_SEARCH (fonte de verdade de localização — score=${m.score}, confiança=${m.confidence}):
- Funcionalidade: ${m.featureId}
- Path UI: ${m.path.join(" → ")}
- Localização: ${m.locationText}
- CTA: ${m.ctaLabel}
${sectionHint}
${search.ambiguous && search.disambiguationHint ? `AMBÍGUO: se necessário pergunte: "${search.disambiguationHint}"` : ""}
REGRAS: use exatamente estes nomes de UI. Catálogo/pesquisa > HELP para paths.
NUNCA invente Configurações > ${m.label} se o path não for esse. Sem /app/... no texto.`,
    };
  }

  if (search.ambiguous && search.disambiguationHint) {
    return {
      featureId: null,
      routeId: null,
      label: null,
      href: null,
      locationText: null,
      ctaLabel: null,
      allowed: false,
      reason: "unknown",
      forbiddenAsDestination: [],
      promptBlock: `NAV_SEARCH: ambíguo. Pergunte ao usuário: "${search.disambiguationHint}"
Não invente caminho. Sem CTA até esclarecer.`,
    };
  }

  // Fallback: resolver por intent (ainda catálogo, não modelo)
  if (resolved.reason !== "unknown") return resolved;

  return {
    featureId: null,
    routeId: null,
    label: null,
    href: null,
    locationText: null,
    ctaLabel: null,
    allowed: false,
    reason: "unknown",
    forbiddenAsDestination: ["Superadmin", "Administração global"],
    promptBlock: `NAV_SEARCH: nenhum destino confiável.
Diga que não identificou com segurança a localização na versão atual.
Sem CTA. Sem rota inventada. Nunca Superadmin.`,
  };
}

/** Bloco seguro para o prompt (sem hrefs técnicos se não necessário). */
export function formatNavSearchForPrompt(search: SearchPlatformNavigationResult): string {
  if (!search.matches.length) {
    return "NAV_SEARCH_RESULTS: (nenhum match confiável)";
  }
  const lines = search.matches.slice(0, 4).map((m, i) => {
    const access = m.allowed ? "allowed" : `denied:${m.reasonIfDenied || "?"}`;
    return `${i + 1}. ${m.path.join(" → ")} | ${access} | conf=${m.confidence} | feat=${m.featureId}`;
  });
  return `NAV_SEARCH_RESULTS (interno — NÃO mostre JSON/routeId/href ao usuário):
query="${search.query}" latency=${search.latencyMs}ms
${lines.join("\n")}
best=${search.best ? search.best.path.join(" → ") : "none"}
${search.disambiguationHint ? `disambiguate: ${search.disambiguationHint}` : ""}`;
}

export type NiaResearchBundle = {
  navSearch: SearchPlatformNavigationResult;
  navTarget: NiaNavTarget;
  cta: { type: "navigate"; label: string; href: string } | null;
  needsAccountDiagnostic: boolean;
  needsHelp: boolean;
  log: {
    query: string;
    selectedFeature: string | null;
    selectedLabel: string | null;
    navLatencyMs: number;
    allowed: boolean;
  };
};

/**
 * Pipeline de pesquisa (sem mutação):
 * intent → nav search → (flag diag / help)
 */
export function runNiaPlatformResearch(params: {
  question: string;
  allowedHrefs: Set<string>;
  features?: PlanFeatureFlags | null;
  permissions?: string[] | null;
}): NiaResearchBundle {
  const navSearch = searchPlatformNavigation({
    query: params.question,
    allowedHrefs: params.allowedHrefs,
    features: params.features,
    permissions: params.permissions,
  });
  const navTarget = navTargetFromSearch(
    navSearch,
    params.question,
    params.allowedHrefs,
    params.features
  );
  const cta = ctaFromNavTarget(navTarget);

  const q = params.question.toLowerCase();
  const needsAccountDiagnostic =
    /por\s+que|porque|n[aã]o\s+(funciona|responde|conect)|desconect|falha|erro|problema|status|minha\s+conta|est[aá]\s+funcionando|diagn[oó]st/i.test(
      q
    ) ||
    (navTarget.featureId != null &&
      ["WHATSAPP_CONNECT", "AGENT_EDIT", "AGENT_CREATE", "ASSUME_CHAT", "PUBLIC_API", "PLAN_AND_USAGE"].includes(
        navTarget.featureId
      ) &&
      /n[aã]o|por\s+que|status|desconect|parado/i.test(q));

  // Conceito puro: help sim, diag não
  const needsHelp = !/^(oi|ol[aá]|obrigad)/i.test(q.trim());

  return {
    navSearch,
    navTarget,
    cta,
    needsAccountDiagnostic,
    needsHelp,
    log: {
      query: params.question.slice(0, 200),
      selectedFeature: navTarget.featureId,
      selectedLabel: navTarget.label,
      navLatencyMs: navSearch.latencyMs,
      allowed: navTarget.allowed,
    },
  };
}
