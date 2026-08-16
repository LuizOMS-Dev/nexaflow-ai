export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Trial",
  BLOCKED: "Bloqueada",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  PENDING_DELETION: "Exclusão",
  INVITED: "Convidado",
  DISABLED: "Bloqueado",
  PENDING_VERIFICATION: "Pendente",
};

export const FINANCIAL_LABEL: Record<string, string> = {
  IN_GOOD_STANDING: "Em dia",
  DUE_TODAY: "Vence hoje",
  DUE_SOON: "Vence em breve",
  OVERDUE: "Em atraso",
  PAYMENT_PENDING: "Pagamento pendente",
  TRIAL: "Trial",
  CANCELLED: "Cancelada",
  SUSPENDED: "Suspensa",
  UNKNOWN: "Sem cobrança",
  NEEDS_ATTENTION: "Precisa atenção",
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  AGENT: "Atendente",
  SALES: "Comercial",
  READONLY: "Somente leitura",
  SUPERADMIN: "Superadmin",
};

export function statusTone(code?: string): "ok" | "warn" | "danger" | "muted" | "info" {
  if (code === "ACTIVE" || code === "IN_GOOD_STANDING" || code === "CONVERTED") return "ok";
  if (
    code === "TRIAL" ||
    code === "DUE_SOON" ||
    code === "DUE_TODAY" ||
    code === "INVITED" ||
    code === "NEW" ||
    code === "CONTACTED"
  ) {
    return "info";
  }
  if (code === "SUSPENDED" || code === "PAYMENT_PENDING" || code === "QUALIFIED") return "warn";
  if (
    code === "BLOCKED" ||
    code === "OVERDUE" ||
    code === "DISABLED" ||
    code === "PENDING_DELETION" ||
    code === "SPAM"
  ) {
    return "danger";
  }
  return "muted";
}

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  CONVERTED: "Convertido",
  LOST: "Perdido",
  SPAM: "Spam",
};

export const USAGE_LABEL: Record<string, string> = {
  users: "Usuários",
  contacts: "Contatos",
  conversations: "Conversas",
  messages: "Mensagens",
  channels: "Canais",
  aiMessages: "Msgs IA",
  agents: "Agentes",
  automations: "Automações",
};

export function actionLabel(action: string) {
  const map: Record<string, string> = {
    "admin.tenant.create": "Empresa criada",
    "admin.tenant.update": "Empresa atualizada",
    "admin.impersonate": "Acesso à empresa iniciado",
    "admin.impersonate.stop": "Acesso à empresa encerrado",
    "company.blocked": "Empresa bloqueada",
    "company.unblocked": "Empresa desbloqueada",
    "company.suspended": "Empresa suspensa",
    "company.reactivated": "Empresa reativada",
    "company.payment_registered": "Pagamento registrado",
    "company.plan_changed": "Plano alterado",
    "company.due_date_changed": "Vencimento alterado",
    "company.deletion_requested": "Exclusão solicitada",
    "user.blocked": "Usuário bloqueado",
    "user.suspended": "Usuário suspenso",
    "user.reactivated": "Usuário reativado",
    "plan.updated": "Plano atualizado",
    "platform.access_policy_updated": "Política de acesso atualizada",
  };
  return map[action] || action.replace(/[._]/g, " ");
}

export function usageLabel(key: string) {
  return USAGE_LABEL[key] || key;
}
