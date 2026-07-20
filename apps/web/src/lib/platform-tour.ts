/**
 * Tour da plataforma NexaFlow — fluido, sem repetir a mesma área.
 *
 * Etapa 1 · Mapa: só sidebar (onde fica cada coisa) — sem abrir páginas.
 * Etapa 2 · Agentes: aprofunda criação, modos, conhecimento e políticas.
 */

import type { Permission } from "./permissions";
import { hasPermission } from "./permissions";

/** v6 — fornecedor de IA (BYOK), handoff/fila, conhecimento, NIA */
export const PLATFORM_TOUR_VERSION = 6;

export type PlatformTourStatus =
  | "NOT_OFFERED"
  | "OFFERED"
  | "STARTED"
  | "COMPLETED"
  | "DISMISSED";

export type PlatformTourState = {
  status: PlatformTourStatus;
  version: number;
  offeredAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  dismissedAt?: string | null;
  lastStep?: string | null;
  dismissReason?: string | null;
  restartedAt?: string | null;
};

export type TourStage = "nav" | "agents";

export type TourPrepare =
  | "none"
  | "open-agent-create"
  | "close-agent-create"
  | "open-agent-edit"
  | "close-agent-edit"
  | "edit-tab-geral"
  | "edit-tab-comportamento"
  | "edit-tab-handoff";

export type TourStepId =
  // Etapa 1 — mapa (sidebar)
  | "map_home"
  | "map_inbox"
  | "map_contacts"
  | "map_crm"
  | "map_automations"
  | "map_team"
  | "map_nia"
  // Etapa 2 — agentes em profundidade
  | "agents_hub"
  | "agents_list"
  | "agents_mode"
  | "agents_actions"
  | "agents_edit_tabs"
  | "agents_edit_identity"
  | "agents_edit_mode"
  | "agents_edit_behavior"
  | "agents_edit_handoff"
  | "agents_create"
  | "agents_create_wizard"
  | "agents_create_manual"
  | "agents_learning"
  | "agents_knowledge"
  | "agents_company_ai"
  | "agents_attendance"
  | "agents_channel"
  | "agents_whats_new";

export type TourStepDef = {
  id: TourStepId;
  stage: TourStage;
  target: string;
  /** alvos alternativos se o principal não existir (ex.: lista vazia) */
  fallbackTargets?: string[];
  title: string;
  description: string;
  order: number;
  permissions?: Permission[];
  entitlement?: keyof TourEntitlements;
  /** rota a abrir (etapa 2). Etapa 1 não navega — só aponta a sidebar. */
  href?: string;
  prepare?: TourPrepare;
  /** se true, mantém a sidebar aberta (mapa). Default: stage==='nav' */
  keepSidebar?: boolean;
};

export type TourEntitlements = {
  inbox: boolean;
  crm: boolean;
  ai: boolean;
  automations: boolean;
  campaigns: boolean;
  reports: boolean;
};

/** Etapa 1 — mapa da sidebar (sem mudar de página). */
export const PLATFORM_TOUR_NAV_STEPS: TourStepDef[] = [
  {
    id: "map_home",
    stage: "nav",
    target: '[data-tour="nav-home"]',
    title: "Início",
    description: "Visão geral da operação.",
    order: 1,
    keepSidebar: true,
  },
  {
    id: "map_inbox",
    stage: "nav",
    target: '[data-tour="nav-inbox"]',
    title: "Conversas",
    description: "Atendimentos abertos e histórico de mensagens.",
    order: 2,
    permissions: ["conversations.read"],
    entitlement: "inbox",
    keepSidebar: true,
  },
  {
    id: "map_contacts",
    stage: "nav",
    target: '[data-tour="nav-contacts"]',
    title: "Contatos",
    description: "Clientes e leads cadastrados.",
    order: 3,
    permissions: ["contacts.read"],
    keepSidebar: true,
  },
  {
    id: "map_crm",
    stage: "nav",
    target: '[data-tour="nav-crm"]',
    title: "Funil",
    description: "Oportunidades e etapas de venda.",
    order: 4,
    permissions: ["crm.read"],
    entitlement: "crm",
    keepSidebar: true,
  },
  {
    id: "map_automations",
    stage: "nav",
    target: '[data-tour="nav-automations"]',
    title: "Automações",
    description: "Fluxos automáticos da operação.",
    order: 5,
    permissions: ["settings.read", "settings.update", "ai.manage"],
    entitlement: "automations",
    keepSidebar: true,
  },
  {
    id: "map_team",
    stage: "nav",
    target: '[data-tour="nav-team"]',
    title: "Equipe",
    description: "Membros, papéis e convites por e-mail.",
    order: 6,
    permissions: ["team.manage", "users.read"],
    keepSidebar: true,
  },
  {
    id: "map_nia",
    stage: "nav",
    target: '[data-tour="assistant-trigger"]',
    title: "NIA",
    description:
      "Assistente da plataforma: tira dúvidas, consulta o estado da sua conta e indica o próximo passo — sem misturar com os agentes que atendem clientes.",
    order: 7,
    keepSidebar: true,
  },
];

