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

  // Equipe / Membros
  "team.invite": "Convite para equipe enviado",
  "team.invite_revoke": "Convite para equipe revogado",
  "team.invite.created": "Convite para equipe enviado",
  "team.invite.revoked": "Convite para equipe revogado",
  "team.member.added": "Membro adicionado à equipe",
  "team.member.removed": "Membro removido da equipe",
  "team.member.role_updated": "Função de membro atualizada",

  // Chaves de API e Webhooks
  "api_key.created": "Chave de API criada",
  "api_key.revoked": "Chave de API revogada",
  "webhook.created": "Webhook cadastrado",
  "webhook.updated": "Webhook atualizado",
  "webhook.deleted": "Webhook removido",
  "webhook.secret_rotated": "Chave secreta do webhook rotacionada",
  "webhook.test_sent": "Disparo de teste do webhook enviado",

  // Notas de Atualização / Changelog
  "changelog.created": "Nota de atualização criada",
  "changelog.published": "Nota de atualização publicada",
  "changelog.updated": "Nota de atualização editada",
  "changelog.archived": "Nota de atualização arquivada",

  // Leads Comerciais
  "admin.lead.convert": "Lead comercial convertido em empresa",
  "admin.lead.update_status": "Status do lead comercial atualizado",

  // Finanças
  "finance.charge.create": "Cobrança financeira gerada",
  "finance.charge.delete": "Cobrança financeira removida",
  "finance.cost.create": "Custo operacional registrado",
  "finance.cost.update": "Custo operacional atualizado",
  "finance.cost.delete": "Custo operacional removido",

  // Contatos e Conhecimento
  "contact.create": "Contato cadastrado",
  "contact.created": "Contato cadastrado",
  "contact.update": "Contato atualizado",
  "contact.updated": "Contato atualizado",
  "contact.delete": "Contato excluído",
  "contact.deleted": "Contato excluído",
  "contact.import": "Importação de contatos realizada",
  "knowledge.import": "Base de conhecimento importada",
  "knowledge.bulk_delete": "Exclusão em lote de conhecimento",
  "tenant_ai.config_updated": "Configurações de IA da empresa atualizadas",
  "agent.config_imported": "Configuração do agente importada",
  "STAGE_CHANGE": "Alteração de etapa no funil",
  "stage_change": "Alteração de etapa no funil",
  "auth.gateway.signin": "Login via gateway realizado",
  "auth.password_reset": "Redefinição de senha solicitada",
  "custom.special_search_event": "Evento de busca especial",

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
  "admin.impersonate": "Acesso administrativo a empresa (Impersonação)",
  "admin.impersonate.stop": "Encerramento de acesso a empresa",

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
  "company.deletion_cancelled": "Exclusão de empresa cancelada",
  "company.deletion_scheduled": "Exclusão de empresa agendada",
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
  "plan.deleted": "Plano excluído",
  "plan.duplicated": "Plano duplicado",
  "admin.plan.create": "Plano criado",
  "admin.plan.update": "Plano atualizado",
  "subscription.created": "Assinatura criada",
  "subscription.updated": "Assinatura atualizada",
  "admin.cost.create": "Custo operacional registrado",
  "admin.cost.update": "Custo operacional atualizado",
  "platform.access_policy_updated": "Política global de acesso atualizada",
  "financial_access_policy.updated": "Política de acesso financeiro atualizada",
  "financial_access_restriction.applied": "Restrição financeira de acesso aplicada",
  "financial_access_restriction.removed": "Restrição financeira de acesso removida",

  // Recursos Operacionais
  "channel.connected": "Canal conectado",
  "channel.disconnected": "Canal desconectado",
  "automation.delete": "Fluxo excluído",
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

/**
 * Formata data e horário para a tabela em desktop como 'DD/MM/AAAA · HH:mm'
 */
export function formatAuditDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const dateStr = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} · ${timeStr}`;
}

/**
 * Traduz o código da categoria para label legível em pt-BR
 */
export function auditCategoryLabel(category?: string | null): string {
  if (!category) return "Geral";
  switch (category.toUpperCase()) {
    case "AUTH":
      return "Autenticação";
    case "ADMIN":
      return "Administração";
    case "COMPANY":
      return "Empresas";
    case "PLAN":
      return "Planos";
    case "FINANCE":
      return "Financeiro";
    case "DEPLOY":
      return "Deploy";
    case "GITHUB":
      return "GitHub";
    case "EASYPANEL":
      return "EasyPanel";
    case "SECURITY":
      return "Segurança";
    default:
      return category;
  }
}



