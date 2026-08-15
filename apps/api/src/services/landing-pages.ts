/**
 * Allowlist estrita e resolução de páginas iniciais pós-login (Superadmin e Workspace).
 * Protege contra URLs arbitrárias e ataques de redirecionamento.
 */

export const ADMIN_LANDING_PAGES = {
  OVERVIEW: { key: "OVERVIEW", label: "Visão geral", path: "/admin" },
  COMPANIES: { key: "COMPANIES", label: "Empresas", path: "/admin/companies" },
  USERS: { key: "USERS", label: "Usuários", path: "/admin/users" },
  FINANCE: { key: "FINANCE", label: "Financeiro", path: "/admin/finance" },
  PLANS: { key: "PLANS", label: "Planos", path: "/admin/plans" },
  SYSTEM: { key: "SYSTEM", label: "Sistema & Diagnóstico", path: "/admin/system" },
} as const;

export type AdminLandingKey = keyof typeof ADMIN_LANDING_PAGES;

export const WORKSPACE_LANDING_PAGES = {
  HOME: { key: "HOME", label: "Início (Painel)", path: "/app" },
  INBOX: { key: "INBOX", label: "Caixa de entrada", path: "/app/inbox" },
  CRM: { key: "CRM", label: "CRM & Oportunidades", path: "/app/crm" },
  CONTACTS: { key: "CONTACTS", label: "Contatos", path: "/app/contacts" },
  TASKS: { key: "TASKS", label: "Tarefas", path: "/app/tasks" },
  AUTOMATIONS: { key: "AUTOMATIONS", label: "Automações", path: "/app/automations" },
  AI: { key: "AI", label: "Agentes de IA", path: "/app/ai" },
  REPORTS: { key: "REPORTS", label: "Relatórios", path: "/app/reports" },
  SETTINGS: { key: "SETTINGS", label: "Configurações", path: "/app/settings" },
} as const;

export type WorkspaceLandingKey = keyof typeof WORKSPACE_LANDING_PAGES;

export function isValidAdminLanding(key: string): key is AdminLandingKey {
  return Object.prototype.hasOwnProperty.call(ADMIN_LANDING_PAGES, key);
}

export function isValidWorkspaceLanding(key: string): key is WorkspaceLandingKey {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_LANDING_PAGES, key);
}

export function resolveAdminLandingPath(key?: string | null): string {
  if (key && isValidAdminLanding(key)) {
    return ADMIN_LANDING_PAGES[key].path;
  }
  return ADMIN_LANDING_PAGES.OVERVIEW.path;
}

export function resolveWorkspaceLandingPath(key?: string | null): string {
  if (key && isValidWorkspaceLanding(key)) {
    return WORKSPACE_LANDING_PAGES[key].path;
  }
  return WORKSPACE_LANDING_PAGES.HOME.path;
}
