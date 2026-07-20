/**
 * NEXAFLOW_NAVIGATION_CATALOG — fonte única de verdade de navegação da NIA.
 *
 * Hierarquia para LOCALIZAÇÃO na UI:
 *   1) Este catálogo (rotas reais auditadas no código)
 *   2) Help Knowledge (conceito / como funciona) — NUNCA vence em path
 *
 * Rotas auditadas em apps/web (app-shell, account-shell, settings, ai tabs).
 * Nunca inventar Configurações > Agentes, etc.
 */

import type { Permission } from "../security/permissions";
import type { PlanFeatureFlags } from "../entitlements";

/** IDs semânticos estáveis (não são paths técnicos). */
export type NavRouteId =
  | "home"
  | "conversations"
  | "contacts"
  | "funnel"
  | "tasks"
  | "campaigns"
  | "flows"
  | "agents"
  | "learning"
  | "knowledge"
  | "team"
  | "channels"
  | "reports"
  | "settings"
  | "api"
  | "webhooks"
  | "account"
  | "security"
  | "sessions"
  | "preferences"
  | "companies"
  | "novelties"
  | "docs_api";

export type NavCatalogEntry = {
  routeId: NavRouteId;
  /** Nome EXATO na UI */
  label: string;
  href: string;
  /** Frase pronta para orientação: "na área de Agentes" */
  locationText: string;
  /** Grupo do menu (referência) */
  menuGroup: "sidebar" | "profile" | "settings_sub" | "docs";
  permission?: Permission;
  entitlement?: keyof PlanFeatureFlags;
  /** Abas/seções que realmente existem na UI */
  sections?: Array<{ id: string; label: string }>;
  accessNote?: string;
};

/**
 * Catálogo canônico — apenas rotas que existem no produto tenant.
 * Superadmin /admin NÃO entra aqui (NIA tenant não orienta para painel global).
 */
export const NEXAFLOW_NAVIGATION_CATALOG: Record<NavRouteId, NavCatalogEntry> = {
  home: {
    routeId: "home",
    label: "Início",
    href: "/app",
    locationText: "no Início",
    menuGroup: "sidebar",
  },
  conversations: {
    routeId: "conversations",
    label: "Conversas",
    href: "/app/inbox",
    locationText: "na área de Conversas",
    menuGroup: "sidebar",
    permission: "conversations.read",
    entitlement: "inbox",
  },
  contacts: {
    routeId: "contacts",
    label: "Contatos",
    href: "/app/contacts",
    locationText: "na área de Contatos",
    menuGroup: "sidebar",
    permission: "contacts.read",
  },
  funnel: {
    routeId: "funnel",
    label: "Funil",
    href: "/app/crm",
    locationText: "na área de Funil",
    menuGroup: "sidebar",
    permission: "crm.read",
    entitlement: "crm",
  },
  tasks: {
    routeId: "tasks",
    label: "Tarefas",
    href: "/app/tasks",
    locationText: "na área de Tarefas",
    menuGroup: "sidebar",
    permission: "tasks.read",
  },
  campaigns: {
    routeId: "campaigns",
    label: "Campanhas",
    href: "/app/campaigns",
    locationText: "na área de Campanhas",
    menuGroup: "sidebar",
    permission: "crm.read",
    entitlement: "campaigns",
  },
  flows: {
    routeId: "flows",
    label: "Fluxos",
    href: "/app/automations",
    locationText: "na área de Fluxos",
    menuGroup: "sidebar",
    entitlement: "automations",
  },
  agents: {
    routeId: "agents",
    label: "Agentes",
    href: "/app/ai",
    locationText: "na área de Agentes",
    menuGroup: "sidebar",
    permission: "ai.manage",
    entitlement: "ai",
    sections: [
      { id: "geral", label: "Geral" },
      { id: "comportamento", label: "Comportamento" },
      { id: "handoff", label: "Handoff" },
      { id: "ferramentas", label: "Ferramentas" },
      { id: "conhecimento", label: "Conhecimento" },
    ],
  },
  learning: {
    routeId: "learning",
    label: "Aprendizado",
    href: "/app/ai/learning",
    locationText: "em Aprendizado (dentro de Agentes)",
    menuGroup: "sidebar",
    permission: "ai.manage",
    entitlement: "ai",
  },
  knowledge: {
    routeId: "knowledge",
    label: "Conhecimento",
    href: "/app/knowledge",
    locationText: "na área de Conhecimento",
    menuGroup: "sidebar",
    permission: "ai.manage",
    entitlement: "ai",
  },
  team: {
    routeId: "team",
    label: "Equipe",
    href: "/app/team",
    locationText: "na área de Equipe",
    menuGroup: "sidebar",
    permission: "team.manage",
  },
  channels: {
    routeId: "channels",
    label: "Canais",
    href: "/app/integrations",
    locationText: "na área de Canais",
    menuGroup: "sidebar",
    permission: "channels.manage",
  },
  reports: {
    routeId: "reports",
    label: "Relatórios",
    href: "/app/reports",
    locationText: "na área de Relatórios",
    menuGroup: "sidebar",
    permission: "reports.read",
    entitlement: "reports",
  },
  settings: {
    routeId: "settings",
    label: "Configurações",
    href: "/app/settings",
    locationText: "em Configurações da empresa",
    menuGroup: "sidebar",
    permission: "settings.read",
    accessNote: "Configurações da EMPRESA (não Minha conta)",
    sections: [
      { id: "ai", label: "IA da empresa" },
      { id: "attendance", label: "Atendimento" },
    ],
  },
  api: {
    routeId: "api",
    label: "API",
    href: "/app/settings/api",
    locationText: "em Configurações → API",
    menuGroup: "settings_sub",
    permission: "settings.read",
    entitlement: "api",
  },
  webhooks: {
    routeId: "webhooks",
    label: "Webhooks",
    href: "/app/settings/webhooks",
    locationText: "em Configurações → Webhooks",
    menuGroup: "settings_sub",
    permission: "settings.read",
    entitlement: "api",
  },
  account: {
    routeId: "account",
    label: "Minha Conta",
    href: "/app/account",
    locationText: "em Minha Conta (menu do perfil)",
    menuGroup: "profile",
    accessNote: "Dados pessoais do usuário — não Configurações da empresa",
  },
  security: {
    routeId: "security",
    label: "Segurança",
    href: "/app/account/security",
    locationText: "em Segurança (Minha Conta → Segurança)",
    menuGroup: "profile",
  },
  sessions: {
    routeId: "sessions",
    label: "Sessões",
    href: "/app/account/sessions",
    locationText: "em Sessões (Minha Conta → Sessões)",
    menuGroup: "profile",
  },
  preferences: {
    routeId: "preferences",
    label: "Preferências",
    href: "/app/account/preferences",
    locationText: "em Preferências (Minha Conta → Preferências)",
    menuGroup: "profile",
    sections: [{ id: "help", label: "Ajuda e aprendizado" }],
  },
  companies: {
    routeId: "companies",
    label: "Empresas",
    href: "/app/account/companies",
    locationText: "em Empresas (Minha Conta → Empresas)",
    menuGroup: "profile",
  },
  novelties: {
    routeId: "novelties",
    label: "Novidades",
    href: "/app/whats-new",
    locationText: "em Novidades (menu do perfil)",
    menuGroup: "profile",
  },
  docs_api: {
    routeId: "docs_api",
    label: "Documentação da API",
    href: "/docs/api",
    locationText: "na documentação da API",
    menuGroup: "docs",
    entitlement: "api",
  },
};