/** Etapa 2 — agentes (sem repetir o mapa). */
export const PLATFORM_TOUR_AGENTS_STEPS: TourStepDef[] = [
  {
    id: "agents_hub",
    stage: "agents",
    target: '[data-tour="ai-page-header"]',
    title: "Agentes",
    description: "Lista e criação dos agentes da empresa.",
    order: 10,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "close-agent-create",
  },
  {
    id: "agents_list",
    stage: "agents",
    target: '[data-tour="ai-agents-grid"]',
    fallbackTargets: ['[data-tour="ai-agents-empty"]'],
    title: "Lista de agentes",
    description: "Cada card mostra um agente, o status e o modo de resposta.",
    order: 11,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
  },
  {
    id: "agents_mode",
    stage: "agents",
    target: '[data-tour="ai-agent-mode"]',
    fallbackTargets: ['[data-tour="ai-agents-empty"]', '[data-tour="ai-page-header"]'],
    title: "Modo de resposta",
    description: "Sugestão, aprovação ou automático.",
    order: 12,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
  },
  {
    id: "agents_actions",
    stage: "agents",
    target: '[data-tour="ai-agent-actions"]',
    fallbackTargets: ['[data-tour="ai-new-agent"]'],
    title: "Testar e editar",
    description: "Teste o agente ou abra a configuração.",
    order: 13,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "close-agent-edit",
  },
  {
    id: "agents_edit_tabs",
    stage: "agents",
    target: '[data-tour="ai-edit-tabs"]',
    fallbackTargets: ['[data-tour="ai-manual-form"]', '[data-tour="ai-new-agent"]'],
    title: "Editar agente",
    description: "Abas: geral, comportamento, handoff, ferramentas e conhecimento.",
    order: 14,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "open-agent-edit",
  },
  {
    id: "agents_edit_identity",
    stage: "agents",
    target: '[data-tour="ai-edit-identity"]',
    fallbackTargets: ['[data-tour="ai-manual-identity"]'],
    title: "Identidade",
    description: "Nome, função e objetivo do agente.",
    order: 15,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "edit-tab-geral",
  },
  {
    id: "agents_edit_mode",
    stage: "agents",
    target: '[data-tour="ai-edit-mode"]',
    fallbackTargets: ['[data-tour="ai-manual-mode"]'],
    title: "Modo e status",
    description: "Como o agente responde e se está ativo.",
    order: 16,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "edit-tab-geral",
  },
  {
    id: "agents_edit_behavior",
    stage: "agents",
    target: '[data-tour="ai-edit-behavior"]',
    fallbackTargets: ['[data-tour="ai-manual-instructions"]'],
    title: "Comportamento",
    description: "Instruções, tom e limites do atendimento.",
    order: 17,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "edit-tab-comportamento",
  },
  {
    id: "agents_edit_handoff",
    stage: "agents",
    target: '[data-tour="ai-edit-handoff"]',
    fallbackTargets: ['[data-tour="ai-edit-behavior"]', '[data-tour="ai-edit-tabs"]'],
    title: "Handoff",
    description:
      "Quando passar para humano: regras, fila e aviso no painel (banner no topo). A equipe é notificada para assumir.",
    order: 18,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "edit-tab-handoff",
  },
  {
    id: "agents_create",
    stage: "agents",
    target: '[data-tour="ai-new-agent"]',
    title: "Novo agente",
    description: "Cria um agente com assistente ou de forma manual.",
    order: 19,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "close-agent-edit",
  },
  {
    id: "agents_create_wizard",
    stage: "agents",
    target: '[data-tour="ai-create-wizard"]',
    fallbackTargets: ['[data-tour="ai-new-agent"]'],
    title: "Criar com assistente",
    description: "Passo a passo para montar o agente.",
    order: 20,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "open-agent-create",
  },
  {
    id: "agents_create_manual",
    stage: "agents",
    target: '[data-tour="ai-create-manual"]',
    fallbackTargets: ['[data-tour="ai-new-agent"]'],
    title: "Criar manualmente",
    description: "Você preenche nome, função e instruções.",
    order: 21,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "open-agent-create",
  },
  {
    id: "agents_learning",
    stage: "agents",
    target: '[data-tour="ai-learning-link"]',
    title: "Aprendizado",
    description: "Registros e lacunas dos atendimentos.",
    order: 22,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/ai",
    prepare: "close-agent-create",
  },
  {
    id: "agents_knowledge",
    stage: "agents",
    target: '[data-tour="knowledge-header"]',
    title: "Conhecimento",
    description:
      "Base da empresa: publique como Pronto para a IA usar. Um botão para adicionar (manual ou importar).",
    order: 23,
    permissions: ["ai.manage"],
    entitlement: "ai",
    href: "/app/knowledge",
    prepare: "close-agent-create",
  },
  {
    id: "agents_company_ai",
    stage: "agents",
    target: '[data-tour="settings-ai-provider"]',
    fallbackTargets: ['[data-tour="settings-ai-panel"]', '[data-tour="settings-tab-ai"]'],
    title: "Fornecedor de IA",
    description:
      "Provedor e modelo da empresa (ou chave própria). A NIA usa a IA da plataforma — não a chave do tenant.",
    order: 24,
    permissions: ["settings.read", "ai.manage"],
    entitlement: "ai",
    href: "/app/settings?tab=ai",
    prepare: "close-agent-create",
  },
  {
    id: "agents_attendance",
    stage: "agents",
    target: '[data-tour="settings-attendance-handoff"]',
    fallbackTargets: [
      '[data-tour="settings-attendance-panel"]',
      '[data-tour="settings-tab-attendance"]',
    ],
    title: "Handoff e retorno",
    description:
      "Defina se a IA reassume quando o cliente volta a escrever sem humano atribuído, e o aviso sonoro da fila.",
    order: 25,
    permissions: ["settings.read"],
    href: "/app/settings?tab=attendance",
  },
  {
    id: "agents_channel",
    stage: "agents",
    target: '[data-tour="channels-header"]',
    title: "WhatsApp",
    description: "Conecte o número. Sem canal conectado, o agente AUTO não consegue responder.",
    order: 26,
    permissions: ["channels.manage", "settings.read"],
    href: "/app/integrations",
  },
  {
    id: "agents_whats_new",
    stage: "agents",
    target: '[data-tour="whats-new-header"]',
    fallbackTargets: ['[data-tour="assistant-trigger"]'],
    title: "Novidades",
    description: "O que mudou na NexaFlow. Também no menu do perfil.",
    order: 27,
    permissions: ["settings.read", "ai.manage", "team.manage"],
    href: "/app/whats-new",
    prepare: "close-agent-edit",
  },
];

