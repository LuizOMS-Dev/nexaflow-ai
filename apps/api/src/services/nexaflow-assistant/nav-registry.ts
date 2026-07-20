/**
 * Rotas allowlisted para navegação do Assistente NexaFlow.
 * Nunca aceitar URL arbitrária do modelo.
 */
import type { Permission } from "../security/permissions";
import type { PlanFeatureFlags } from "../entitlements";

export type AssistantNavItem = {
  id: string;
  href: string;
  label: string;
  module: string;
  permission?: Permission;
  /** Chave em PlanFeatureFlags; se false, não oferece navegação */
  entitlement?: keyof PlanFeatureFlags;
};

export const ASSISTANT_NAV_REGISTRY: AssistantNavItem[] = [
  { id: "home", href: "/app", label: "Início", module: "home" },
  {
    id: "inbox",
    href: "/app/inbox",
    label: "Conversas",
    module: "inbox",
    permission: "conversations.read",
    entitlement: "inbox",
  },
  {
    id: "contacts",
    href: "/app/contacts",
    label: "Contatos",
    module: "contacts",
    permission: "contacts.read",
  },
  {
    id: "crm",
    href: "/app/crm",
    label: "Funil",
    module: "crm",
    permission: "crm.read",
    entitlement: "crm",
  },
  {
    id: "tasks",
    href: "/app/tasks",
    label: "Tarefas",
    module: "tasks",
    permission: "tasks.read",
  },
  {
    id: "campaigns",
    href: "/app/campaigns",
    label: "Campanhas",
    module: "campaigns",
    permission: "crm.read",
    entitlement: "campaigns",
  },
  {
    id: "automations",
    href: "/app/automations",
    label: "Fluxos",
    module: "automations",
    entitlement: "automations",
  },
  {
    id: "ai",
    href: "/app/ai",
    label: "Agentes",
    module: "ai",
    permission: "ai.manage",
    entitlement: "ai",
  },
  {
    id: "ai-learning",
    href: "/app/ai/learning",
    label: "Aprendizado",
    module: "ai",
    permission: "ai.manage",
    entitlement: "ai",
  },
  {
    id: "knowledge",
    href: "/app/knowledge",
    label: "Conhecimento",
    module: "knowledge",
    permission: "ai.manage",
    entitlement: "ai",
  },
  {
    id: "team",
    href: "/app/team",
    label: "Equipe",
    module: "team",
    permission: "team.manage",
  },
  {
    id: "integrations",
    href: "/app/integrations",
    label: "Canais",
    module: "channels",
    permission: "channels.manage",
  },
  {
    id: "reports",
    href: "/app/reports",
    label: "Relatórios",
    module: "reports",
    permission: "reports.read",
    entitlement: "reports",
  },
  {
    id: "settings",
    href: "/app/settings",
    label: "Configurações",
    module: "settings",
    permission: "settings.read",
  },
  {
    id: "settings-api",
    href: "/app/settings/api",
    label: "API",
    module: "api",
    permission: "settings.read",
    entitlement: "api",
  },
  {
    id: "settings-webhooks",
    href: "/app/settings/webhooks",
    label: "Webhooks",
    module: "webhooks",
    permission: "settings.read",
    entitlement: "api",
  },
  {
    id: "account",
    href: "/app/account",
    label: "Minha Conta",
    module: "account",
  },
  {
    id: "account-preferences",
    href: "/app/account/preferences",
    label: "Preferências",
    module: "account",
  },
  {
    id: "account-security",
    href: "/app/account/security",
    label: "Segurança",
    module: "account",
  },
  {
    id: "account-sessions",
    href: "/app/account/sessions",
    label: "Sessões",
    module: "account",
  },
  {
    id: "docs-api",
    href: "/docs/api",
    label: "Documentação da API",
    module: "docs",
    entitlement: "api",
  },
  {
    id: "whats-new",
    href: "/app/whats-new",
    label: "Novidades",
    module: "whats_new",
  },
];

