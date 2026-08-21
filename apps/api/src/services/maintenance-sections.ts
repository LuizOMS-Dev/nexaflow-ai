export type TenantSection =
  | "HOME"
  | "CONVERSATIONS"
  | "CONTACTS"
  | "PIPELINE"
  | "FINANCE"
  | "TASKS"
  | "CAMPAIGNS"
  | "FLOWS"
  | "AGENTS"
  | "KNOWLEDGE"
  | "TEAM"
  | "CHANNELS"
  | "REPORTS"
  | "SETTINGS";

export type SectionGroup = "GERAL" | "VENDAS" | "AUTOMAÇÃO" | "GESTÃO";

export type SectionMeta = {
  id: TenantSection;
  label: string;
  group: SectionGroup;
  shortDescription: string;
  defaultTitle: string;
  defaultMessage: string;
  routePrefixes: string[];
  apiPrefixes: string[];
};

export const TENANT_SECTIONS: Record<TenantSection, SectionMeta> = {
  HOME: {
    id: "HOME",
    label: "Início",
    group: "GERAL",
    shortDescription: "Painel inicial e visão geral da empresa.",
    defaultTitle: "Início temporariamente indisponível",
    defaultMessage: "Estamos realizando melhorias na tela inicial. As demais áreas continuam funcionando normalmente.",
    routePrefixes: ["/app", "/app/dashboard", "/app/overview"],
    apiPrefixes: ["/dashboard"],
  },
  CONVERSATIONS: {
    id: "CONVERSATIONS",
    label: "Conversas",
    group: "GERAL",
    shortDescription: "Atendimento e histórico de conversas.",
    defaultTitle: "Conversas temporariamente indisponíveis",
    defaultMessage: "Estamos realizando melhorias no módulo de atendimento. As demais áreas do NexaFlow continuam funcionando normalmente.",
    routePrefixes: ["/app/inbox", "/app/conversations"],
    apiPrefixes: ["/conversations", "/media"],
  },
  CONTACTS: {
    id: "CONTACTS",
    label: "Contatos",
    group: "VENDAS",
    shortDescription: "Gestão e segmentação de contatos.",
    defaultTitle: "Contatos temporariamente indisponíveis",
    defaultMessage: "Estamos atualizando o módulo de contatos. As demais funcionalidades continuam disponíveis.",
    routePrefixes: ["/app/contacts"],
    apiPrefixes: ["/contacts"],
  },
  PIPELINE: {
    id: "PIPELINE",
    label: "Funil",
    group: "VENDAS",
    shortDescription: "Funil de vendas e oportunidades.",
    defaultTitle: "Funil de vendas temporariamente indisponível",
    defaultMessage: "Estamos realizando manutenção no módulo de CRM. As demais áreas continuam operando normalmente.",
    routePrefixes: ["/app/crm", "/app/pipelines", "/app/deals"],
    apiPrefixes: ["/pipelines", "/stages", "/opportunities"],
  },
  FINANCE: {
    id: "FINANCE",
    label: "Financeiro",
    group: "VENDAS",
    shortDescription: "Faturamento e cobranças da empresa.",
    defaultTitle: "Módulo financeiro em manutenção",
    defaultMessage: "Estamos realizando melhorias no faturamento e cobranças da empresa.",
    routePrefixes: ["/app/finance", "/app/billing"],
    apiPrefixes: ["/finance"],
  },
  TASKS: {
    id: "TASKS",
    label: "Tarefas",
    group: "VENDAS",
    shortDescription: "Gerenciamento de tarefas e lembretes.",
    defaultTitle: "Tarefas temporariamente indisponíveis",
    defaultMessage: "Estamos atualizando o módulo de tarefas. As demais áreas continuam funcionando normalmente.",
    routePrefixes: ["/app/tasks"],
    apiPrefixes: ["/tasks"],
  },
  CAMPAIGNS: {
    id: "CAMPAIGNS",
    label: "Campanhas",
    group: "VENDAS",
    shortDescription: "Disparos em massa e campanhas.",
    defaultTitle: "Campanhas temporariamente indisponíveis",
    defaultMessage: "Estamos realizando melhorias na gestão de campanhas. Disparos agendados continuam sendo processados.",
    routePrefixes: ["/app/campaigns"],
    apiPrefixes: ["/campaigns"],
  },
  FLOWS: {
    id: "FLOWS",
    label: "Fluxos",
    group: "AUTOMAÇÃO",
    shortDescription: "Engine de automações e fluxos.",
    defaultTitle: "Editor de fluxos em manutenção",
    defaultMessage: "Estamos atualizando a engine de automações. Fluxos já ativos continuam rodando normalmente.",
    routePrefixes: ["/app/automations"],
    apiPrefixes: ["/automations"],
  },
  AGENTS: {
    id: "AGENTS",
    label: "Agentes",
    group: "AUTOMAÇÃO",
    shortDescription: "Agentes de inteligência artificial.",
    defaultTitle: "Configuração de agentes em manutenção",
    defaultMessage: "Estamos atualizando a gestão de agentes. Agentes já publicados continuam respondendo normalmente.",
    routePrefixes: ["/app/ai", "/app/ai-agents", "/app/agents"],
    apiPrefixes: ["/ai-agents", "/agent-advanced"],
  },
  KNOWLEDGE: {
    id: "KNOWLEDGE",
    label: "Conhecimento",
    group: "AUTOMAÇÃO",
    shortDescription: "Bases e documentos utilizados pelos agentes.",
    defaultTitle: "Base de conhecimento em manutenção",
    defaultMessage: "Estamos atualizando a gestão de documentos. Os documentos indexados continuam disponíveis para consulta da IA.",
    routePrefixes: ["/app/knowledge"],
    apiPrefixes: ["/knowledge"],
  },
  TEAM: {
    id: "TEAM",
    label: "Equipe",
    group: "GESTÃO",
    shortDescription: "Administração de membros e permissões.",
    defaultTitle: "Gestão de equipe temporariamente indisponível",
    defaultMessage: "Estamos atualizando a administração de membros e permissões.",
    routePrefixes: ["/app/team"],
    apiPrefixes: ["/team"],
  },
  CHANNELS: {
    id: "CHANNELS",
    label: "Canais",
    group: "GESTÃO",
    shortDescription: "Configuração dos canais de comunicação.",
    defaultTitle: "Gerenciador de canais em manutenção",
    defaultMessage: "Estamos realizando melhorias na conexão de canais. Canais já conectados continuam funcionando e recebendo mensagens.",
    routePrefixes: ["/app/integrations", "/app/channels", "/app/whatsapp"],
    apiPrefixes: ["/whatsapp"],
  },
  REPORTS: {
    id: "REPORTS",
    label: "Relatórios",
    group: "GESTÃO",
    shortDescription: "Central de métricas e relatórios.",
    defaultTitle: "Relatórios temporariamente indisponíveis",
    defaultMessage: "Estamos atualizando a central de métricas e relatórios.",
    routePrefixes: ["/app/reports", "/app/analytics"],
    apiPrefixes: ["/reports"],
  },
  SETTINGS: {
    id: "SETTINGS",
    label: "Configurações",
    group: "GESTÃO",
    shortDescription: "Opções de configuração da empresa.",
    defaultTitle: "Configurações em manutenção",
    defaultMessage: "Estamos realizando melhorias nas opções de configuração da empresa.",
    routePrefixes: ["/app/settings", "/app/account"],
    apiPrefixes: ["/settings"],
  },
};