export const PLATFORM_TOUR_STEPS: TourStepDef[] = [
  ...PLATFORM_TOUR_NAV_STEPS,
  ...PLATFORM_TOUR_AGENTS_STEPS,
];

export function parsePlanEntitlements(plan: unknown): TourEntitlements {
  const p = plan && typeof plan === "object" ? (plan as Record<string, unknown>) : {};
  const f =
    p.features && typeof p.features === "object"
      ? (p.features as Record<string, unknown>)
      : {};

  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;

  return {
    inbox: bool(f.inbox, true),
    crm: bool(f.crm, true),
    ai: bool(f.ai, true),
    automations: bool(f.automations ?? f.advancedAutomationEnabled, true),
    campaigns: bool(f.campaigns ?? f.campaignsEnabled, true),
    reports: bool(f.reports ?? f.advancedReportsEnabled, true),
  };
}

export function filterTourSteps(opts: {
  role?: string | null;
  platformRole?: string | null;
  impersonating?: boolean;
  entitlements: TourEntitlements;
  stage?: TourStage;
}): TourStepDef[] {
  const { role, platformRole, impersonating, entitlements, stage } = opts;

  return PLATFORM_TOUR_STEPS.filter((step) => {
    if (stage && step.stage !== stage) return false;
    if (step.entitlement && entitlements[step.entitlement] === false) {
      return false;
    }
    if (step.permissions?.length) {
      const ok = step.permissions.some((perm) =>
        hasPermission(role, platformRole, perm, { impersonating })
      );
      if (!ok) return false;
    }
    return true;
  }).sort((a, b) => a.order - b.order);
}

export function stageLabel(stage: TourStage): string {
  return stage === "nav" ? "Mapa" : "Agentes";
}

export function dispatchTourPrepare(prepare?: TourPrepare) {
  if (!prepare || prepare === "none" || typeof window === "undefined") return;
  const detail: Record<string, unknown> = {};
  if (prepare === "open-agent-create") {
    detail.openAgentCreate = true;
    detail.closeAgentEdit = true;
  }
  if (prepare === "close-agent-create") detail.closeAgentCreate = true;
  if (prepare === "open-agent-edit") {
    detail.openAgentEdit = true;
    detail.closeAgentCreate = true;
    detail.editTab = "geral";
  }
  if (prepare === "close-agent-edit") detail.closeAgentEdit = true;
  if (prepare === "edit-tab-geral") {
    detail.openAgentEdit = true;
    detail.editTab = "geral";
  }
  if (prepare === "edit-tab-comportamento") {
    detail.openAgentEdit = true;
    detail.editTab = "comportamento";
  }
  if (prepare === "edit-tab-handoff") {
    detail.openAgentEdit = true;
    detail.editTab = "handoff";
  }
  window.dispatchEvent(new CustomEvent("nexaflow:tour", { detail }));
}

export function tourHrefToDataAttr(href: string): string | null {
  const path = href.split("?")[0];
  const map: Record<string, string> = {
    "/app": "nav-home",
    "/app/inbox": "nav-inbox",
    "/app/contacts": "nav-contacts",
    "/app/crm": "nav-crm",
    "/app/tasks": "nav-tasks",
    "/app/campaigns": "nav-campaigns",
    "/app/automations": "nav-automations",
    "/app/ai": "nav-ai",
    "/app/knowledge": "nav-knowledge",
    "/app/team": "nav-team",
    "/app/integrations": "nav-integrations",
    "/app/reports": "nav-reports",
    "/app/settings": "nav-settings",
    "/app/whats-new": "whats-new-header",
  };
  return map[path] || null;
}