export function resolveModuleFromPath(pathname?: string | null): {
  currentRoute: string;
  currentModule: string;
  currentPageTitle: string;
} {
  const path = (pathname || "/app").split("?")[0] || "/app";
  const exact = ASSISTANT_NAV_REGISTRY.find((r) => r.href === path);
  if (exact) {
    return {
      currentRoute: path,
      currentModule: exact.module,
      currentPageTitle: exact.label,
    };
  }
  // prefix match (mais longo primeiro)
  const sorted = [...ASSISTANT_NAV_REGISTRY].sort((a, b) => b.href.length - a.href.length);
  const pref = sorted.find((r) => r.href !== "/app" && path.startsWith(r.href));
  if (pref) {
    return {
      currentRoute: path,
      currentModule: pref.module,
      currentPageTitle: pref.label,
    };
  }
  if (path.startsWith("/app")) {
    return { currentRoute: path, currentModule: "app", currentPageTitle: "NexaFlow" };
  }
  return { currentRoute: path, currentModule: "unknown", currentPageTitle: "NexaFlow" };
}

export const CONTEXT_SUGGESTIONS: Record<string, string[]> = {
  inbox: [
    "Como assumir um atendimento?",
    "Como transferir uma conversa?",
    "Como funciona o modo Aprovação?",
  ],
  ai: [
    "Como criar um agente?",
    "Qual a diferença entre Copiloto, Aprovação e Automático?",
    "Como adicionar conhecimento?",
  ],
  knowledge: [
    "Como adicionar conhecimento?",
    "Como vincular conhecimento a um agente?",
    "Por que meu conhecimento está em Rascunho?",
  ],
  webhooks: [
    "Como criar um Webhook?",
    "Como testar uma integração?",
    "Por que meu Webhook está falhando?",
  ],
  api: [
    "Como criar uma chave?",
    "Meu plano possui API?",
    "Como revogar uma chave?",
  ],
  channels: [
    "Como conectar meu WhatsApp?",
    "Por que meu WhatsApp desconectou?",
    "Como reconectar?",
  ],
  crm: [
    "Como funciona o Funil?",
    "Como mover uma oportunidade?",
    "Como criar uma oportunidade?",
  ],
  automations: [
    "Como faço uma automação?",
    "Como ativo um fluxo?",
    "O que acontece se a automação falhar?",
  ],
  team: ["Como adiciono um usuário?", "Como suspendo um usuário?", "Quais papéis existem?"],
  settings: [
    "Como configurar a IA?",
    "Como alterar preferências?",
    "Como funciona meu plano?",
  ],
  account: [
    "Como inicio o tour da plataforma?",
    "Como altero minha senha?",
    "Onde vejo minhas sessões?",
  ],
  contacts: ["Como edito um contato?", "Como arquivo um contato?", "Como qualifico um lead?"],
  campaigns: ["Como crio uma campanha?", "Como acompanho resultados?", "Quem pode enviar campanhas?"],
  tasks: ["Como crio uma tarefa?", "Como marco como concluída?", "Como atribuo a alguém?"],
  reports: ["O que vejo nos relatórios?", "Como filtro por período?", "O que significa cada métrica?"],
  home: [
    "Como conecto meu WhatsApp?",
    "Como crio um agente?",
    "Como adiciono conhecimento?",
  ],
  default: [
    "Como conecto meu WhatsApp?",
    "Como crio um agente?",
    "Como adiciono conhecimento?",
  ],
};

/** Até 3 sugestões contextuais por módulo (UI da NIA). */
export function suggestionsForModule(module: string): string[] {
  const list = CONTEXT_SUGGESTIONS[module] || CONTEXT_SUGGESTIONS.default;
  return list.slice(0, 3);
}

export type SuggestionFilterContext = {
  module: string;
  features: PlanFeatureFlags;
  /** permissões do papel (ex.: settings.update) */
  permissions?: string[];
  accessGateLevel?: string | null;
  operationalPaused?: boolean;
};

/**
 * Sugestões finais = módulo + entitlement + RBAC + Access Gate.
 * Nunca induz recurso indisponível no plano ou sem permissão.
 */