export const ALL_SECTIONS: TenantSection[] = [
  "HOME",
  "CONVERSATIONS",
  "CONTACTS",
  "PIPELINE",
  "FINANCE",
  "TASKS",
  "CAMPAIGNS",
  "FLOWS",
  "AGENTS",
  "KNOWLEDGE",
  "TEAM",
  "CHANNELS",
  "REPORTS",
  "SETTINGS",
];

export function resolveSectionFromPath(path: string): TenantSection | null {
  const clean = path.split("?")[0].toLowerCase();

  if (clean.startsWith("/app/inbox") || clean.startsWith("/app/conversations")) return "CONVERSATIONS";
  if (clean.startsWith("/app/contacts")) return "CONTACTS";
  if (clean.startsWith("/app/crm") || clean.startsWith("/app/pipelines") || clean.startsWith("/app/deals")) return "PIPELINE";
  if (clean.startsWith("/app/finance") || clean.startsWith("/app/billing")) return "FINANCE";
  if (clean.startsWith("/app/tasks")) return "TASKS";
  if (clean.startsWith("/app/campaigns")) return "CAMPAIGNS";
  if (clean.startsWith("/app/automations")) return "FLOWS";
  if (clean.startsWith("/app/ai") || clean.startsWith("/app/ai-agents") || clean.startsWith("/app/agents")) return "AGENTS";
  if (clean.startsWith("/app/knowledge")) return "KNOWLEDGE";
  if (clean.startsWith("/app/team")) return "TEAM";
  if (clean.startsWith("/app/integrations") || clean.startsWith("/app/channels") || clean.startsWith("/app/whatsapp")) return "CHANNELS";
  if (clean.startsWith("/app/reports") || clean.startsWith("/app/analytics")) return "REPORTS";
  if (clean.startsWith("/app/settings") || clean.startsWith("/app/account")) return "SETTINGS";
  if (clean === "/app" || clean === "/app/" || clean.startsWith("/app/dashboard")) return "HOME";

  return null;
}
