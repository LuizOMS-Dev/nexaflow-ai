/**
 * Mapeamento e classificação centralizada de eventos de auditoria em pt-BR.
 * O código técnico (eventCode) permanece intacto no backend e visível discretamente na UI.
 */

export type AuditSeverityLabel = "Sucesso" | "Informação" | "Atenção" | "Falha" | "Crítico";
export type AuditSeverityTone = "success" | "info" | "warning" | "danger" | "neutral" | "violet";

export interface AuditSeverityInfo {
  tone: "success" | "info" | "warning" | "danger";
  label: AuditSeverityLabel;
}

const EXACT_TITLES: Record<string, string> = {
  // Deploy e Rollback
  "deployment.started": "Implantação iniciada",
  "deployment.completed": "Implantação concluída",
  "deployment.succeeded": "Implantação concluída",
  "deployment.failed": "Implantação falhou",
  "deployment.rollback_requested": "Reversão de versão solicitada",
  "deployment.rollback_started": "Reversão de versão iniciada",
  "deployment.rollback_completed": "Reversão de versão concluída",
  "deployment.rollback_failed": "Reversão de versão falhou",
  "deployment.history.clear_requested": "Limpeza do histórico de implantações solicitada",
  "deployment.history.cleared": "Histórico de implantações limpo",
  "deployment.history.clear_failed": "Falha ao limpar histórico de implantações",
  "deployment_history.clear_requested": "Limpeza do histórico de implantações solicitada",
  "deployment_history.cleared": "Histórico de implantações limpo",
  "deployment_history.clear_failed": "Falha ao limpar histórico de implantações",

  // GitHub
  "github.connection.tested": "Conexão com o GitHub testada",
  "github.configuration.updated": "Configuração do GitHub atualizada",
  "github.token.rotated": "Token do GitHub rotacionado",
  "github_updates.clear_requested": "Limpeza de atualizações do GitHub solicitada",
  "github_updates.cleared": "Histórico recente do GitHub limpo",
  "github_updates.clear_failed": "Falha ao limpar atualizações do GitHub",
  "github.update_history.cleared": "Histórico recente do GitHub limpo",

  // EasyPanel
  "easypanel.connection.tested": "Conexão com o EasyPanel testada",
  "easypanel.configuration.updated": "Configuração do EasyPanel atualizada",
  "easypanel.token.rotated": "Token do EasyPanel rotacionado",

  // Auditoria
  "audit.history.clear_requested": "Limpeza do histórico de auditoria solicitada",
  "audit.history.cleared": "Histórico de auditoria limpo",
  "audit.history.clear_failed": "Falha ao limpar histórico de auditoria",
  "admin.logs.cleared": "Histórico de auditoria limpo",
  "admin.tenant.logs.cleared": "Logs da empresa limpos",

  // Autenticação e Segurança
  "auth.login": "Login administrativo realizado",
  "auth.logout": "Logout administrativo realizado",
  "auth.login.failed": "Tentativa de login falhou",
  "auth.mfa.enabled": "Autenticação em duas etapas ativada",
  "auth.mfa.disabled": "Autenticação em duas etapas desativada",
  "auth.2fa.enabled": "Autenticação em duas etapas ativada",
  "auth.2fa.disabled": "Autenticação em duas etapas desativada",
  "auth.mfa.verified": "Segundo fator verificado",
  "auth.mfa.failed": "Falha no segundo fator",
  "auth.password.changed": "Senha de acesso alterada",
  "auth.password.reset": "Redefinição de senha solicitada",
  "auth.session.revoked": "Sessão revogada",
  "auth.sessions.revoked_all": "Todas as sessões revogadas",
  "auth.switch_tenant": "Troca de empresa",
  "admin.impersonate": "Acesso como empresa iniciado",
  "admin.impersonate.stop": "Acesso como empresa encerrado",

  // Empresas / Tenants
  "admin.tenant.create": "Empresa criada",
  "admin.tenant.update": "Empresa atualizada",
  "admin.tenant.suspend": "Empresa suspensa",
  "admin.tenant.archive": "Empresa arquivada",
  "admin.membership.update": "Membro da empresa atualizado",
  "admin.membership.remove": "Membro removido da empresa",
  "tenant.create": "Empresa criada",
  "tenant.created": "Empresa criada",
  "tenant.update": "Empresa atualizada",
  "tenant.updated": "Empresa atualizada",
  "tenant.onboarding.completed": "Configuração da empresa concluída",
  "company.created": "Empresa criada",
  "company.updated": "Empresa atualizada",
  "company.blocked": "Empresa bloqueada",
  "company.unblocked": "Empresa desbloqueada",
  "company.suspended": "Empresa suspensa",
  "company.reactivated": "Empresa reativada",
  "company.subscription_canceled": "Assinatura cancelada",
  "company.payment_registered": "Pagamento registrado",
  "company.due_date_changed": "Data de vencimento alterada",
  "company.plan_changed": "Plano da empresa alterado",
  "company.deletion_requested": "Exclusão de empresa solicitada",
  "company.deletion_canceled": "Exclusão de empresa cancelada",
  "company.deleted": "Empresa excluída",

  // Usuários
  "user.create": "Novo usuário cadastrado",
  "user.created": "Novo usuário cadastrado",
  "user.update": "Usuário atualizado",
  "user.updated": "Usuário atualizado",
  "user.status.updated": "Status de usuário atualizado",
  "user.blocked": "Usuário bloqueado",
  "user.suspended": "Usuário suspenso",
  "user.reactivated": "Usuário reativado",

  // Planos e Finanças
  "plan.created": "Plano criado",
  "plan.updated": "Plano atualizado",
  "admin.plan.create": "Plano criado",
  "admin.plan.update": "Plano atualizado",
  "subscription.created": "Assinatura criada",
  "subscription.updated": "Assinatura atualizada",
  "admin.cost.create": "Custo operacional registrado",
  "admin.cost.update": "Custo operacional atualizado",
  "admin.cost.delete": "Custo operacional removido",
  "platform.access_policy_updated": "Política global de acesso atualizada",

  // Recursos Operacionais
  "channel.connected": "Canal conectado",
  "channel.disconnected": "Canal desconectado",
  "automation.delete": "Fluxo excluído",
  "contact.delete": "Contato excluído",
  "tour.offered": "Tour da plataforma oferecido",
  "tour.started": "Tour da plataforma iniciado",
  "tour.dismissed": "Tour da plataforma dispensado",
  "tour.exited": "Tour da plataforma interrompido",
  "tour.completed": "Tour da plataforma concluído",
  "tour.restarted": "Tour da plataforma reiniciado",
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

const PREFIX_PATTERNS: Array<[string, string]> = [
  ["deployment.", "Implantação"],
  ["github.", "GitHub"],
  ["easypanel.", "EasyPanel"],
  ["audit.", "Auditoria"],
  ["auth.login", "Login"],
  ["auth.mfa", "Autenticação em duas etapas"],
  ["auth.session", "Sessão"],
  ["auth.password", "Senha"],
  ["auth.", "Autenticação"],
  ["admin.tenant", "Empresa (admin)"],
  ["admin.membership", "Membro"],
  ["admin.impersonate", "Impersonação"],
  ["admin.cost", "Financeiro"],
  ["admin.plan", "Plano"],
  ["admin.", "Administração"],
  ["company.", "Empresa"],
  ["tenant.", "Empresa"],
  ["security.", "Segurança"],
  ["whatsapp.", "WhatsApp"],
  ["ai.", "IA"],
  ["learning.", "Aprendizado"],
  ["contact.", "Contato"],
  ["conversation.", "Conversa"],
  ["automation.", "Automação"],
];

/**
 * Traduz o eventCode técnico em um título amigável e legível em pt-BR.
 */
export function humanizeAuditAction(action: string): string {
  if (!action) return "Evento";
  const trimmed = action.trim();
  if (EXACT_TITLES[trimmed]) return EXACT_TITLES[trimmed];

  for (const [prefix, label] of PREFIX_PATTERNS) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).replace(/[._]/g, " ").trim();
      if (!rest) return label;
      return `${label}: ${rest.charAt(0).toUpperCase() + rest.slice(1)}`;
    }
  }

  return trimmed
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Classifica a severidade semântica oficial: Sucesso | Informação | Atenção | Falha | Crítico
 */