/** Alias routeId → href (compatível com NIA_ROUTE_ID_MAP). */
export const NAV_ROUTE_ID_TO_HREF: Record<string, string> = Object.fromEntries(
  Object.values(NEXAFLOW_NAVIGATION_CATALOG).flatMap((e) => {
    const pairs: Array<[string, string]> = [[e.routeId, e.href]];
    // aliases comuns
    if (e.routeId === "agents") pairs.push(["ai", e.href], ["agent", e.href]);
    if (e.routeId === "conversations") pairs.push(["inbox", e.href]);
    if (e.routeId === "funnel") pairs.push(["crm", e.href]);
    if (e.routeId === "flows") pairs.push(["automations", e.href]);
    if (e.routeId === "channels") pairs.push(["integrations", e.href]);
    if (e.routeId === "novelties")
      pairs.push(["whats_new", e.href], ["whats-new", e.href], ["novidades", e.href]);
    if (e.routeId === "docs_api") pairs.push(["docs", e.href]);
    return pairs;
  })
);

/** Funcionalidades → destino real (feature map). */
export type NiaFeatureId =
  | "AGENT_CREATE"
  | "AGENT_EDIT"
  | "AGENT_MODE"
  | "AGENT_HANDOFF"
  | "AGENT_TOOLS"
  | "AGENT_KNOWLEDGE_LINK"
  | "KNOWLEDGE_CREATE"
  | "CONTINUOUS_LEARNING"
  | "WHATSAPP_CONNECT"
  | "FUNNEL_MANAGE"
  | "CONTACT_MANAGE"
  | "TASK_CREATE"
  | "CAMPAIGN_CREATE"
  | "FLOW_CREATE"
  | "TEAM_MANAGE"
  | "REPORTS_VIEW"
  | "CONVERSATION_OPERATE"
  | "ASSUME_CHAT"
  | "AUTO_CLOSE"
  | "COMPANY_SETTINGS"
  | "COMPANY_AI"
  | "PUBLIC_API"
  | "WEBHOOKS"
  | "PLAN_AND_USAGE"
  | "USER_PROFILE"
  | "MFA_PASSWORD"
  | "ACTIVE_SESSIONS"
  | "PREFERENCES"
  | "PLATFORM_TOUR"
  | "NOVELTIES"
  | "META_HELP";

