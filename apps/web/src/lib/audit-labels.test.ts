import { describe, expect, it } from "vitest";
import { humanizeAuditAction, auditSeverity, formatAuditIp } from "./audit-labels";
import { pluralizePt } from "./utils";

describe("Audit Labels & Formatters", () => {
  describe("humanizeAuditAction", () => {
    it("humaniza eventos exatos conhecidos em pt-BR", () => {
      expect(humanizeAuditAction("auth.login")).toBe("Login administrativo realizado");
      expect(humanizeAuditAction("auth.logout")).toBe("Logout administrativo realizado");
      expect(humanizeAuditAction("admin.impersonate")).toBe("Acesso como empresa iniciado");
      expect(humanizeAuditAction("admin.impersonate.stop")).toBe("Acesso como empresa encerrado");
      expect(humanizeAuditAction("tenant.onboarding.completed")).toBe("Configuração da empresa concluída");
      expect(humanizeAuditAction("auth.mfa.enabled")).toBe("Autenticação em duas etapas ativada");
      expect(humanizeAuditAction("auth.2fa.enabled")).toBe("Autenticação em duas etapas ativada");
      expect(humanizeAuditAction("auth.password.changed")).toBe("Senha de acesso alterada");
      expect(humanizeAuditAction("company.created")).toBe("Empresa criada");
      expect(humanizeAuditAction("user.created")).toBe("Novo usuário cadastrado");
      expect(humanizeAuditAction("subscription.created")).toBe("Assinatura criada");

      // Deploy, GitHub, EasyPanel, Auditoria
      expect(humanizeAuditAction("deployment.started")).toBe("Implantação iniciada");
      expect(humanizeAuditAction("deployment.completed")).toBe("Implantação concluída");
      expect(humanizeAuditAction("deployment.failed")).toBe("Implantação falhou");
      expect(humanizeAuditAction("deployment.rollback_completed")).toBe("Reversão de versão concluída");
      expect(humanizeAuditAction("deployment.history.cleared")).toBe("Histórico de implantações limpo");
      expect(humanizeAuditAction("github_updates.cleared")).toBe("Histórico recente do GitHub limpo");
      expect(humanizeAuditAction("github.connection.tested")).toBe("Conexão com o GitHub testada");
      expect(humanizeAuditAction("easypanel.connection.tested")).toBe("Conexão com o EasyPanel testada");
      expect(humanizeAuditAction("easypanel.configuration.updated")).toBe("Configuração do EasyPanel atualizada");
      expect(humanizeAuditAction("audit.history.cleared")).toBe("Histórico de auditoria limpo");
    });

    it("aplica prefixos ou fallback seguro para eventos não mapeados diretamente", () => {
      expect(humanizeAuditAction("whatsapp.session.disconnected")).toContain("WhatsApp");
      expect(humanizeAuditAction("custom_event_without_prefix")).toBe("Custom Event Without Prefix");
      expect(humanizeAuditAction("")).toBe("Evento");
    });
  });

  describe("auditSeverity", () => {
    it("classifica corretamente as 5 severidades semânticas oficiais", () => {
      expect(auditSeverity("auth.login").label).toBe("Sucesso");
      expect(auditSeverity("deployment.completed").label).toBe("Sucesso");
      expect(auditSeverity("deployment.started").label).toBe("Informação");
      expect(auditSeverity("deployment.history.cleared").label).toBe("Atenção");
      expect(auditSeverity("audit.history.cleared").label).toBe("Atenção");
      expect(auditSeverity("deployment.failed").label).toBe("Falha");
      expect(auditSeverity("auth.login.failed").label).toBe("Falha");
      expect(auditSeverity("company.blocked").label).toBe("Crítico");
      expect(auditSeverity("security.threat_detected").label).toBe("Crítico");
    });

    it("respeita a severidade vinda do backend", () => {
      expect(auditSeverity("custom.action", "CRITICAL")).toEqual({ tone: "danger", label: "Crítico" });
      expect(auditSeverity("custom.action", "FAIL")).toEqual({ tone: "danger", label: "Falha" });
      expect(auditSeverity("custom.action", "WARNING")).toEqual({ tone: "warning", label: "Atenção" });
      expect(auditSeverity("custom.action", "SUCCESS")).toEqual({ tone: "success", label: "Sucesso" });
      expect(auditSeverity("custom.action", "INFO")).toEqual({ tone: "info", label: "Informação" });
    });
  });

  describe("formatAuditIp", () => {
    it("identifica IPs locais e de rede interna", () => {
      expect(formatAuditIp("127.0.0.1")).toContain("Rede interna");
      expect(formatAuditIp("::1")).toContain("Rede interna");
      expect(formatAuditIp("192.168.1.10")).toContain("Rede interna");
      expect(formatAuditIp("200.189.40.10")).toBe("200.189.40.10");
      expect(formatAuditIp(null)).toBe("—");
    });
  });

  describe("pluralizePt", () => {
    it("retorna singular para 1 e -1", () => {
      expect(pluralizePt(1, "empresa", "empresas")).toBe("empresa");
      expect(pluralizePt(-1, "empresa", "empresas")).toBe("empresa");
      expect(pluralizePt(1, "cliente", "clientes")).toBe("cliente");
    });

    it("retorna plural para 0 e 2+", () => {
      expect(pluralizePt(0, "empresa", "empresas")).toBe("empresas");
      expect(pluralizePt(2, "empresa", "empresas")).toBe("empresas");
      expect(pluralizePt(5, "pagante", "pagantes")).toBe("pagantes");
      expect(pluralizePt(10, "execução acumulada", "execuções acumuladas")).toBe("execuções acumuladas");
    });
  });
});