export function auditSeverity(
  action: string,
  serverSeverity?: string | null
): AuditSeverityInfo {
  // Se o backend já enviou severidade calculada, mapeia diretamente
  if (serverSeverity) {
    switch (serverSeverity.toUpperCase()) {
      case "CRITICAL":
        return { tone: "danger", label: "Crítico" };
      case "FAIL":
        return { tone: "danger", label: "Falha" };
      case "WARNING":
        return { tone: "warning", label: "Atenção" };
      case "SUCCESS":
        return { tone: "success", label: "Sucesso" };
      case "INFO":
      default:
        return { tone: "info", label: "Informação" };
    }
  }

  const a = (action || "").toLowerCase();

  // 1. Crítico
  if (
    /threat|compromise|tamper|impersonation_start|sessions\.revoked_all/.test(a) ||
    (/user\.(blocked|suspended)/.test(a) && !/unblock|reactivat/.test(a)) ||
    (/company\.(blocked|suspended|deleted)/.test(a) && !/unblock|reactivat/.test(a))
  ) {
    return { tone: "danger", label: "Crítico" };
  }

  // 2. Falha
  if (
    /failed|failure|rejected|denied|unhealthy|error|clear_failed|rollback_failed/.test(a)
  ) {
    return { tone: "danger", label: "Falha" };
  }

  // 3. Atenção
  if (
    /cleared|clear_requested|rollback|rotated|archive|deletion_requested|mfa\.disabled|password\.changed|session\.revoked|access_policy_updated|due_date_changed|plan_changed/.test(
      a
    )
  ) {
    return { tone: "warning", label: "Atenção" };
  }

  // 4. Sucesso
  if (
    /completed|succeeded|verified|healthy|reactivated|unblocked|payment_registered|login$/.test(
      a
    )
  ) {
    return { tone: "success", label: "Sucesso" };
  }

  // 5. Informação
  return { tone: "info", label: "Informação" };
}

/**
 * Formata endereço IP informando se pertence à rede interna / proxy
 */
export function formatAuditIp(ip?: string | null): string {
  if (!ip) return "—";
  const clean = ip.trim();
  if (
    /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(clean) ||
    clean === "localhost"
  ) {
    return `Rede interna (${clean})`;
  }
  return clean;
}