export function suggestionsForContext(ctx: SuggestionFilterContext): string[] {
  const raw = CONTEXT_SUGGESTIONS[ctx.module] || CONTEXT_SUGGESTIONS.default;
  const perms = new Set(ctx.permissions || []);
  const features = ctx.features || ({} as PlanFeatureFlags);
  const gateBlocked =
    ctx.accessGateLevel === "BLOCKED" ||
    ctx.accessGateLevel === "RESTRICTED" ||
    ctx.operationalPaused === true;

  const has = (p: string) => perms.size === 0 || perms.has(p);
  const hasApi = features.api === true;
  // Webhooks seguem API/automations no produto (sem flag dedicada em alguns planos)
  const hasWebhooks = features.api === true || features.automations === true;
  const hasAi = features.ai !== false;
  const hasInbox = features.inbox !== false;
  const hasCrm = features.crm !== false;
  const hasCampaigns = features.campaigns === true || features.campaignsEnabled === true;

  const out: string[] = [];
  for (const s of raw) {
    const lower = s.toLowerCase();

    // Access Gate: não sugerir ações operacionais impossíveis
    if (gateBlocked) {
      if (
        /criar|conectar|enviar|ativar|configurar\s+(a\s+)?ia|campanha|automa|webhook|chave de api|reconectar/i.test(
          s
        )
      ) {
        // Preferir perguntas explicativas
        if (!/por\s+que|como funciona|meu plano|restr|bloque|acesso/i.test(s)) continue;
      }
    }

    // API
    if (/chave de api|criar uma chave|revogar uma chave|utilizar a api/i.test(s)) {
      if (!hasApi) {
        // substituto informativo
        if (!out.some((x) => /plano.*api|acesso à api|possui api/i.test(x))) {
          out.push("Meu plano possui acesso à API?");
        }
        continue;
      }
      if (!has("settings.update") && !has("settings.read")) {
        if (!out.some((x) => /n[aã]o consigo.*api|gerenciar a api/i.test(x))) {
          out.push("Por que não consigo gerenciar a API?");
        }
        continue;
      }
      if (/criar|revogar/i.test(s) && !has("settings.update")) continue;
    }
    if (/meu plano possui api|acesso à api|como funciona a api/i.test(s)) {
      // sempre ok (informação)
    }

    // Webhooks
    if (/criar um webhook|testar.*webhook|webhook est[aá] falhando/i.test(s)) {
      if (!hasWebhooks) {
        if (!out.some((x) => /plano.*webhook|possuem webhook|funcionam os webhooks/i.test(x))) {
          out.push("Meu plano possui Webhooks?");
        }
        continue;
      }
      if (!has("settings.update") && !has("settings.read")) continue;
    }

    // WhatsApp / canais — criar/reconectar exige manage
    if (/conectar meu whatsapp|reconectar/i.test(s)) {
      if (perms.size > 0 && !has("channels.manage") && !has("settings.update")) {
        continue;
      }
    }

    // Agentes
    if (/criar um agente/i.test(s)) {
      if (!hasAi) continue;
      if (perms.size > 0 && !has("ai.manage")) continue;
    }
    if (/modo.*autom[aá]tico|copiloto|aprova/i.test(s) && !hasAi) continue;

    // Knowledge
    if (/adicionar conhecimento|vincular conhecimento/i.test(s)) {
      if (perms.size > 0 && !has("ai.manage") && !has("settings.update")) {
        if (!/rascunho/i.test(s)) continue;
      }
    }

    // CRM
    if (/funil|oportunidade/i.test(s) && hasCrm === false) continue;

    // Inbox
    if (/assumir um atendimento|transferir uma conversa/i.test(s) && hasInbox === false) continue;

    // Campaigns
    if (/campanha/i.test(s) && !hasCampaigns) continue;

    // Automations
    if (/automa|fluxo/i.test(s) && features.automations === false) continue;

    if (!out.includes(s)) out.push(s);
    if (out.length >= 3) break;
  }

  // Preencher se filtro esvaziou demais
  if (out.length === 0) {
    return ["Como funciona a NexaFlow?", "Onde vejo meu plano?", "Como inicio o tour da plataforma?"].slice(
      0,
      3
    );
  }
  return out.slice(0, 3);
}