export type FeatureNavSpec = {
  featureId: NiaFeatureId;
  routeId: NavRouteId;
  /** Aba real se existir */
  sectionLabel?: string;
  /** Destinos que NÃO podem ser citados como local principal */
  forbiddenAsDestination: string[];
};

export const FEATURE_NAV: Record<NiaFeatureId, FeatureNavSpec> = {
  AGENT_CREATE: {
    featureId: "AGENT_CREATE",
    routeId: "agents",
    forbiddenAsDestination: ["Configurações", "Segurança", "Funil", "Canais", "Minha Conta"],
  },
  AGENT_EDIT: {
    featureId: "AGENT_EDIT",
    routeId: "agents",
    forbiddenAsDestination: ["Configurações", "Segurança", "Funil"],
  },
  AGENT_MODE: {
    featureId: "AGENT_MODE",
    routeId: "agents",
    sectionLabel: "Geral",
    forbiddenAsDestination: ["Configurações", "Segurança"],
  },
  AGENT_HANDOFF: {
    featureId: "AGENT_HANDOFF",
    routeId: "agents",
    sectionLabel: "Handoff",
    forbiddenAsDestination: ["Configurações", "Segurança", "Funil"],
  },
  AGENT_TOOLS: {
    featureId: "AGENT_TOOLS",
    routeId: "agents",
    sectionLabel: "Ferramentas",
    forbiddenAsDestination: ["Configurações"],
  },
  AGENT_KNOWLEDGE_LINK: {
    featureId: "AGENT_KNOWLEDGE_LINK",
    routeId: "agents",
    sectionLabel: "Conhecimento",
    forbiddenAsDestination: ["Configurações"],
  },
  KNOWLEDGE_CREATE: {
    featureId: "KNOWLEDGE_CREATE",
    routeId: "knowledge",
    forbiddenAsDestination: ["Configurações", "Agentes", "Segurança"],
  },
  CONTINUOUS_LEARNING: {
    featureId: "CONTINUOUS_LEARNING",
    routeId: "learning",
    forbiddenAsDestination: ["Configurações", "Segurança"],
  },
  WHATSAPP_CONNECT: {
    featureId: "WHATSAPP_CONNECT",
    routeId: "channels",
    forbiddenAsDestination: ["Agentes", "Configurações", "Minha Conta", "Segurança"],
  },
  FUNNEL_MANAGE: {
    featureId: "FUNNEL_MANAGE",
    routeId: "funnel",
    forbiddenAsDestination: ["Configurações", "Agentes", "Segurança"],
  },
  CONTACT_MANAGE: {
    featureId: "CONTACT_MANAGE",
    routeId: "contacts",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  TASK_CREATE: {
    featureId: "TASK_CREATE",
    routeId: "tasks",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  CAMPAIGN_CREATE: {
    featureId: "CAMPAIGN_CREATE",
    routeId: "campaigns",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  FLOW_CREATE: {
    featureId: "FLOW_CREATE",
    routeId: "flows",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  TEAM_MANAGE: {
    featureId: "TEAM_MANAGE",
    routeId: "team",
    forbiddenAsDestination: ["Minha Conta", "Agentes"],
  },
  REPORTS_VIEW: {
    featureId: "REPORTS_VIEW",
    routeId: "reports",
    forbiddenAsDestination: ["Agentes", "Segurança"],
  },
  CONVERSATION_OPERATE: {
    featureId: "CONVERSATION_OPERATE",
    routeId: "conversations",
    forbiddenAsDestination: ["Configurações", "Agentes", "Segurança"],
  },
  ASSUME_CHAT: {
    featureId: "ASSUME_CHAT",
    routeId: "conversations",
    forbiddenAsDestination: ["Agentes", "Configurações"],
  },
  AUTO_CLOSE: {
    featureId: "AUTO_CLOSE",
    routeId: "settings",
    sectionLabel: "Atendimento",
    forbiddenAsDestination: ["Agentes", "Segurança", "Minha Conta"],
  },
  COMPANY_SETTINGS: {
    featureId: "COMPANY_SETTINGS",
    routeId: "settings",
    forbiddenAsDestination: ["Minha Conta", "Segurança", "Agentes"],
  },
  COMPANY_AI: {
    featureId: "COMPANY_AI",
    routeId: "settings",
    sectionLabel: "IA da empresa",
    forbiddenAsDestination: ["Minha Conta", "Agentes"],
  },
  PUBLIC_API: {
    featureId: "PUBLIC_API",
    routeId: "api",
    forbiddenAsDestination: ["Agentes", "Segurança", "Minha Conta"],
  },
  WEBHOOKS: {
    featureId: "WEBHOOKS",
    routeId: "webhooks",
    forbiddenAsDestination: ["Agentes", "Segurança"],
  },
  PLAN_AND_USAGE: {
    featureId: "PLAN_AND_USAGE",
    routeId: "settings",
    forbiddenAsDestination: ["Agentes", "Segurança"],
  },
  USER_PROFILE: {
    featureId: "USER_PROFILE",
    routeId: "account",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  MFA_PASSWORD: {
    featureId: "MFA_PASSWORD",
    routeId: "security",
    forbiddenAsDestination: ["Configurações", "Agentes", "Canais", "Funil"],
  },
  ACTIVE_SESSIONS: {
    featureId: "ACTIVE_SESSIONS",
    routeId: "sessions",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  PREFERENCES: {
    featureId: "PREFERENCES",
    routeId: "preferences",
    forbiddenAsDestination: ["Configurações da empresa", "Agentes"],
  },
  PLATFORM_TOUR: {
    featureId: "PLATFORM_TOUR",
    routeId: "preferences",
    sectionLabel: "Ajuda e aprendizado",
    forbiddenAsDestination: ["Configurações", "Agentes", "Segurança"],
  },
  NOVELTIES: {
    featureId: "NOVELTIES",
    routeId: "novelties",
    forbiddenAsDestination: ["Configurações", "Agentes"],
  },
  META_HELP: {
    featureId: "META_HELP",
    routeId: "home",
    forbiddenAsDestination: [],
  },
};

/**
 * Resolve feature a partir da pergunta (ordem: mais específico primeiro).
 * Retorna null se não houver orientação de navegação clara (sem inventar destino).
 */
export function resolveFeatureFromQuestion(question: string): NiaFeatureId | null {
  const q = (question || "").toLowerCase().trim();
  if (!q) return null;

  // Meta — sem CTA de navegação forçado
  if (
    /^(oi|ol[aá]|obrigad|valeu|ok|tudo bem)[\s!.?]*$/i.test(q) ||
    /como\s+(voc[eê]|vc)\s+(pode|consegue)\s+me\s+ajud|o\s+que\s+(voc[eê]|vc)\s+(faz|pode)|no\s+que\s+(voc[eê]|vc)\s+ajuda|para\s+que\s+(voc[eê]|vc)\s+serve/i.test(
      q
    )
  ) {
    return "META_HELP";
  }

  if (/tour|passeio\s+pela\s+plataforma|ajuda\s+e\s+aprendizado/i.test(q)) {
    return "PLATFORM_TOUR";
  }
  if (/senha|mfa|2fa|autentica[cç][aã]o\s+em\s+duas|alterar\s+minha\s+senha|seguran[cç]a\s+da\s+conta/i.test(q)) {
    return "MFA_PASSWORD";
  }
  if (/sess[aã]o|sess[oõ]es|dispositivos\s+conect/i.test(q)) return "ACTIVE_SESSIONS";
  if (
    /prefer[eê]ncia|tema\s+claro|notifica[cç][aã]o\s+(do\s+)?(navegador|app|painel)/i.test(q) &&
    !/agente|whatsapp|funil|conhecimento|conversa/i.test(q)
  ) {
    return "PREFERENCES";
  }
  if (/minha\s+conta|meu\s+perfil|dados\s+da\s+conta/i.test(q)) return "USER_PROFILE";

  if (
    /encerramento\s+autom|regra[s]?\s+de\s+encerr|fechar\s+(conversa|atendimento)\s+por\s+inativ|inativid|auto[-\s]?close|tempo\s+sem\s+resposta|fechar\s+sozinh/i.test(
      q
    )
  ) {
    return "AUTO_CLOSE";
  }

  if (/whatsapp|canal|qr\s*code|reconect/i.test(q)) return "WHATSAPP_CONNECT";

  if (/conhecimento|knowledge|rascunho|base\s+de\s+conhec|adicionar\s+conhec/i.test(q)) {
    if (/vincular|ligar.*agente|agente.*conhec/i.test(q)) return "AGENT_KNOWLEDGE_LINK";
    return "KNOWLEDGE_CREATE";
  }

  if (/aprendizado\s+cont[ií]nuo|lacuna|gap\s+de\s+conhec/i.test(q)) {
    return "CONTINUOUS_LEARNING";
  }

  if (
    /handoff|quando\s+transferir|regra\s+de\s+transfer|pedir\s+humano|transfer.*agente/i.test(q) &&
    !/assumir|fila\s+humana|conversas/i.test(q)
  ) {
    return "AGENT_HANDOFF";
  }

  if (/ferramenta\s+do\s+agente|tools?\s+do\s+agente|habilitar\s+tool/i.test(q)) {
    return "AGENT_TOOLS";
  }

  if (
    /modo\s+(copiloto|aprova|autom[aá]tico)|copiloto|aprova[cç][aã]o|modo\s+autom[aá]tico/i.test(q) &&
    /agente|modo|diferen[cç]a|funciona/i.test(q)
  ) {
    return "AGENT_MODE";
  }

  if (
    /agente|criar\s+um\s+agente|editar\s+o\s+agente|configurar\s+(o\s+)?agente|julia|importar\s+configura[cç][aã]o\s+do\s+agente/i.test(
      q
    )
  ) {
    if (/como\s+(crio|criar|configuro|configurar|edito|editar|adiciono)/i.test(q)) return "AGENT_CREATE";
    if (/como\s+funciona|o\s+que\s+[eé]/i.test(q)) return "AGENT_EDIT";
    return "AGENT_EDIT";
  }

  if (
    /assum(ir|o|e|imos)\s+(um\s+|uma\s+|o\s+|a\s+)?(atend|conversa|chat)|fila\s+humana|transfer(ir|o|e)\s+(para\s+)?(outro\s+)?(atendente|humano|colega)|retomar\s+(a\s+)?ia|devolver\s+para\s+ia|finalizar\s+(o\s+)?atend/i.test(
      q
    )
  ) {
    return "ASSUME_CHAT";
  }

  if (/funil|oportunidade|crm|pipeline/i.test(q)) return "FUNNEL_MANAGE";
  if (/contato|lead|cliente\s+na\s+base/i.test(q) && !/agente|whatsapp/i.test(q)) {
    return "CONTACT_MANAGE";
  }
  if (/tarefa|task\b/i.test(q)) return "TASK_CREATE";
  if (/campanha/i.test(q)) return "CAMPAIGN_CREATE";
  if (/equipe|membro|convidar|usu[aá]rio\s+da\s+empresa/i.test(q)) return "TEAM_MANAGE";
  if (/relat[oó]rio|m[eé]trica|dashboard\s+de\s+atend/i.test(q)) return "REPORTS_VIEW";
  if (/conversa|inbox|atendimento\s+no\s+painel/i.test(q)) return "CONVERSATION_OPERATE";

  if (/webhook/i.test(q)) return "WEBHOOKS";
  if (/\bapi\b|chave\s+de\s+api/i.test(q)) return "PUBLIC_API";
  if (/automa[cç]|fluxo\s+de\s+automa/i.test(q)) return "FLOW_CREATE";
  if (/novidade|changelog|o\s+que\s+mudou/i.test(q)) return "NOVELTIES";
  if (/plano|assinatura|cobran[cç]a|upgrade|uso\s+do\s+plano/i.test(q)) return "PLAN_AND_USAGE";

  if (
    /configura[cç].*empresa|ia\s+da\s+empresa|byok|fornecedor\s+de\s+ia|chave\s+da\s+empresa|configura[cç][oõ]es\s+da\s+empresa|atendimento\s+na\s+configura/i.test(
      q
    )
  ) {
    if (/ia\s+da\s+empresa|byok|fornecedor/i.test(q)) return "COMPANY_AI";
    return "COMPANY_SETTINGS";
  }

  // "configurações da conta" / "conta" genérico → Minha Conta (NÃO empresa)
  if (
    /configura[cç][oõ]es?\s+da\s+conta|configura[cç][oõ]es?\s+(da\s+)?minha\s+conta|caminho.*conta/i.test(
      q
    )
  ) {
    if (/senha|mfa|seguran/i.test(q)) return "MFA_PASSWORD";
    if (/sess[aã]o|sess[oõ]es/i.test(q)) return "ACTIVE_SESSIONS";
    if (/prefer/i.test(q)) return "PREFERENCES";
    return "USER_PROFILE";
  }

  // Configurações da EMPRESA só com domínio claro — NUNCA fallback genérico
  if (
    /configura[cç][oõ]es?\s+da\s+empresa|ia\s+da\s+empresa|atendimento\s+autom|encerramento/i.test(q)
  ) {
    return "COMPANY_SETTINGS";
  }

  // "configurações" sozinho sem domínio → null (sem inventar Configurações)
  return null;
}

export type NiaNavResolveContext = {
  question: string;
  /** hrefs que o usuário pode acessar (RBAC + entitlement filtrados) */
  allowedHrefs: Set<string>;
  features?: PlanFeatureFlags | null;
  permissions?: string[] | null;
  accessGateBlocked?: boolean;
};

export type NiaNavTarget = {
  featureId: NiaFeatureId | null;
  routeId: NavRouteId | null;
  label: string | null;
  href: string | null;
  locationText: string | null;
  ctaLabel: string | null;
  sectionLabel?: string | null;
  allowed: boolean;
  reason: "ok" | "unknown" | "meta_no_cta" | "no_permission" | "no_entitlement" | "gate_blocked";
  forbiddenAsDestination: string[];
  /** Bloco para system prompt — o modelo DEVE seguir */
  promptBlock: string;
};

function entryByRouteId(routeId: NavRouteId): NavCatalogEntry {
  return NEXAFLOW_NAVIGATION_CATALOG[routeId];
}

/**
 * Resolver central: intent → feature → catálogo → RBAC/entitlement.
 * Texto de orientação e CTA devem usar o mesmo resultado.
 */
export function resolveNiaNavigationTarget(ctx: NiaNavResolveContext): NiaNavTarget {
  const featureId = resolveFeatureFromQuestion(ctx.question);

  if (!featureId) {
    return {
      featureId: null,
      routeId: null,
      label: null,
      href: null,
      locationText: null,
      ctaLabel: null,
      allowed: false,
      reason: "unknown",
      forbiddenAsDestination: ["Superadmin", "Administração global", "Diagnóstico interno"],
      promptBlock: `NAV_TARGET: desconhecido
Não invente caminho (ex.: "Configurações > …") se não tiver certeza.
Prefira explicar o conceito sem citar menu, ou diga que não identificou o caminho exato com segurança.
Nunca oriente para Superadmin / painel interno.`,
    };
  }

  if (featureId === "META_HELP") {
    return {
      featureId,
      routeId: null,
      label: null,
      href: null,
      locationText: null,
      ctaLabel: null,
      allowed: false,
      reason: "meta_no_cta",
      forbiddenAsDestination: [],
      promptBlock: `NAV_TARGET: meta-ajuda — SEM CTA de navegação. Não force "abra X".`,
    };
  }

  const spec = FEATURE_NAV[featureId];
  const entry = entryByRouteId(spec.routeId);

  // Entitlement
  if (entry.entitlement && ctx.features && ctx.features[entry.entitlement] === false) {
    const planFallback = entryByRouteId("settings");
    const planAllowed = ctx.allowedHrefs.has(planFallback.href);
    return {
      featureId,
      routeId: planAllowed ? "settings" : null,
      label: planAllowed ? planFallback.label : null,
      href: planAllowed ? planFallback.href : null,
      locationText: planAllowed ? planFallback.locationText : null,
      ctaLabel: planAllowed ? `Abrir ${planFallback.label}` : null,
      allowed: planAllowed,
      reason: "no_entitlement",
      forbiddenAsDestination: spec.forbiddenAsDestination,
      promptBlock: `NAV_TARGET: recurso "${entry.label}" NÃO está no plano atual.
NÃO diga "Abra ${entry.label}".
Explique que o plano não inclui o recurso.
${planAllowed ? `Se fizer sentido, mencione ${planFallback.locationText} para revisar plano/uso.` : ""}
PROIBIDO citar como destino: ${spec.forbiddenAsDestination.join(", ") || "—"}.`,
    };
  }

  // RBAC / allowlist
  if (!ctx.allowedHrefs.has(entry.href)) {
    return {
      featureId,
      routeId: entry.routeId,
      label: entry.label,
      href: null,
      locationText: null,
      ctaLabel: null,
      sectionLabel: spec.sectionLabel || null,
      allowed: false,
      reason: "no_permission",
      forbiddenAsDestination: spec.forbiddenAsDestination,
      promptBlock: `NAV_TARGET: ${entry.label} existe, mas o usuário NÃO tem permissão/acesso.
NÃO diga apenas "Abra ${entry.label}".
Explique que o recurso pode exigir permissão de um administrador da empresa.
Sem CTA de navegação para área bloqueada.
PROIBIDO: Superadmin, painel interno.`,
    };
  }

  if (ctx.accessGateBlocked && ["WHATSAPP_CONNECT", "AGENT_CREATE", "FLOW_CREATE", "CAMPAIGN_CREATE", "PUBLIC_API", "WEBHOOKS"].includes(featureId)) {
    return {
      featureId,
      routeId: entry.routeId,
      label: entry.label,
      href: entry.href,
      locationText: entry.locationText,
      ctaLabel: null,
      allowed: false,
      reason: "gate_blocked",
      forbiddenAsDestination: spec.forbiddenAsDestination,
      promptBlock: `NAV_TARGET: Access Gate restringe operação.
Não ensine a contornar bloqueio. Oriente cobrança/plano/suporte/conta conforme política.
Localização conceitual: ${entry.locationText} — mas explique a restrição primeiro.`,
    };
  }

  const section =
    spec.sectionLabel && entry.sections?.some((s) => s.label === spec.sectionLabel)
      ? spec.sectionLabel
      : spec.sectionLabel && entry.sections?.some((s) => s.id === spec.sectionLabel?.toLowerCase())
        ? entry.sections.find((s) => s.id === spec.sectionLabel?.toLowerCase())?.label
        : spec.sectionLabel;

  const sectionHint =
    section && entry.sections?.some((s) => s.label === section)
      ? `Se precisar de detalhe: abra ${entry.label}, selecione o item e use a aba/seção "${section}" (nome real da UI).`
      : section
        ? `Detalhe opcional: ${section}.`
        : "";

  return {
    featureId,
    routeId: entry.routeId,
    label: entry.label,
    href: entry.href,
    locationText: entry.locationText,
    ctaLabel: `Abrir ${entry.label}`,
    sectionLabel: section || null,
    allowed: true,
    reason: "ok",
    forbiddenAsDestination: spec.forbiddenAsDestination,
    promptBlock: `NAV_TARGET (OBRIGATÓRIO — fonte de verdade de localização):
- Funcionalidade: ${featureId}
- Localização UI: ${entry.locationText} (nome do menu: "${entry.label}")
- CTA coerente: Abrir ${entry.label}
- ${entry.accessNote || entry.menuGroup === "profile" ? "Acesso via menu do perfil (não confunda com Configurações da empresa)." : "Acesso via menu lateral."}
${sectionHint}
REGRAS:
- Ao orientar "abra/acesse/vá em", use EXATAMENTE "${entry.label}" / ${entry.locationText}.
- NUNCA diga "Configurações > ${entry.label}" se o item não for subpágina de Configurações.
- NUNCA use como destino principal: ${spec.forbiddenAsDestination.join(", ") || "(nenhum extra)"}.
- NUNCA escreva paths técnicos (/app/...).
- Conceito ≠ menu: pode explicar "base de conhecimento", mas para navegar diga "Conhecimento".
- NÃO invente abas. Abas reais em Agentes: Geral, Comportamento, Handoff, Ferramentas, Conhecimento.`,
  };
}

/** hrefs relevantes para filtrar CTAs (compat intentRelevantHrefs). */
export function navigationHrefsForQuestion(question: string): string[] | null {
  const featureId = resolveFeatureFromQuestion(question);
  if (!featureId) return null;
  if (featureId === "META_HELP") return [];
  const spec = FEATURE_NAV[featureId];
  const entry = entryByRouteId(spec.routeId);
  const hrefs = [entry.href];
  // API também pode apontar docs
  if (featureId === "PUBLIC_API") hrefs.push(NEXAFLOW_NAVIGATION_CATALOG.docs_api.href);
  if (featureId === "CONTINUOUS_LEARNING") hrefs.push(NEXAFLOW_NAVIGATION_CATALOG.agents.href);
  if (featureId === "AGENT_HANDOFF") hrefs.push(NEXAFLOW_NAVIGATION_CATALOG.conversations.href);
  return hrefs;
}

/**
 * Alinha prosa do modelo ao target resolvido (defesa — catálogo vence help antiga).
 * Não reescreve o texto inteiro; corrige padrões conhecidos de caminho errado.
 */
export function alignContentWithNavigationTarget(content: string, target: NiaNavTarget): string {
  let t = content || "";
  if (!target.featureId || target.featureId === "META_HELP") return t;

  // Caminhos compostos inventados (sempre errados no produto atual)
  t = t.replace(/Configura[cç][oõ]es\s*[>→\-–]\s*Agentes/gi, "Agentes");
  t = t.replace(/Configura[cç][oõ]es\s*[>→\-–]\s*Conhecimento/gi, "Conhecimento");
  t = t.replace(/Configura[cç][oõ]es\s*[>→\-–]\s*Canais/gi, "Canais");
  t = t.replace(/Configura[cç][oõ]es\s*[>→\-–]\s*WhatsApp/gi, "Canais");
  t = t.replace(/Minha\s+Conta\s*[>→\-–]\s*WhatsApp/gi, "Canais");
  t = t.replace(/Seguran[cç]a\s*[>→\-–]\s*API/gi, "Configurações → API");
  t = t.replace(/Base\s+de\s+Conhecimento(?=\s|$|[.,;:!?)])/gi, (m, _o, s: string) => {
    // Só em contexto de navegação (abra/acesse/vá)
    // se a frase anterior tem abra/acesse
    return m;
  });
  t = t.replace(
    /(?:abra|acesse|v[aá]\s+(?:em|at[eé])|entre\s+em)\s+Base\s+de\s+Conhecimento/gi,
    "abra Conhecimento"
  );

  if (target.allowed && target.label && target.locationText) {
    const label = target.label;
    // Destinos proibidos como "vá em X" quando X ≠ target
    for (const bad of target.forbiddenAsDestination) {
      if (!bad || bad.toLowerCase() === label.toLowerCase()) continue;
      // "vá em Configurações" / "abra Segurança" quando o target é outro
      const re = new RegExp(
        `((?:abra|acesse|v[aá]\\s+(?:em|at[eé])|entre\\s+em|na\\s+[aá]rea\\s+de)\\s+)${escapeReg(bad)}(?![\\wÀ-ú])`,
        "gi"
      );
      t = t.replace(re, `$1${label}`);
      // "em Configurações." genérico no fim de orientação de setup do target
      const re2 = new RegExp(
        `(configur[ae]\\s+(?:isso|o\\s+agente|seu\\s+agente|o\\s+whatsapp|a\\s+senha)[^.\\n]{0,40}?)\\b${escapeReg(bad)}\\b`,
        "gi"
      );
      t = t.replace(re2, `$1${label}`);
    }

    // Senha → nunca Configurações da empresa
    if (target.featureId === "MFA_PASSWORD") {
      t = t.replace(
        /(?:abra|acesse|v[aá]\s+em)\s+Configura[cç][oõ]es(?!\s*[>→])/gi,
        "abra Segurança"
      );
      t = t.replace(/Configura[cç][oõ]es\s+da\s+empresa/gi, "Segurança da sua conta");
    }

    // Agente → nunca Configurações genérico como destino
    if (
      target.featureId?.startsWith("AGENT_") ||
      target.featureId === "KNOWLEDGE_CREATE" ||
      target.featureId === "CONTINUOUS_LEARNING"
    ) {
      t = t.replace(
        /(?:para\s+configurar\s+(?:seu\s+)?agente[^.\\n]{0,30}?)(?:v[aá]\s+em|abra|acesse)\s+Configura[cç][oõ]es/gi,
        `para configurar seu agente, abra ${label}`
      );
      t = t.replace(
        /(?:configurar\s+(?:o\s+)?agente[^.\\n]{0,20}?)em\s+Configura[cç][oõ]es/gi,
        `configurar o agente ${target.locationText}`
      );
    }

    if (target.featureId === "WHATSAPP_CONNECT") {
      t = t.replace(
        /(?:abra|acesse|v[aá]\s+em)\s+(?:Agentes|Configura[cç][oõ]es)(?!\s*[>→]\s*(?:API|Webhooks))/gi,
        "abra Canais"
      );
    }
  }

  return t;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resumo do catálogo para prompt (só nomes — sem paths). */
export function buildNavigationCatalogPromptSummary(): string {
  const lines = Object.values(NEXAFLOW_NAVIGATION_CATALOG)
    .filter((e) => e.menuGroup !== "docs")
    .map((e) => {
      const where =
        e.menuGroup === "profile"
          ? "perfil"
          : e.menuGroup === "settings_sub"
            ? "sub Configurações"
            : "menu";
      return `· ${e.label} (${where})`;
    });
  return `MAPA DE NAVEGAÇÃO REAL (só estes nomes de UI; NÃO invente caminhos):
${lines.join("\n")}
Minha Conta / Segurança / Sessões / Preferências / Novidades = menu do perfil.
Configurações = empresa (plano, IA da empresa, atendimento/encerramento).
Agentes / Conhecimento / Canais / Funil = menu lateral (NÃO ficam dentro de Configurações).
Abas reais do agente: Geral, Comportamento, Handoff, Ferramentas, Conhecimento.
NUNCA oriente para Superadmin, Administração global, Health ou logs internos.`;
}

/** Action estruturada a partir do target (se permitido). */
export function ctaFromNavTarget(target: NiaNavTarget): {
  type: "navigate";
  label: string;
  href: string;
} | null {
  if (!target.allowed || !target.href || !target.ctaLabel) return null;
  // href DEVE ser path real (/app/...); nunca label em prosa
  if (!target.href.startsWith("/")) return null;
  if (/^(javascript|data|file):/i.test(target.href)) return null;
  return {
    type: "navigate",
    label: target.ctaLabel,
    href: target.href,
  };
}

/**
 * ÚNICA fonte de actions da NIA (100% server-side).
 * O LLM NUNCA gera actions — só content.
 * Sem destino confiável / sem RBAC / sem entitlement → null (sem fallback "Configurações").
 */
export function resolveNiaContextualAction(params: {
  question: string;
  allowedHrefs: Set<string>;
  features?: PlanFeatureFlags | null;
  permissions?: string[] | null;
  accessGateBlocked?: boolean;
  /** Preferir resultado já calculado da pesquisa */
  navTarget?: NiaNavTarget | null;
}): {
  type: "navigate";
  label: string;
  href: string;
  routeId: string;
} | null {
  const target =
    params.navTarget ||
    resolveNiaNavigationTarget({
      question: params.question,
      allowedHrefs: params.allowedHrefs,
      features: params.features,
      permissions: params.permissions,
      accessGateBlocked: params.accessGateBlocked,
    });

  if (!target.allowed || !target.href || !target.routeId) return null;
  if (target.reason === "unknown" || target.reason === "meta_no_cta") return null;
  if (!target.href.startsWith("/")) return null;
  if (!params.allowedHrefs.has(target.href)) return null;

  // Proibir "Configurações" como fallback opaco de dúvidas de conta
  if (
    target.routeId === "settings" &&
    /conta|senha|sess[aã]o|perfil|mfa/i.test(params.question) &&
    !/empresa|plano|encerramento|ia\s+da\s+empresa|api|webhook/i.test(params.question)
  ) {
    return null;
  }

  return {
    type: "navigate",
    label: target.ctaLabel || `Abrir ${target.label}`,
    href: target.href,
    routeId: target.routeId,
  };
}
