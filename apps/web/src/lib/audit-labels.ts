/**
 * Labels humanos para eventos de auditoria.
 * Código técnico permanece no backend e em "Ver detalhes".
 */

const EXACT: Record<string, string> = {
  "auth.login": "Login realizado",
  "auth.logout": "Logout realizado",
  "auth.login.failed": "Falha de login",
  "auth.mfa.enabled": "Autenticação em duas etapas ativada",
  "auth.mfa.disabled": "Autenticação em duas etapas desativada",
  "auth.mfa.verified": "Segundo fator verificado",
  "auth.mfa.failed": "Falha no segundo fator",
  "auth.password.changed": "Senha alterada",
  "auth.password.reset": "Redefinição de senha",
  "auth.session.revoked": "Sessão revogada",
  "auth.sessions.revoked_all": "Todas as sessões revogadas",
  "auth.switch_tenant": "Troca de empresa",
  "admin.impersonate": "Acesso assistido (impersonação) iniciado",
  "admin.impersonate.stop": "Acesso assistido encerrado",
  "admin.tenant.create": "Empresa criada",
  "admin.tenant.update": "Empresa atualizada",
  "admin.tenant.suspend": "Empresa suspensa",
  "admin.tenant.archive": "Empresa arquivada",
  "admin.membership.update": "Membro da empresa atualizado",
  "admin.membership.remove": "Membro removido da empresa",
  "company.blocked": "Empresa bloqueada",
  "company.unblocked": "Empresa desbloqueada",
  "company.suspended": "Empresa suspensa",
  "company.reactivated": "Empresa reativada",
  "company.subscription_canceled": "Assinatura cancelada",
  "company.payment_registered": "Pagamento registrado",
  "company.due_date_changed": "Vencimento alterado",
  "company.plan_changed": "Plano alterado",
  "company.deletion_requested": "Exclusão de empresa solicitada",
  "company.deletion_canceled": "Exclusão de empresa cancelada",
  "company.deleted": "Empresa excluída",
  "company.created": "Empresa criada",
  "company.updated": "Empresa atualizada",
  "tenant.onboarding.completed": "Onboarding da empresa concluído",
  "tour.offered": "Tour da plataforma oferecido",
  "tour.started": "Tour da plataforma iniciado",
  "tour.dismissed": "Tour da plataforma dispensado",
  "tour.exited": "Tour da plataforma interrompido",
  "tour.completed": "Tour da plataforma concluído",
  "tour.restarted": "Tour da plataforma reiniciado",
  "automation.delete": "Fluxo excluído",
  "contact.delete": "Contato excluído",
  "plan.updated": "Plano do catálogo atualizado",
  "plan.created": "Plano do catálogo criado",
  "admin.logs.cleared": "Logs de auditoria limpos",
  "admin.tenant.logs.cleared": "Logs da empresa limpos",
  "learning.enabled": "Aprendizado contínuo ativado",
  "learning.disabled": "Aprendizado contínuo desativado",
  "learning.level_changed": "Nível de aprendizado alterado",
  "learning.source_enabled": "Fonte de aprendizado ativada",
  "learning.source_disabled": "Fonte de aprendizado desativada",
  "learning.suggestion_approved": "Sugestão de aprendizado aprovada",
  "learning.suggestion_rejected": "Sugestão de aprendizado rejeitada",
  "learning.suggestion_archived": "Sugestão de aprendizado arquivada",
  "learning.suggestion_pending": "Sugestão de aprendizado reaberta",
  "learning.suggestion_updated": "Sugestão de aprendizado atualizada",
  "learning.knowledge_created": "Conhecimento criado a partir do aprendizado",
  "learning.gap_resolved": "Lacuna de conhecimento resolvida",
  "learning.gap_ignored": "Lacuna de conhecimento ignorada",
  "learning.gap_reviewing": "Lacuna em análise",
  "learning.gap_new": "Lacuna marcada como nova",
  "conversation.closed": "Atendimento finalizado",
  "conversation.closed_human": "Atendimento finalizado pelo atendente",
  "conversation.auto_closed_inactivity": "Atendimento encerrado por inatividade",
  "conversation.auto_closed_ai": "Atendimento encerrado pela IA",
  "conversation.reopened": "Atendimento reaberto",
  "conversation.archived": "Atendimento arquivado",
};

const PREFIX: Array<[string, string]> = [
  ["auth.login", "Login"],
  ["auth.mfa", "Autenticação em duas etapas"],
  ["auth.session", "Sessão"],
  ["auth.password", "Senha"],
  ["auth.", "Autenticação"],
  ["admin.tenant", "Empresa (admin)"],
  ["admin.membership", "Membro"],
  ["admin.impersonate", "Impersonação"],
  ["admin.", "Administração"],
  ["company.", "Empresa"],
  ["security.", "Segurança"],
  ["whatsapp.", "WhatsApp"],
  ["ai.", "IA"],
  ["learning.", "Aprendizado"],
  ["contact.", "Contato"],
  ["conversation.", "Conversa"],
  ["automation.", "Automação"],
];

export function humanizeAuditAction(action: string): string {
  if (!action) return "Evento";
  if (EXACT[action]) return EXACT[action];
  for (const [prefix, label] of PREFIX) {
    if (action.startsWith(prefix)) {
      const rest = action.slice(prefix.length).replace(/[._]/g, " ").trim();
      if (!rest) return label;
      // fallback legível sem código cru
      return `${label}: ${rest}`;
    }
  }
  // Último recurso: humanizar pontos
  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatAuditIp(ip?: string | null): string {
  if (!ip) return "—";
  if (
    /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(ip) ||
    ip === "localhost"
  ) {
    return `Rede interna / proxy (${ip})`;
  }
  return ip;
}
